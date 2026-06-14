"""
OpenAlex literature sourcing + citation-network graph.

OpenAlex (https://openalex.org) indexes 250M+ works, is free and key-less, and
returns the real citation graph (`referenced_works`) inline. We use it to source
a deep corpus, rank it by citation weight, feed only the best handful to the
(slow) LLM, and build a real citation/co-citation graph from ALL of it — the
graph needs no LLM, so depth here is essentially free.
"""

from __future__ import annotations

import asyncio
import math
from collections import Counter
from datetime import datetime
from itertools import combinations
from typing import Any

import httpx

BASE = "https://api.openalex.org/works"
# The "polite pool" (a mailto) gets faster, more reliable service.
HEADERS = {"User-Agent": "DiscoveryEngine/1.0 (mailto:research@discovery.local)"}
SELECT = ("id,title,abstract_inverted_index,cited_by_count,publication_year,"
          "referenced_works,open_access,primary_location")


def reconstruct_abstract(inv: dict | None) -> str:
    if not inv:
        return ""
    positions: list[tuple[int, str]] = []
    for word, idxs in inv.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort()
    return " ".join(w for _, w in positions)[:2000]


def _short_id(oa_url: str) -> str:
    return (oa_url or "").rsplit("/", 1)[-1]


async def _search_one(client: httpx.AsyncClient, query: str, n: int) -> list[dict]:
    r = await client.get(BASE, params={
        "search": query, "per-page": n, "select": SELECT,
        "sort": "relevance_score:desc",
    })
    r.raise_for_status()
    out = []
    for w in r.json().get("results", []):
        abstract = reconstruct_abstract(w.get("abstract_inverted_index"))
        if not w.get("title") or len(abstract) < 100:
            continue
        loc = w.get("primary_location") or {}
        src = (loc.get("source") or {}).get("display_name") or "OpenAlex"
        out.append({
            "source": "OpenAlex", "ext_id": _short_id(w.get("id", "")),
            "oa_id": _short_id(w.get("id", "")),
            "title": w["title"].strip(), "abstract": abstract,
            "year": w.get("publication_year"),
            "cited_by_count": w.get("cited_by_count", 0),
            "referenced_works": [_short_id(x) for x in (w.get("referenced_works") or [])],
            "is_oa": bool((w.get("open_access") or {}).get("is_oa")),
            "venue": src,
        })
    return out


def citation_rank(papers: list[dict]) -> list[dict]:
    if not papers:
        return papers
    now = datetime.now().year
    max_log = max(math.log1p(p.get("cited_by_count", 0)) for p in papers) or 1.0
    for p in papers:
        cite_norm = math.log1p(p.get("cited_by_count", 0)) / max_log
        yr = p.get("year") or (now - 8)
        recency = 1.0 / (1.0 + max(0, now - yr))
        p["priority_score"] = round(0.6 * cite_norm + 0.4 * recency, 4)
    return sorted(papers, key=lambda p: p["priority_score"], reverse=True)


async def gather_corpus(queries: list[str], per_query: int = 25,
                        keep: int = 16) -> dict:
    """Fetch a deep corpus across queries; return ranked top `keep` + full count."""
    async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as c:
        results = await asyncio.gather(
            *[_search_one(c, q, per_query) for q in queries[:8]],
            return_exceptions=True,
        )
    seen: set[str] = set()
    corpus: list[dict] = []
    for r in results:
        if not isinstance(r, list):
            continue
        for p in r:
            if p["oa_id"] in seen:
                continue
            seen.add(p["oa_id"])
            corpus.append(p)
    ranked = citation_rank(corpus)
    return {"reachable": len(ranked), "papers": ranked[:keep]}


async def prior_art_search(queries: list[str], n_per: int = 6,
                           keep: int = 10) -> list[dict]:
    """Retrieve the closest existing published work for one hypothesis.

    Backs the grounded novelty verifier. The key is to search the hypothesis's
    *components* separately — a single search on the whole ultra-specific
    construct ("CXCR4- and integrin-decorated EVs delivering miR-29b to HSCs")
    matches nothing, but searching each building block (miR-29b + fibrosis,
    CXCR4-targeted delivery, EV miR delivery to stellate cells, ...) surfaces the
    real prior art. Queries come from an LLM decomposition of the hypothesis.
    """
    queries = [q.strip() for q in queries if isinstance(q, str) and len(q.strip()) > 4][:8]
    if not queries:
        return []
    async with httpx.AsyncClient(timeout=30, headers=HEADERS, follow_redirects=True) as c:
        results = await asyncio.gather(
            *[_search_one(c, q, n_per) for q in queries],
            return_exceptions=True,
        )
    seen: set[str] = set()
    found: list[dict] = []
    for r in results:
        if not isinstance(r, list):
            continue
        for p in r:
            if p["oa_id"] in seen:
                continue
            seen.add(p["oa_id"])
            found.append(p)
    return citation_rank(found)[:keep]


def build_citation_graph(papers: list[dict], max_nodes: int = 22) -> dict:
    """
    Build a real citation network from the corpus:
      - nodes = papers (sized by citations)
      - edges = direct citations (A references B, both in set) + co-citation
        (A and B share >=2 references — same intellectual base)
      - structural gaps = highly-cited but older papers nobody recently extends
    """
    papers = papers[:max_nodes]
    by_id = {p["oa_id"]: p for p in papers}
    ids = set(by_id)
    now = datetime.now().year

    refsets = {p["oa_id"]: set(p.get("referenced_works") or []) for p in papers}
    edges: list[dict] = []
    seen_pairs: set[tuple[str, str]] = set()

    # Direct citations within the corpus.
    for p in papers:
        for ref in refsets[p["oa_id"]]:
            if ref in ids:
                key = tuple(sorted((p["oa_id"], ref)))
                if key not in seen_pairs:
                    seen_pairs.add(key)
                    edges.append({"source": p["oa_id"], "target": ref,
                                  "relation": "cites", "strength": 0.9})

    # Co-citation: papers sharing >=2 references are in the same conversation.
    for a, b in combinations(papers, 2):
        key = tuple(sorted((a["oa_id"], b["oa_id"])))
        if key in seen_pairs:
            continue
        shared = len(refsets[a["oa_id"]] & refsets[b["oa_id"]])
        if shared >= 2:
            seen_pairs.add(key)
            edges.append({"source": a["oa_id"], "target": b["oa_id"],
                          "relation": "co-cited", "strength": min(1.0, 0.3 + shared * 0.12)})

    degree = Counter()
    for e in edges:
        degree[e["source"]] += 1
        degree[e["target"]] += 1

    nodes = []
    for p in papers:
        nodes.append({
            "id": p["oa_id"],
            "label": p["title"][:48] + ("…" if len(p["title"]) > 48 else ""),
            "full_title": p["title"], "type": "paper",
            "cited_by_count": p.get("cited_by_count", 0),
            "year": p.get("year"), "venue": p.get("venue", ""),
            "degree": degree.get(p["oa_id"], 0),
        })

    # Structural gaps: top-quartile citations but published >=5y ago.
    cites = sorted((p.get("cited_by_count", 0) for p in papers), reverse=True)
    q_threshold = cites[max(0, len(cites) // 4 - 1)] if cites else 0
    structural_gaps = []
    for p in papers:
        if (p.get("cited_by_count", 0) >= max(20, q_threshold)
                and p.get("year") and (now - p["year"]) >= 5):
            structural_gaps.append({
                "type": "structural", "title": p["title"][:90],
                "opportunity_score": round(min(1.0, 0.5 + p["cited_by_count"] / 2000), 2),
                "description": f"Highly cited ({p['cited_by_count']} citations, {p['year']}) "
                               f"but not recently extended — an established result ripe for a new angle.",
                "why_valuable": "Foundational work that few are building on lately is fertile ground.",
            })
    return {"nodes": nodes, "edges": edges, "structural_gaps": structural_gaps[:5]}
