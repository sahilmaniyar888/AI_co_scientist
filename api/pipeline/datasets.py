"""
Public dataset discovery — NCBI GEO (gene expression) + Zenodo (open research data).

Lets the engine propose *computational* validation of a hypothesis using existing
data, avoiding costly new experiments. Both APIs are free and key-less.
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx


async def search_geo(client: httpx.AsyncClient, query: str, n: int = 6) -> list[dict]:
    out: list[dict] = []
    try:
        r = await client.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "gds", "term": query, "retmax": n, "retmode": "json"},
        )
        ids = r.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return out
        r = await client.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
            params={"db": "gds", "id": ",".join(ids), "retmode": "json"},
        )
        res = r.json().get("result", {})
        for uid in res.get("uids", []):
            d = res.get(uid, {})
            acc = d.get("accession", "")
            out.append({
                "source": "GEO", "accession": acc,
                "title": d.get("title", "")[:160],
                "detail": f"{d.get('taxon','')} · {d.get('gdstype','')} · "
                          f"{d.get('n_samples','?')} samples",
                "url": f"https://www.ncbi.nlm.nih.gov/gds/?term={acc}" if acc else "",
            })
    except Exception:
        pass
    return out


async def search_zenodo(client: httpx.AsyncClient, query: str, n: int = 6) -> list[dict]:
    out: list[dict] = []
    try:
        r = await client.get(
            "https://zenodo.org/api/records",
            params={"q": query, "type": "dataset", "size": n, "sort": "bestmatch"},
        )
        for rec in r.json().get("hits", {}).get("hits", []):
            meta = rec.get("metadata", {})
            out.append({
                "source": "Zenodo", "accession": str(rec.get("id", "")),
                "title": (meta.get("title", "") or "")[:160],
                "detail": f"{meta.get('resource_type', {}).get('title', 'dataset')}",
                "url": rec.get("links", {}).get("self_html", ""),
            })
    except Exception:
        pass
    return out


async def discover(query: str, bio: bool = True) -> list[dict]:
    """Search GEO (if biological) + Zenodo for datasets relevant to the query."""
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as c:
        tasks = [search_zenodo(c, query, 6)]
        if bio:
            tasks.append(search_geo(c, query, 6))
        results = await asyncio.gather(*tasks, return_exceptions=True)
    out: list[dict] = []
    for r in results:
        if isinstance(r, list):
            out.extend(r)
    return out
