"""Pre-built demo configurations and paper loading (cached + live fallback)."""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "demo_papers"

DEMOS = [
    {
        "id": "liver_fibrosis",
        "title": "Drug Repurposing for Liver Fibrosis",
        "domain": "Hepatology / Drug Repurposing",
        "description": "Find approved drugs that could be repurposed to treat liver "
        "fibrosis by targeting TGF-β signaling, stellate-cell activation, or "
        "inflammatory pathways.",
        "goal": "Identify approved drugs that could be repurposed to treat liver "
        "fibrosis by targeting TGF-β signaling, hepatic stellate cell activation, "
        "or inflammatory pathways. Focus on drugs already approved for other fibrotic "
        "conditions.",
        "source": "PubMed",
        "search_queries": [
            "TGF-beta liver fibrosis stellate cell activation",
            "liver fibrosis drug repurposing approved compounds",
            "nintedanib pirfenidone hepatic fibrosis antifibrotic",
            "hepatic stellate cell quiescence reversal pharmacology",
            "extracellular matrix remodeling liver fibrosis therapy",
        ],
        "max_hypotheses": 18,
        "debate_rounds": 3,
    },
    {
        "id": "solid_state_battery",
        "title": "Materials Discovery: Solid-State Battery Electrolytes",
        "domain": "Materials Science / Energy Storage",
        "description": "Discover unexplored material combinations or interface "
        "engineering strategies to overcome ionic conductivity and interface stability "
        "limits in solid-state lithium electrolytes.",
        "goal": "Identify unexplored material combinations or interface engineering "
        "strategies to overcome ionic conductivity and interface stability limitations "
        "in solid-state lithium battery electrolytes.",
        "source": "ArXiv",
        "search_queries": [
            "LLZO garnet solid electrolyte ionic conductivity grain boundary",
            "LGPS sulfide solid electrolyte interface stability lithium",
            "solid electrolyte interphase lithium metal anode dendrite",
            "halide oxide composite solid electrolyte battery",
            "machine learning materials discovery solid electrolyte",
        ],
        "max_hypotheses": 18,
        "debate_rounds": 3,
    },
]

DEMO_BY_ID = {d["id"]: d for d in DEMOS}


def load_cached_papers(demo_id: str) -> list[dict]:
    path = CACHE_DIR / f"{demo_id}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return []


# ---------- live fetch (used for custom non-demo goals) ----------
async def fetch_pubmed(query: str, n: int = 6) -> list[dict]:
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
            params={"db": "pubmed", "term": query, "retmax": n,
                    "retmode": "json", "sort": "relevance"},
        )
        ids = r.json().get("esearchresult", {}).get("idlist", [])
        if not ids:
            return out
        r = await c.get(
            "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi",
            params={"db": "pubmed", "id": ",".join(ids),
                    "retmode": "xml", "rettype": "abstract"},
        )
        root = ET.fromstring(r.text)
        for art in root.findall(".//PubmedArticle"):
            title = art.findtext(".//ArticleTitle") or ""
            parts = [a.text or "" for a in art.findall(".//Abstract/AbstractText")]
            abstract = " ".join(p for p in parts if p).strip()
            pmid = art.findtext(".//PMID") or ""
            if title and len(abstract) > 120:
                out.append({"source": "PubMed", "ext_id": pmid,
                            "title": title.strip(), "abstract": abstract})
    return out


async def fetch_arxiv(query: str, n: int = 6) -> list[dict]:
    out: list[dict] = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.get(
            "https://export.arxiv.org/api/query",
            params={"search_query": query, "max_results": n, "sortBy": "relevance"},
        )
        root = ET.fromstring(r.text)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for e in root.findall("a:entry", ns):
            title = re.sub(r"\s+", " ",
                           (e.findtext("a:title", default="", namespaces=ns) or "")).strip()
            summ = re.sub(r"\s+", " ",
                          (e.findtext("a:summary", default="", namespaces=ns) or "")).strip()
            eid = (e.findtext("a:id", default="", namespaces=ns) or "").strip()
            if title and len(summ) > 120:
                out.append({"source": "ArXiv", "ext_id": eid.split("/")[-1],
                            "title": title, "abstract": summ})
    return out


def dedup(papers: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for p in papers:
        k = p["title"].lower()[:60]
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out
