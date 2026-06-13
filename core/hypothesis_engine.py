from typing import Any, Dict, List, Optional
import json

from core.prompts import SYSTEM_PROMPTS


class HypothesisGenerator:
    """
    Uses K2 Think V2 to systematically generate and rank hypotheses.
    """

    def __init__(self, k2_client):
        self.client = k2_client

    # Populated after each call so callers can forward it as an SSE thinking event
    last_thinking_trace: str = ""

    def generate_hypothesis_space(
        self,
        literature_summary: str,
        research_question: str,
        num_hypotheses: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple competing hypotheses systematically.

        This is inspired by the "Strong Inference" methodology:
        Platt, J. R. (1964). Strong Inference. Science, 146(3642), 347-353.
        """

        system_prompt = SYSTEM_PROMPTS["hypothesis_generation"].replace(
            "__NUM_HYPOTHESES__",
            str(num_hypotheses),
        )

        user_message = f"""Research Question: {research_question}

Literature Summary:
{literature_summary}

Generate {num_hypotheses} competing hypotheses."""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            max_tokens=8000,
        )
        self.last_thinking_trace = response.get("thinking_trace", "")

        hypotheses = self._parse_hypotheses(response)
        if hypotheses is not None:
            return hypotheses

        # Retry once with stricter formatting constraints and lower temperature.
        retry_system_prompt = (
            system_prompt
            + "\n\nOutput must be valid JSON only. No prose, no markdown, no comments."
        )
        retry_response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=retry_system_prompt,
            temperature=0.2,
            max_tokens=8000,
        )
        if not self.last_thinking_trace:
            self.last_thinking_trace = retry_response.get("thinking_trace", "")

        hypotheses = self._parse_hypotheses(retry_response)
        if hypotheses is not None:
            return hypotheses

        combined_text = (
            f"first_final={response.get('final_response', '')}\n"
            f"first_thinking={response.get('thinking_trace', '')}\n"
            f"retry_final={retry_response.get('final_response', '')}\n"
            f"retry_thinking={retry_response.get('thinking_trace', '')}"
        ).strip()
        raise ValueError(
            "Model did not return valid hypothesis JSON. "
            f"Response excerpt: {combined_text[:500]}"
        )

    def _parse_hypotheses(self, response: Dict[str, str]) -> Optional[List[Dict[str, Any]]]:
        candidates = [
            response.get("final_response", ""),
            response.get("thinking_trace", ""),
        ]

        for candidate in candidates:
            parsed = self._extract_json_object(candidate)
            if parsed is None:
                continue
            if isinstance(parsed, dict):
                for key in ("hypotheses", "items", "data"):
                    value = parsed.get(key)
                    if isinstance(value, list) and not self._looks_like_placeholder_hypotheses(value):
                        return value
            if isinstance(parsed, list) and not self._looks_like_placeholder_hypotheses(parsed):
                return parsed
        return None

    def _looks_like_placeholder_hypotheses(self, items: List[Dict[str, Any]]) -> bool:
        if not items:
            return True

        first = items[0]
        if not isinstance(first, dict):
            return True

        placeholder_markers = (
            "A single, clear sentence stating the hypothesis",
            "Evidence 1 with specific citation or finding",
            "Contradiction 1 explaining why this might be wrong",
        )
        joined = json.dumps(first)
        return any(marker in joined for marker in placeholder_markers)

    def _extract_json_object(self, text: str) -> Optional[Any]:
        """
        Extract JSON list/dict from noisy model output.
        Prefers the largest JSON array found (most hypotheses) to avoid
        returning a partial result from early in the model's reasoning trace.
        """
        if not text:
            return None

        text = text.strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```")
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        # Fast path: content is already pure JSON.
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Slow path: collect ALL valid JSON objects/arrays embedded in the text,
        # then return the list with the most items (avoids picking a single
        # hypothesis dict that appears early in the thinking trace).
        decoder = json.JSONDecoder()
        candidates: list = []
        idx = 0
        while idx < len(text):
            if text[idx] not in "[{":
                idx += 1
                continue
            try:
                obj, end_idx = decoder.raw_decode(text[idx:])
                candidates.append(obj)
                idx += end_idx
            except json.JSONDecodeError:
                idx += 1

        if not candidates:
            return None

        # Prefer the list with the most entries; fall back to first candidate.
        lists = [c for c in candidates if isinstance(c, list)]
        if lists:
            return max(lists, key=len)
        return candidates[0]
