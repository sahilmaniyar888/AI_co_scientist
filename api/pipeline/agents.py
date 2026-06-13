"""
Scientific discovery agents. Each agent wraps a focused K2-Think call,
emits SSE events through the bus, and persists its reasoning trace.
"""

from __future__ import annotations

import asyncio
import re
from collections import Counter
from itertools import combinations
from typing import Any, Optional

from . import db, k2


async def _agent(
    run_id: str, name: str, system: str, user: str, bus: Any,
    *, temperature: float = 0.6, max_tokens: int = 9000,
) -> Any:
    """Run a JSON agent, log it, emit agent_output, return parsed JSON (or None)."""
    res = await k2.call_json(
        system, user, temperature=temperature, max_tokens=max_tokens,
        bus=bus, agent=name,
    )
    parsed = res.get("json")
    await db.log_agent(run_id, name, user, parsed, res.get("think", ""),
                       res.get("duration_ms", 0))
    if bus is not None:
        await bus.emit("agent_output", {"agent": name, "ok": parsed is not None})
    return parsed


# ---------------------------------------------------------------- Supervisor
SUPERVISOR_SYS = """You are the Supervisor of a multi-agent scientific discovery system.
Parse the research goal into a structured plan.
Return ONLY valid JSON, no preamble, no markdown fences.
Schema:
{
  "research_domain": string,
  "evaluation_criteria": ["novelty","feasibility","impact","testability","reproducibility"],
  "max_hypotheses": integer,
  "debate_rounds": integer,
  "focus_areas": [list of specific sub-topics to prioritize],
  "exclusions": [anything explicitly out of scope],
  "search_queries": [5 to 8 specific search queries for ArXiv and PubMed]
}"""


async def supervisor(run_id: str, goal: str, defaults: dict,
                     memory: Optional[dict], bus: Any) -> dict:
    mem = ""
    if memory:
        mem = (
            f"\n\nPrior research memory in this domain:\n{memory.get('summary','')}\n"
            f"Top prior hypotheses: {memory.get('top_hypotheses', [])}\n"
            "Extend beyond these; do not regenerate them."
        )
    user = (
        f"Research goal:\n{goal}\n\n"
        f"Defaults: max_hypotheses={defaults.get('max_hypotheses',18)}, "
        f"debate_rounds={defaults.get('debate_rounds',3)}.{mem}"
    )
    out = await _agent(run_id, "Supervisor", SUPERVISOR_SYS, user, bus, temperature=0.4)
    if not isinstance(out, dict):
        out = {}
    out.setdefault("research_domain", defaults.get("domain", "General Science"))
    # Counts are system controls, not the model's to inflate.
    out["max_hypotheses"] = max(8, min(30, int(defaults.get("max_hypotheses", 18))))
    out["debate_rounds"] = max(1, min(5, int(defaults.get("debate_rounds", 3))))
    if not out.get("search_queries"):
        out["search_queries"] = defaults.get("search_queries", [])
    return out


# ------------------------------------------------------- Literature extraction
EXTRACT_SYS = """Extract structured information from this scientific paper abstract.
Return ONLY valid JSON:
{
  "claims": [specific factual claims made],
  "methods": [experimental or computational methods used],
  "key_findings": [main results],
  "limitations": [stated or implied limitations],
  "future_work": [suggestions for follow-up research],
  "entities": [important biological/chemical/physical entities mentioned],
  "relationships": [{"from": entity, "relation": verb, "to": entity}]
}"""


async def extract_paper(run_id: str, paper: dict, bus: Any) -> dict:
    user = f"Title: {paper.get('title','')}\n\nAbstract: {paper.get('abstract','')}"
    out = await _agent(run_id, "Literature Scout", EXTRACT_SYS, user, bus,
                       temperature=0.3, max_tokens=4000)
    merged = dict(paper)
    if isinstance(out, dict):
        for k in ("claims", "methods", "key_findings", "limitations",
                  "future_work", "entities", "relationships"):
            v = out.get(k)
            if isinstance(v, list):
                merged[k] = v
    return merged


# ------------------------------------------------------- Knowledge graph
# The graph is built ALGORITHMICALLY (keyword co-occurrence) rather than via a
# single huge LLM call: K2-Think fills any token budget with reasoning, so a
# large structured-graph call routinely truncates and is very slow. The graph
# is for visualization; the scientific reasoning lives in the hypothesis,
# skeptic, tournament and scoring agents. A separate bounded LLM call surfaces
# contradictions and gap seeds.

_STOP = set("""the a an and or of to in for with on by from as is are was were be been
being this that these those it its their his her our your they we you i he she at into
than then thus also can may might could would should will not no can not using used use
between among within across over under after before during via per both each other more
most less least very much many few several such same different new novel high low large
small significant significantly increase decrease reduced increased associated related
study studies results result method methods conclusion conclusions background objective
objectives data analysis show shows showed demonstrate demonstrated suggest suggests
suggested observed found findings effect effects role potential based however therefore
which whose where when while because although though due including but if so we report
patients patient group groups level levels rate rates compared comparison treatment
treatments clinical present current model models cells cell tissue human mice mouse rat""".split())

_TERM_RE = re.compile(r"[A-Za-z][A-Za-z0-9\-]{2,}")


def _terms(text: str) -> set[str]:
    out = set()
    words = [w.lower() for w in _TERM_RE.findall(text or "")]
    # unigrams
    for w in words:
        if w not in _STOP and len(w) > 3:
            out.add(w)
    # bigrams (more meaningful concepts)
    for a, b in zip(words, words[1:]):
        if a not in _STOP and b not in _STOP and len(a) > 2 and len(b) > 2:
            out.add(f"{a} {b}")
    return out


def build_keyword_graph(papers: list[dict], max_nodes: int = 18,
                        max_edges: int = 28) -> dict:
    paper_terms: list[set[str]] = []
    for p in papers:
        txt = f"{p.get('title','')} {p.get('title','')} {p.get('abstract','')}"
        paper_terms.append(_terms(txt))

    df = Counter()
    for ts in paper_terms:
        for t in ts:
            df[t] += 1
    # Prefer multiword concepts and terms appearing in >=2 papers.
    scored = sorted(df.items(),
                    key=lambda kv: (kv[1] + (1.5 if " " in kv[0] else 0)),
                    reverse=True)
    top = [t for t, c in scored if c >= 2][:max_nodes]
    if len(top) < 8:  # small corpus fallback
        top = [t for t, _ in scored][:max_nodes]
    topset = set(top)

    co = Counter()
    for ts in paper_terms:
        present = [t for t in ts if t in topset]
        for a, b in combinations(sorted(present), 2):
            co[(a, b)] += 1
    max_co = max(co.values()) if co else 1

    nodes = [{"id": t, "label": t, "type": "concept", "paper_count": df[t]} for t in top]
    edges = []
    for (a, b), c in co.most_common(max_edges):
        edges.append({"source": a, "target": b, "relation": "co-occurs",
                      "strength": round(c / max_co, 2)})
    return {"nodes": nodes, "edges": edges}


ANALYZE_SYS = """You analyze a set of scientific paper abstracts to surface
contradictions and research gap seeds. Be concise and specific.
Return ONLY valid JSON (no preamble, no fences):
{
  "contradictions": [{"claim": str, "paper_a": title, "paper_b": title, "explanation": str}],
  "gaps_seed": [{"title": str, "reasoning": str, "opportunity": str}],
  "key_themes": [str]
}
Find 1-4 genuine contradictions (only if they truly exist) and 3-6 gap seeds."""


async def knowledge_graph(run_id: str, papers: list[dict], bus: Any) -> dict:
    graph = build_keyword_graph(papers)
    # Bounded LLM pass for contradictions + gap seeds. Keep input compact —
    # K2-Think's reasoning time scales steeply with how much text it must read.
    summary = "\n\n".join(
        f"[{p.get('title','')[:120]}] {(p.get('abstract','') or '')[:260]}"
        for p in papers[:8]
    )
    user = ("Analyze these abstracts for contradictions and research gaps.\n\n" + summary)
    out = await _agent(run_id, "Knowledge Graph", ANALYZE_SYS, user, bus,
                       temperature=0.5, max_tokens=16000)
    if isinstance(out, dict):
        graph["contradictions"] = out.get("contradictions", []) or []
        graph["gaps_seed"] = out.get("gaps_seed", []) or []
        graph["key_themes"] = out.get("key_themes", []) or []
    else:
        graph["contradictions"] = []
        graph["gaps_seed"] = []
    return graph


# ------------------------------------------------------- Gap discovery
GAP_SYS = """You are a scientific gap discovery engine. You see what scientists have NOT studied.
Given a knowledge graph, identify research opportunities of these types:
1. MISSING INTERSECTIONS: two concepts studied separately, never together.
2. WEAK CONNECTIONS: relationships in only 1-2 papers that should be important.
3. UNRESOLVED CONTRADICTIONS: which condition determines the truth.
4. MISSING MECHANISMS: established effect, unknown mechanism.
5. TRANSLATION GAPS: shown in one context, untested in the obvious analogous one.
Return ONLY valid JSON:
{
  "gaps": [
    {"id": str, "type": "missing_intersection|weak_connection|contradiction|missing_mechanism|translation",
     "title": str, "description": str, "involved_concepts": [str],
     "evidence_of_gap": str, "opportunity_score": float, "why_valuable": str}
  ]
}"""


async def gap_discovery(run_id: str, graph: dict, bus: Any) -> list[dict]:
    concepts = [n.get("label") for n in graph.get("nodes", [])]
    seeds = [f"{s.get('title','')}: {s.get('opportunity','')}"
             for s in graph.get("gaps_seed", [])]
    user = (
        f"Key concepts in this field: {concepts}\n\n"
        f"Themes: {graph.get('key_themes', [])}\n\n"
        f"Candidate gap seeds: {seeds}\n\n"
        "Identify the most valuable research gaps."
    )
    out = await _agent(run_id, "Gap Discovery", GAP_SYS, user, bus,
                       temperature=0.7, max_tokens=16000)
    gaps = out.get("gaps", []) if isinstance(out, dict) else []
    for i, g in enumerate(gaps):
        g.setdefault("id", f"gap_{i+1}")
    return gaps


# ------------------------------------------------------- Contradiction engine
CONTRA_SYS = """Two papers make contradictory claims. Reason carefully.
Return ONLY valid JSON:
{
  "contradiction_type": "direct_conflict|methodological_difference|context_dependent|scale_dependent|temporal",
  "possible_explanations": [3-5 specific hypotheses explaining why both could be true],
  "resolution_experiments": [2-3 specific experiments to determine which is correct],
  "which_is_more_likely_correct": "A|B|both_context_dependent|unclear",
  "reasoning": str
}"""


async def _one_contradiction(run_id: str, c: dict, bus: Any) -> Optional[dict]:
    user = (
        f"Paper A: {c.get('paper_a','')} claims: {c.get('claim','')}\n"
        f"Paper B: {c.get('paper_b','')} — opposing view. "
        f"Explanation of conflict: {c.get('explanation','')}"
    )
    out = await _agent(run_id, "Contradiction Engine", CONTRA_SYS, user, bus,
                       temperature=0.5, max_tokens=9000)
    if isinstance(out, dict):
        card = dict(c)
        card.update(out)
        return card
    return None


async def contradiction_engine(run_id: str, contradictions: list[dict],
                               bus: Any) -> list[dict]:
    results = await asyncio.gather(
        *[_one_contradiction(run_id, c, bus) for c in contradictions[:4]],
        return_exceptions=True,
    )
    return [r for r in results if isinstance(r, dict)]


# ------------------------------------------------------- Hypothesis generator
_ARCHETYPE_DESC = {
    "CONFIRMATORY": "extends an established finding to a new context",
    "MECHANISTIC": "proposes the mechanism behind an observed but unexplained effect",
    "COMBINATORIAL": "combines two previously unconnected concepts",
    "CONTRARIAN": "challenges a widely-held assumption with specific reasoning",
    "TRANSLATIONAL": "applies a finding from one domain to a problem in another",
    "GAP_FILLING": "directly addresses an identified research gap",
}

# Parallel batches keep each output small enough to avoid token-budget truncation.
_HYP_BATCHES = [
    ["MECHANISTIC", "CONFIRMATORY"],
    ["COMBINATORIAL", "CONTRARIAN"],
    ["TRANSLATIONAL", "GAP_FILLING"],
]

HYP_SYS = """You are a scientific hypothesis generator producing SPECIFIC, testable hypotheses.
Each hypothesis must be specific enough to design an experiment tomorrow.
"X may affect Y" is too vague. "Inhibiting pathway X in cell type Y reduces marker
Z by >30% under condition W" is specific.

Generate hypotheses ONLY for these archetypes: {ARCHS}

Return ONLY a JSON array (no preamble, no fences), each element:
{
  "archetype": str (one of the requested), "title": str (max 12 words, specific),
  "statement": str (one precise testable claim), "mechanism": str (why it would be true),
  "key_assumptions": [3-5 specific assumptions], "supporting_evidence": [paper titles],
  "predicted_outcome": str, "falsifiable_prediction": str
}"""


async def _hyp_batch(run_id: str, archs: list[str], per: int, goal: str,
                     lit: str, gap_txt: str, bus: Any) -> list[dict]:
    arch_lines = "\n".join(f"- {a}: {_ARCHETYPE_DESC[a]}" for a in archs)
    sysp = HYP_SYS.replace("{ARCHS}", arch_lines)
    user = (
        f"Research goal:\n{goal}\n\n"
        f"Literature context:\n{lit}\n\n"
        f"Identified gaps:\n{gap_txt}\n\n"
        f"Generate {per} hypotheses total across the requested archetypes."
    )
    out = await _agent(run_id, "Hypothesis Generator", sysp, user, bus,
                       temperature=0.85, max_tokens=14000)
    if isinstance(out, dict):
        out = out.get("hypotheses") or out.get("results") or []
    return out if isinstance(out, list) else []


async def generate_hypotheses(run_id: str, goal: str, papers: list[dict],
                              gaps: list[dict], contradictions: list[dict],
                              n: int, bus: Any) -> list[dict]:
    lit = "\n".join(
        f"- {p.get('title','')[:120]}: {(p.get('abstract','') or '')[:170]}"
        for p in papers[:8]
    )
    gap_txt = "\n".join(f"- [{g.get('type')}] {g.get('title')}: {g.get('description')}"
                        for g in gaps[:6]) or "(no explicit gaps; infer from literature)"
    per = max(2, round(n / len(_HYP_BATCHES)))
    results = await asyncio.gather(
        *[_hyp_batch(run_id, archs, per, goal, lit, gap_txt, bus)
          for archs in _HYP_BATCHES],
        return_exceptions=True,
    )
    hyps: list[dict] = []
    for r in results:
        if isinstance(r, list):
            hyps.extend(x for x in r if isinstance(x, dict) and x.get("title"))
    return hyps


# ------------------------------------------------------- Skeptic
SKEPTIC_SYS = """You are a rigorous scientific peer reviewer with a mandate to find flaws.
You are NOT trying to be fair. You are trying to break this hypothesis.
Return ONLY valid JSON:
{
  "critique_score": float 0-10,
  "logical_gaps": [str], "hidden_assumptions": [str], "confounding_variables": [str],
  "statistical_concerns": [str], "reproducibility_concerns": [str],
  "strongest_counter_argument": str,
  "survival_threshold": "eliminate|revise|accept"
}
"eliminate" = so flawed it should not proceed. "revise" = valuable core, needs work.
"accept" = proceed to tournament."""


async def skeptic(run_id: str, h: dict, bus: Any) -> dict:
    user = (
        f"Hypothesis: {h.get('title','')}\n"
        f"Statement: {h.get('statement','')}\n"
        f"Mechanism: {h.get('mechanism','')}\n"
        f"Assumptions: {h.get('key_assumptions', h.get('assumptions', []))}"
    )
    out = await _agent(run_id, "Skeptic", SKEPTIC_SYS, user, bus,
                       temperature=0.5, max_tokens=9000)
    if not isinstance(out, dict):
        out = {"critique_score": 6.0, "survival_threshold": "accept",
               "strongest_counter_argument": "Critique unavailable."}
    out.setdefault("survival_threshold", "accept")
    return out


# ------------------------------------------------------- Tournament judge
JUDGE_SYS = """You are judging a scientific hypothesis tournament.
Choose which hypothesis has greater potential to lead to a significant discovery.
Return ONLY valid JSON:
{
  "winner": "A|B", "margin": "decisive|narrow|coinflip",
  "a_argument": str (strongest case FOR A), "b_argument": str (strongest case FOR B),
  "deciding_factor": str, "loser_improvement": str
}"""


async def judge_matchup(run_id: str, a: dict, b: dict, rnd: int, bus: Any) -> dict:
    def crit(h):
        c = h.get("critique") or {}
        return c.get("strongest_counter_argument", "n/a")
    user = (
        f"HYPOTHESIS A: {a.get('title','')}\nStatement: {a.get('statement','')}\n"
        f"Mechanism: {a.get('mechanism','')}\nSkeptic counter: {crit(a)}\n\n"
        f"HYPOTHESIS B: {b.get('title','')}\nStatement: {b.get('statement','')}\n"
        f"Mechanism: {b.get('mechanism','')}\nSkeptic counter: {crit(b)}"
    )
    res = await k2.call_json(JUDGE_SYS, user, temperature=0.5, max_tokens=9000,
                             bus=bus, agent="Ranking Tournament")
    out = res.get("json")
    await db.log_agent(run_id, "Ranking Tournament", user, out,
                       res.get("think", ""), res.get("duration_ms", 0))
    if not isinstance(out, dict) or out.get("winner") not in ("A", "B"):
        out = {"winner": "A", "margin": "coinflip", "a_argument": "", "b_argument": "",
               "deciding_factor": "Defaulted (judge parse error).", "loser_improvement": ""}
    out["k2_think_trace"] = res.get("think", "")
    return out


# ------------------------------------------------------- Evolution
EVO_SYS = """You are an idea evolution engine for scientific hypotheses.
You receive the top hypotheses from a tournament round. Perform THREE operations:
1. COMBINE: most unexpected useful intersection of hypothesis #1 and #3 into one hybrid.
2. STRENGTHEN: revise hypothesis #1 to fix its biggest weakness, preserving the core.
3. EXTEND: push hypothesis #2 one level of specificity further (make it concrete).
Return exactly 3 new hypotheses as a JSON array, same schema as originals:
{"id": str, "archetype": str, "title": str, "statement": str, "mechanism": str,
 "key_assumptions": [str], "supporting_evidence": [str], "predicted_outcome": str,
 "falsifiable_prediction": str, "operation": "combine|strengthen|extend",
 "parent_ids": [source ids]}"""


async def evolution(run_id: str, top: list[dict], bus: Any) -> list[dict]:
    lines = []
    for i, h in enumerate(top[:5]):
        c = h.get("critique") or {}
        lines.append(
            f"#{i+1} (id={h.get('id')}): {h.get('title')} — {h.get('statement')}\n"
            f"   weakness: {c.get('strongest_counter_argument','n/a')}"
        )
    user = "Top hypotheses:\n" + "\n".join(lines)
    out = await _agent(run_id, "Evolution", EVO_SYS, user, bus,
                       temperature=0.85, max_tokens=14000)
    if isinstance(out, dict):
        out = out.get("hypotheses") or out.get("results") or []
    return out if isinstance(out, list) else []


# ------------------------------------------------------- Discovery scoring
_DIM_PROMPTS = {
    "evidence_strength": "Rate the strength of scientific evidence supporting this "
    "hypothesis (0-100). Consider cited-paper quality, mechanistic plausibility, "
    "consistency, replication. Return JSON: "
    '{"score": int, "rationale": str, "key_supporting_papers": [], "key_gaps": []}',
    "novelty": "Rate how novel this hypothesis is (0-100). 100=never proposed, "
    "0=established fact. Return JSON: "
    '{"score": int, "rationale": str, "closest_prior_work": str}',
    "feasibility": "Rate feasibility of testing this in 12-24 months (0-100). "
    "Consider equipment, cost, timeline, difficulty. Return JSON: "
    '{"score": int, "rationale": str, "recommended_experiment_type": str, '
    '"estimated_cost_range": str, "estimated_time_months": int}',
    "impact": "If proven true, rate potential impact (0-100). Return JSON: "
    '{"score": int, "scientific_impact": str, "clinical_impact": str, '
    '"industrial_impact": str}',
    "reproducibility": "Rate how reproducible this hypothesis would be if tested "
    "(0-100). Return JSON: "
    '{"score": int, "rationale": str, "main_reproducibility_risks": []}',
}

SCORE_WEIGHTS = {
    "evidence_strength": 0.30, "novelty": 0.25, "feasibility": 0.20,
    "impact": 0.15, "reproducibility": 0.10,
}


async def score_dimension(run_id: str, h: dict, dim: str, bus: Any) -> dict:
    sys = "You are a scientific evaluator. " + _DIM_PROMPTS[dim]
    user = (f"Hypothesis: {h.get('title','')}\nStatement: {h.get('statement','')}\n"
            f"Mechanism: {h.get('mechanism','')}")
    res = await k2.call_json(sys, user, temperature=0.4, max_tokens=7000,
                             bus=bus, agent="Discovery Scoring")
    out = res.get("json")
    await db.log_agent(run_id, f"Scoring/{dim}", user, out,
                       res.get("think", ""), res.get("duration_ms", 0))
    if not isinstance(out, dict):
        out = {"score": 50, "rationale": "Score unavailable."}
    try:
        out["score"] = max(0, min(100, float(out.get("score", 50))))
    except Exception:
        out["score"] = 50.0
    return out


# ------------------------------------------------------- Meta-review
META_SYS = """You are the scientific director reviewing a complete discovery session.
Produce a comprehensive Research Roadmap. Return ONLY valid JSON:
{
  "executive_summary": str,
  "top_discovery": {"hypothesis_id": str, "title": str, "why_top": str,
     "confidence_level": "speculative|plausible|well-supported", "next_step": str},
  "discovery_portfolio": [{"hypothesis_id": str, "title": str, "rationale": str}],
  "key_contradictions": [{"summary": str, "implication": str}],
  "most_valuable_gaps": [{"title": str, "why": str}],
  "surprise_findings": str,
  "recommended_experiment_sequence": [str],
  "what_would_change_everything": str
}"""


async def meta_review(run_id: str, goal: str, stats: dict, top: list[dict],
                      contradictions: list[dict], gaps: list[dict], bus: Any) -> dict:
    top_txt = "\n".join(
        f"- id={h.get('id')} | {h.get('title')} (Elo {round(h.get('elo_score',1000))}, "
        f"score {h.get('discovery_score','?')})" for h in top[:6]
    )
    user = (
        f"Goal: {goal}\n\n"
        f"Stats: {stats}\n\n"
        f"Top hypotheses:\n{top_txt}\n\n"
        f"Contradictions: {[c.get('claim') or c.get('summary') for c in contradictions[:4]]}\n\n"
        f"Gaps: {[g.get('title') for g in gaps[:5]]}"
    )
    out = await _agent(run_id, "Meta-Review", META_SYS, user, bus,
                       temperature=0.5, max_tokens=16000)
    return out if isinstance(out, dict) else {}
