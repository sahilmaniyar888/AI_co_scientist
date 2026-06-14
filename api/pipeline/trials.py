"""
ClinicalTrials.gov prior-failure search.

Backs the Reality-Check agent: for a drug-repurposing / therapeutic hypothesis,
we ask the registry whether the proposed intervention has *already been tried*
for this condition — and especially whether those trials were TERMINATED,
WITHDRAWN, or SUSPENDED. A hypothesis that recombines known parts AND has a
failed trial behind it is a very different bet from one that is genuinely
untested. The v2 API is free, key-less, and returns clean JSON.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx

BASE = "https://clinicaltrials.gov/api/v2/studies"
HEADERS = {"User-Agent": "DiscoveryEngine/1.0 (mailto:research@discovery.local)"}

# Statuses that signal a prior attempt did not pan out.
_FAILED = {"TERMINATED", "WITHDRAWN", "SUSPENDED"}


def _g(d: dict, *path, default=None):
    cur: Any = d
    for k in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
    return cur if cur is not None else default


def _parse_study(s: dict) -> dict:
    ps = s.get("protocolSection", {}) or {}
    status = _g(ps, "statusModule", "overallStatus", default="") or ""
    interventions = [
        i.get("name", "") for i in
        (_g(ps, "armsInterventionsModule", "interventions", default=[]) or [])
        if isinstance(i, dict)
    ]
    return {
        "nct_id": _g(ps, "identificationModule", "nctId", default=""),
        "title": _g(ps, "identificationModule", "briefTitle", default=""),
        "status": status,
        "failed": status.upper() in _FAILED,
        "why_stopped": _g(ps, "statusModule", "whyStopped", default="") or "",
        "phase": ", ".join(_g(ps, "designModule", "phases", default=[]) or []),
        "conditions": _g(ps, "conditionsModule", "conditions", default=[]) or [],
        "interventions": [x for x in interventions if x],
        "completion_year": (_g(ps, "statusModule", "completionDateStruct",
                               "date", default="") or "")[:4],
        "url": f"https://clinicaltrials.gov/study/{_g(ps, 'identificationModule', 'nctId', default='')}",
    }


async def _search_one(client: httpx.AsyncClient, term: str, n: int) -> list[dict]:
    r = await client.get(BASE, params={
        "query.term": term, "pageSize": n,
        "fields": ("protocolSection.identificationModule,"
                   "protocolSection.statusModule,"
                   "protocolSection.designModule,"
                   "protocolSection.conditionsModule,"
                   "protocolSection.armsInterventionsModule"),
    })
    r.raise_for_status()
    return [_parse_study(s) for s in r.json().get("studies", [])]


async def search_trials(queries: list[str], n_per: int = 8,
                        keep: int = 12) -> list[dict]:
    """Search the registry across component queries; failed trials ranked first."""
    queries = [q.strip() for q in queries if isinstance(q, str) and len(q.strip()) > 4][:6]
    if not queries:
        return []
    async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as c:
        results = await asyncio.gather(
            *[_search_one(c, q, n_per) for q in queries],
            return_exceptions=True,
        )
    seen: set[str] = set()
    out: list[dict] = []
    for r in results:
        if not isinstance(r, list):
            continue
        for t in r:
            if not t.get("nct_id") or t["nct_id"] in seen:
                continue
            seen.add(t["nct_id"])
            out.append(t)
    # Surface terminated/withdrawn trials first — they carry the strongest signal.
    out.sort(key=lambda t: (not t["failed"], t.get("completion_year", "")), reverse=False)
    return out[:keep]
