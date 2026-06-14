"""
Async K2-Think-V2 client.

K2-Think-V2 streams its reasoning first (WITHOUT an opening <think> tag) and
closes it with a literal `</think>` tag, after which the final answer follows.
This module splits on `</think>` to separate the reasoning trace from the final
answer, streams reasoning tokens to an optional event bus, and robustly extracts
JSON from the final answer (with one automatic retry).
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Optional

import httpx

K2_API_KEY = os.getenv("K2_API_KEY", "")
K2_BASE_URL = os.getenv("K2_BASE_URL", "https://api.k2think.ai/v1")
K2_MODEL = os.getenv("K2_MODEL", "MBZUAI-IFM/K2-Think-v2")

# Single shared async client (created lazily, reused for connection pooling).
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=K2_BASE_URL,
            headers={
                "Authorization": f"Bearer {K2_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(240.0, connect=20.0),
        )
    return _client


async def aclose() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def split_think(content: str) -> tuple[str, str]:
    """Return (think_trace, final_answer) from a raw K2 response."""
    if "</think>" in content:
        think, _, answer = content.partition("</think>")
        think = think.replace("<think>", "").strip()
        return think, answer.strip()
    return "", content.strip()


def extract_json(text: str) -> Optional[Any]:
    """Best-effort extraction of a JSON object/array from model output."""
    if not text:
        return None
    s = text.strip()
    # Strip markdown code fences.
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s).strip()
    # Fast path.
    try:
        return json.loads(s)
    except Exception:
        pass
    # Find the outermost {...} or [...].
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = s.find(open_ch)
        end = s.rfind(close_ch)
        if start != -1 and end != -1 and end > start:
            candidate = s[start : end + 1]
            try:
                return json.loads(candidate)
            except Exception:
                # Remove trailing commas which models sometimes emit.
                cleaned = re.sub(r",(\s*[}\]])", r"\1", candidate)
                try:
                    return json.loads(cleaned)
                except Exception:
                    continue
    return None


async def call(
    system: str,
    user: str,
    *,
    temperature: float = 0.7,
    max_tokens: int = 9000,
    bus: Any = None,
    agent: str = "agent",
    stream: bool = True,
) -> dict[str, Any]:
    """
    Call K2 and return {"think": str, "text": str, "duration_ms": int}.

    If `bus` is provided, emits agent_started / agent_thinking / agent_output
    events. Reasoning tokens are streamed live as agent_thinking chunks.
    """
    client = _get_client()
    started = time.time()
    if bus is not None:
        await bus.emit("agent_started", {"agent": agent, "ts": started})

    payload = {
        "model": K2_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": stream,
    }

    raw = ""
    try:
        if stream:
            raw = await _stream_call(client, payload, bus, agent)
        else:
            resp = await client.post("/chat/completions", json=payload)
            resp.raise_for_status()
            data = resp.json()
            raw = data["choices"][0]["message"]["content"] or ""
    except Exception as exc:  # noqa: BLE001 - never crash the pipeline
        if bus is not None:
            await bus.emit("agent_error", {"agent": agent, "error": str(exc)})
        return {"think": "", "text": "", "error": str(exc),
                "duration_ms": int((time.time() - started) * 1000)}

    think, answer = split_think(raw)
    return {
        "think": think,
        "text": answer,
        "raw": raw,
        "duration_ms": int((time.time() - started) * 1000),
    }


async def _stream_call(
    client: httpx.AsyncClient, payload: dict, bus: Any, agent: str
) -> str:
    """Stream a chat completion, emitting reasoning chunks to the bus."""
    chunks: list[str] = []
    buffer = ""
    last_emit = 0.0
    seen_close = False
    async with client.stream("POST", "/chat/completions", json=payload) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
                delta = obj["choices"][0]["delta"].get("content") or ""
            except Exception:
                continue
            if not delta:
                continue
            chunks.append(delta)
            if bus is not None and not seen_close:
                buffer += delta
                if "</think>" in buffer:
                    seen_close = True
                    pre = buffer.split("</think>")[0]
                    if pre:
                        await bus.emit("agent_thinking", {"agent": agent, "chunk": pre})
                    buffer = ""
                else:
                    now = time.time()
                    # Throttle to keep SSE traffic reasonable.
                    if len(buffer) > 60 or (now - last_emit) > 0.25:
                        await bus.emit("agent_thinking", {"agent": agent, "chunk": buffer})
                        buffer = ""
                        last_emit = now
    return "".join(chunks)


MAX_TOKEN_CEILING = 26000


async def call_json(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = 12000,
    bus: Any = None,
    agent: str = "agent",
    stream: bool = True,
) -> dict[str, Any]:
    """
    Call K2 expecting JSON output, with truncation-aware retry.

    K2-Think reasons verbosely; on complex tasks it can exhaust the token
    budget before ever closing </think> and emitting the answer. We detect that
    (no </think> in the raw output) and retry with a much larger budget.
    """
    res = await call(
        system, user, temperature=temperature, max_tokens=max_tokens,
        bus=bus, agent=agent, stream=stream,
    )
    parsed = extract_json(res.get("text", ""))
    if parsed is None and not res.get("error"):
        raw = res.get("raw", "")
        truncated = "</think>" not in raw  # reasoning ran past the budget
        if truncated:
            bigger = min(MAX_TOKEN_CEILING, max_tokens + 6000)
            res2 = await call(
                system, user, temperature=temperature, max_tokens=bigger,
                bus=bus, agent=agent, stream=stream,
            )
        else:
            retry_user = (
                user + "\n\nIMPORTANT: Your previous output could not be parsed. "
                "Return ONLY valid JSON. No preamble, no markdown fences."
            )
            res2 = await call(
                system, retry_user, temperature=0.3, max_tokens=max_tokens,
                bus=bus, agent=agent, stream=stream,
            )
        parsed = extract_json(res2.get("text", ""))
        if parsed is not None:
            res2["json"] = parsed
            return res2
        res = res2 if truncated else res
    res["json"] = parsed
    return res
