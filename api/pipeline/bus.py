"""Per-run SSE event bus with history replay for late subscribers."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any


class EventBus:
    def __init__(self) -> None:
        self.history: list[dict[str, Any]] = []
        self.subscribers: list[asyncio.Queue] = []
        self.done = False

    async def emit(self, event: str, data: dict[str, Any]) -> None:
        item = {"event": event, "data": data, "ts": time.time()}
        self.history.append(item)
        for q in list(self.subscribers):
            await q.put(item)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        # Replay history so a client that connects late still sees everything.
        for item in self.history:
            q.put_nowait(item)
        if self.done:
            q.put_nowait(None)
        self.subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self.subscribers:
            self.subscribers.remove(q)

    async def close(self) -> None:
        self.done = True
        for q in list(self.subscribers):
            await q.put(None)


# Global registry of run_id -> EventBus
_buses: dict[str, EventBus] = {}


def get_bus(run_id: str) -> EventBus:
    bus = _buses.get(run_id)
    if bus is None:
        bus = EventBus()
        _buses[run_id] = bus
    return bus


def sse_format(item: dict[str, Any]) -> str:
    return f"event: {item['event']}\ndata: {json.dumps(item['data'])}\n\n"
