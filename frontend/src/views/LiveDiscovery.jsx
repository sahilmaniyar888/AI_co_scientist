import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { getRun, getHypotheses, getGraph } from '../lib/api'
import { useStore, STAGE_ORDER } from '../store'
import { AGENT_SEQUENCE, scoreColor } from '../lib/ui'
import { ArchetypeBadge } from '../components/Badges'

// Each instrument's headline result, computed from the loaded run data.
function agentSummaries({ plan, papers, reachable, graph, hyps, debates }) {
  const elim = hyps.filter((h) => h.status === 'eliminated').length
  const evolved = hyps.filter((h) => h.generation_type === 'evolved').length
  const dist = (key, sub) => {
    const c = {}
    hyps.forEach((h) => { const v = h[key]?.[sub]; if (v) c[v] = (c[v] || 0) + 1 })
    return Object.entries(c).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(' · ')
  }
  const topScore = Math.max(0, ...hyps.map((h) => h.scores?.discovery_score || 0))
  return [
    { name: 'Supervisor', glyph: '◆', color: '70 229 181', head: 'Parsed the goal into a plan', lines: [plan?.domain, plan?.focus_areas?.length ? `${plan.focus_areas.length} focus areas` : null] },
    { name: 'Literature Scout', glyph: '⛏', color: '91 140 255', head: `${reachable || papers} papers sourced (OpenAlex)`, lines: [`Citation-ranked, kept the top ${papers} for deep analysis`] },
    { name: 'Knowledge Graph', glyph: '⬡', color: '167 139 250', head: graph ? `${graph.nodes?.length || 0} papers · ${graph.edges?.length || 0} citation links` : 'Citation network', lines: [graph?.key_themes?.length ? `themes: ${(graph.key_themes || []).slice(0, 3).join(', ')}` : 'real co-citation network'] },
    { name: 'Gap Discovery', glyph: '◍', color: '245 181 71', head: `${graph?.gaps?.length || 0} research gaps found`, lines: (graph?.gaps || []).slice(0, 3).map((g) => g.title) },
    { name: 'Contradiction Engine', glyph: '⚡', color: '255 92 122', head: `${graph?.contradictions?.length || 0} contradictions`, lines: (graph?.contradictions || []).slice(0, 2).map((c) => c.claim || c.explanation) },
    { name: 'Hypothesis Generator', glyph: '✦', color: '70 229 181', head: `${hyps.length} hypotheses generated`, lines: ['across mechanistic, combinatorial, contrarian, translational archetypes'] },
    { name: 'Skeptic', glyph: '⊘', color: '255 92 122', head: `Eliminated ${elim} weak hypotheses`, lines: ['attacked every hypothesis for logical gaps & confounders'] },
    { name: 'Ranking Tournament', glyph: '⚔', color: '245 181 71', head: `${debates.length} Elo debates`, lines: ['K2 judged which hypothesis has greater discovery potential'] },
    { name: 'Evolution', glyph: '⟳', color: '125 211 252', head: `${evolved} hybrid hypotheses bred`, lines: ['recombined the strongest survivors between rounds'] },
    { name: 'Novelty Verifier', glyph: '⌖', color: '70 229 181', head: 'Grounded novelty vs. literature', lines: [dist('novelty', 'verdict') || 'checked against retrieved prior art'] },
    { name: 'Trial Auditor', glyph: '⚕', color: '245 181 71', head: 'Reality check vs. clinical trials', lines: [dist('prior_failure', 'verdict') || 'searched ClinicalTrials.gov'] },
    { name: 'Plausibility Auditor', glyph: '⚛', color: '167 139 250', head: 'Mechanistic plausibility', lines: [dist('plausibility', 'verdict') || 'checked biological coherence'] },
    { name: 'Discovery Scoring', glyph: '◎', color: '70 229 181', head: topScore ? `Top discovery score ${Math.round(topScore)}` : 'Scored survivors', lines: ['5 weighted dimensions, minus recombination & plausibility penalties'] },
  ]
}

const STAGE_LABELS = {
  queued: 'Queued', literature: 'Literature', graph: 'Graph', gaps: 'Gaps',
  contradictions: 'Contradictions', hypothesis_gen: 'Hypotheses', critique: 'Skeptic',
  tournament: 'Tournament', novelty: 'Reality Check', scoring: 'Scoring', enrichment: 'Protocols',
  meta_review: 'Meta-Review', complete: 'Done',
}

const FAILURE_META = {
  untested: { color: 'rgb(70 229 181)', label: 'untested' },
  in_progress: { color: 'rgb(125 211 252)', label: 'in trials' },
  failed_before: { color: 'rgb(255 92 122)', label: 'failed before' },
  mixed: { color: 'rgb(245 181 71)', label: 'mixed evidence' },
  established: { color: 'rgb(245 181 71)', label: 'already tried' },
}

const PLAUS_META = {
  coherent: { color: 'rgb(70 229 181)', label: 'coherent' },
  uncertain: { color: 'rgb(245 181 71)', label: 'uncertain' },
  incoherent: { color: 'rgb(255 92 122)', label: 'incoherent' },
}

const VERDICT_META = {
  novel: { color: 'rgb(70 229 181)', label: 'novel' },
  incremental: { color: 'rgb(125 211 252)', label: 'incremental' },
  recombination: { color: 'rgb(245 181 71)', label: 'recombination' },
  known: { color: 'rgb(255 92 122)', label: 'already known' },
}

function StageRail({ stage }) {
  const idx = STAGE_ORDER.indexOf(stage)
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {STAGE_ORDER.slice(1).map((s, i) => {
        const realIdx = i + 1
        const done = realIdx < idx
        const active = realIdx === idx
        return (
          <div key={s} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition"
              style={{
                color: active ? 'rgb(70 229 181)' : done ? 'rgb(124 134 156)' : 'rgb(78 87 106)',
                background: active ? 'rgb(70 229 181 / 0.1)' : 'transparent',
                border: `1px solid ${active ? 'rgb(70 229 181 / 0.3)' : 'transparent'}`,
              }}>
              {done && <CheckCircle2 size={11} />}
              {active && <span className="dots inline-flex"><span /></span>}
              {STAGE_LABELS[s]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function FeedCard({ c }) {
  const base = 'panel p-3.5 animate-in'
  if (c.type === 'hypothesis') {
    return (
      <div className={base}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <ArchetypeBadge archetype={c.archetype} small />
            {c.generation_type === 'evolved' && (
              <span className="chip" style={{ color: 'rgb(125 211 252)', borderColor: 'rgb(125 211 252 / 0.3)' }}>⟳ evolved</span>
            )}
          </div>
          <span className="font-mono text-phosphor text-xs shrink-0">{Math.round(c.elo)}</span>
        </div>
        <div className="text-sm text-ink-1 mt-2 leading-snug">{c.title}</div>
      </div>
    )
  }
  if (c.type === 'debate') {
    return (
      <div className={base} style={{ borderColor: 'rgb(245 181 71 / 0.2)' }}>
        <div className="label-mono mb-2" style={{ color: 'rgb(245 181 71)' }}>⚔ Debate · round {c.round}</div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`flex-1 truncate ${c.winner_title === c.a_title ? 'text-ink-0 font-semibold' : 'text-ink-3 line-through'}`}>{c.a_title}</span>
          <span className="text-ink-3">vs</span>
          <span className={`flex-1 truncate text-right ${c.winner_title === c.b_title ? 'text-ink-0 font-semibold' : 'text-ink-3 line-through'}`}>{c.b_title}</span>
        </div>
        {c.deciding_factor && <div className="text-[12px] text-ink-2 mt-2 leading-snug italic">{c.deciding_factor}</div>}
      </div>
    )
  }
  if (c.type === 'score') {
    const col = scoreColor(c.discovery_score)
    return (
      <div className={base} style={{ borderColor: `rgb(${col} / 0.25)` }}>
        <div className="flex items-center justify-between">
          <div className="label-mono">Discovery score</div>
          <span className="font-mono text-lg font-semibold" style={{ color: `rgb(${col})` }}>{Math.round(c.discovery_score)}</span>
        </div>
        <div className="text-sm text-ink-1 mt-1 leading-snug">{c.title}</div>
      </div>
    )
  }
  if (c.type === 'eliminated') {
    return (
      <div className={base} style={{ borderColor: 'rgb(255 92 122 / 0.22)' }}>
        <div className="label-mono mb-1.5" style={{ color: 'rgb(255 92 122)' }}>⊘ Eliminated by Skeptic</div>
        <div className="text-sm text-ink-2 line-through leading-snug">{c.title}</div>
        {c.reason && <div className="text-[12px] text-ink-3 mt-1.5 leading-snug">{c.reason}</div>}
      </div>
    )
  }
  if (c.type === 'papers') {
    return <div className={base}><div className="text-sm text-ink-1">📚 Scanned <span className="text-phosphor font-mono">{c.reachable || c.count}</span> papers via {c.source}, analyzing the <span className="text-phosphor font-mono">{c.count}</span> most-cited</div></div>
  }
  if (c.type === 'gaps') {
    return (
      <div className={base}>
        <div className="text-sm text-ink-1">◍ Found <span className="text-phosphor font-mono">{c.count}</span> research gaps</div>
        {c.gaps?.length > 0 && (
          <ul className="mt-2 space-y-1">
            {c.gaps.slice(0, 3).map((g, i) => <li key={i} className="text-[12px] text-ink-2">· {g.title}</li>)}
          </ul>
        )}
      </div>
    )
  }
  if (c.type === 'contradictions') {
    return <div className={base}><div className="text-sm text-ink-1">⚡ Resolved <span style={{ color: 'rgb(255 92 122)' }} className="font-mono">{c.count}</span> contradictions</div></div>
  }
  if (c.type === 'novelty') {
    const v = VERDICT_META[c.verdict] || VERDICT_META.incremental
    return (
      <div className={base} style={{ borderColor: `${v.color.replace(')', ' / 0.28)')}` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="label-mono" style={{ color: v.color }}>⌖ Prior-art check</div>
          <span className="chip" style={{ color: v.color, borderColor: v.color.replace(')', ' / 0.4)') }}>{v.label}</span>
        </div>
        <div className="text-sm text-ink-1 mt-1.5 leading-snug">{c.title}</div>
        <div className="flex items-center gap-3 mt-2 text-[12px] font-mono text-ink-3">
          <span>grounded novelty <span style={{ color: v.color }}>{Math.round(c.novelty_score)}</span></span>
          <span>· {c.prior_art_count} papers checked</span>
        </div>
      </div>
    )
  }
  if (c.type === 'prior_failure') {
    const v = FAILURE_META[c.verdict] || FAILURE_META.untested
    return (
      <div className={base} style={{ borderColor: v.color.replace(')', ' / 0.28)') }}>
        <div className="flex items-center justify-between gap-2">
          <div className="label-mono" style={{ color: v.color }}>⚕ Reality check · trials</div>
          <span className="chip" style={{ color: v.color, borderColor: v.color.replace(')', ' / 0.4)') }}>{v.label}</span>
        </div>
        <div className="text-sm text-ink-1 mt-1.5 leading-snug">{c.title}</div>
        <div className="flex items-center gap-3 mt-2 text-[12px] font-mono text-ink-3">
          <span>{c.trials_count} trials checked</span>
          {c.failed_count > 0 && <span style={{ color: 'rgb(255 92 122)' }}>{c.failed_count} terminated/withdrawn</span>}
        </div>
      </div>
    )
  }
  if (c.type === 'plausibility') {
    const v = PLAUS_META[c.verdict] || PLAUS_META.uncertain
    return (
      <div className={base} style={{ borderColor: v.color.replace(')', ' / 0.28)') }}>
        <div className="flex items-center justify-between gap-2">
          <div className="label-mono" style={{ color: v.color }}>⚛ Mechanistic plausibility</div>
          <span className="chip" style={{ color: v.color, borderColor: v.color.replace(')', ' / 0.4)') }}>{v.label}</span>
        </div>
        <div className="text-sm text-ink-1 mt-1.5 leading-snug">{c.title}</div>
        <div className="mt-2 text-[12px] font-mono text-ink-3">coherence <span style={{ color: v.color }}>{Math.round(c.plausibility_score)}</span>{c.penalty > 0 && <span style={{ color: 'rgb(255 92 122)' }}> · −{Math.round(c.penalty)}</span>}</div>
      </div>
    )
  }
  if (c.type === 'enrichment') {
    return (
      <div className={base} style={{ borderColor: 'rgb(167 139 250 / 0.22)' }}>
        <div className="label-mono mb-1.5" style={{ color: 'rgb(167 139 250)' }}>🧪 Protocol + validation plan</div>
        <div className="text-[13px] text-ink-1 leading-snug">{c.protocol_name || c.title}</div>
        {c.datasets > 0 && <div className="text-[12px] text-ink-3 mt-1">{c.datasets} public dataset{c.datasets > 1 ? 's' : ''} for computational validation</div>}
      </div>
    )
  }
  return null
}

export default function LiveDiscovery() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const { stage, stageLabel, progress, thinkBuffer, activeAgent, feed, plan,
          complete, memoryUsed, goal } = store
  useEffect(() => {
    // Start once; the stream lives at module scope and runs to completion even if we
    // navigate away. Revisiting never restarts it (startStream is idempotent per run).
    useStore.getState().startStream(runId)
    getRun(runId).then((r) => useStore.setState((s) => (s.runId === runId ? { goal: r.goal } : {}))).catch(() => {})
    // intentionally NO cleanup — do not close the stream on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // Final per-agent results (for the clickable instrument rail).
  const [extra, setExtra] = useState({ hyps: [], graph: null })
  const [openAgent, setOpenAgent] = useState(null)
  useEffect(() => {
    let stop = false
    const load = () => {
      getHypotheses(runId).then((d) => { if (!stop) setExtra((e) => ({ ...e, hyps: d.hypotheses || [] })) }).catch(() => {})
      getGraph(runId).then((g) => { if (!stop) setExtra((e) => ({ ...e, graph: g })) }).catch(() => {})
    }
    load()
    const iv = setInterval(load, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [runId])

  const allHyps = Object.values(store.hypotheses)
  const surviving = allHyps.filter((h) => h.status !== 'eliminated').length
  const eliminated = allHyps.filter((h) => h.status === 'eliminated').length
  const activeGlyph = AGENT_SEQUENCE.find((a) => a.name === activeAgent)?.glyph || '◆'

  const bottomRef = useRef(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [feed.length, activeAgent, complete])

  const shortThink = (thinkBuffer || '').replace(/\s+/g, ' ').trim().slice(-220)
  const chrono = [...feed].reverse()

  const summaries = agentSummaries({
    plan, papers: store.papersCount, reachable: store.reachable,
    graph: extra.graph, hyps: extra.hyps, debates: store.debates,
  })
  const openSummary = summaries.find((s) => s.name === openAgent)

  return (
    <div className="h-full flex flex-col">
      {/* header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b hairline">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`relative inline-flex w-2 h-2 rounded-full ${complete ? '' : 'live-dot'}`}
                style={{ background: complete ? 'rgb(70 229 181)' : 'rgb(245 181 71)' }} />
              <span className="label-mono">{complete ? 'Discovery complete' : `Running · ${stageLabel}`}</span>
              {memoryUsed && <span className="chip" style={{ color: 'rgb(167 139 250)', borderColor: 'rgb(167 139 250 / 0.3)' }}>memory loaded</span>}
              {allHyps.length > 0 && <>
                <span className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.3)' }}>{surviving} surviving</span>
                {eliminated > 0 && <span className="chip" style={{ color: 'rgb(255 92 122)', borderColor: 'rgb(255 92 122 / 0.3)' }}>{eliminated} eliminated</span>}
              </>}
            </div>
            <h1 className="font-display text-xl text-ink-0 mt-1.5 leading-snug truncate">{plan?.domain || goal || 'Discovery run'}</h1>
          </div>
          {complete && (
            <button onClick={() => navigate(`/run/${runId}/roadmap`)} className="btn btn-primary px-4 py-2 text-sm shrink-0">
              View roadmap <ArrowRight size={15} />
            </button>
          )}
        </div>
        <div className="mt-3.5"><StageRail stage={stage} /></div>
        <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgb(140 160 200 / 0.1)' }}>
          <div className="h-full rounded-full" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, rgb(91 140 255), rgb(70 229 181))', transition: 'width 600ms ease' }} />
        </div>

        {/* clickable instrument rail — tap an agent for its result */}
        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="label-mono shrink-0 mr-1" style={{ fontSize: '0.52rem' }}>agents ›</span>
          {summaries.map((s) => {
            const st = store.agents[s.name]?.status
            const open = openAgent === s.name
            return (
              <button key={s.name} title={s.name} onClick={() => setOpenAgent(open ? null : s.name)}
                className="grid place-items-center w-8 h-8 rounded-lg shrink-0 transition"
                style={{ color: `rgb(${s.color})`,
                         background: open ? `rgb(${s.color} / 0.16)` : 'rgb(140 160 200 / 0.05)',
                         border: `1px solid ${open ? `rgb(${s.color} / 0.5)` : 'rgb(140 160 200 / 0.12)'}`,
                         boxShadow: st === 'thinking' ? `0 0 10px rgb(${s.color} / 0.4)` : 'none' }}>
                <span style={{ fontSize: 14 }}>{s.glyph}</span>
              </button>
            )
          })}
        </div>
        <AnimatePresence>
          {openSummary && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              className="mt-2 panel p-3.5" style={{ borderColor: `rgb(${openSummary.color} / 0.3)` }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 14, color: `rgb(${openSummary.color})` }}>{openSummary.glyph}</span>
                <span className="label-mono" style={{ color: `rgb(${openSummary.color})` }}>{openSummary.name}</span>
                <button onClick={() => setOpenAgent(null)} className="label-mono ml-auto hover:text-phosphor">close</button>
              </div>
              <div className="text-[13.5px] text-ink-0 mt-1.5">{openSummary.head}</div>
              {openSummary.lines.filter(Boolean).length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {openSummary.lines.filter(Boolean).slice(0, 3).map((l, i) => (
                    <li key={i} className="text-[12px] text-ink-2 leading-snug">· {l}</li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* full-width chatbot transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-7 space-y-3">
          {chrono.length === 0 && !activeAgent && (
            <div className="text-center text-ink-3 font-mono text-xs py-20">the engine is warming up…</div>
          )}
          <AnimatePresence initial={false}>
            {chrono.map((c) => (
              <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                <div className="grid place-items-center w-7 h-7 rounded-lg shrink-0 mt-0.5"
                  style={{ background: 'rgb(70 229 181 / 0.1)', border: '1px solid rgb(70 229 181 / 0.22)' }}>
                  <span style={{ fontSize: 12, color: 'rgb(70 229 181)' }}>◇</span>
                </div>
                <div className="flex-1 min-w-0"><FeedCard c={c} /></div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* live reasoning — small rolling summary, not the full trace */}
          {!complete && activeAgent && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <div className="grid place-items-center w-7 h-7 rounded-lg shrink-0 mt-0.5"
                style={{ background: 'rgb(70 229 181 / 0.14)', border: '1px solid rgb(70 229 181 / 0.4)', boxShadow: '0 0 14px rgb(70 229 181 / 0.25)' }}>
                <span style={{ fontSize: 13, color: 'rgb(70 229 181)' }}>{activeGlyph}</span>
              </div>
              <div className="flex-1 min-w-0 panel p-3.5" style={{ borderColor: 'rgb(70 229 181 / 0.22)' }}>
                <div className="flex items-center gap-2">
                  <span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>{activeAgent} · reasoning</span>
                  <span className="dots inline-flex"><span /><span /><span /></span>
                </div>
                {shortThink && (
                  <p className="think-stream mt-1.5" style={{ fontSize: '0.7rem', lineHeight: 1.5, maxHeight: '3rem', overflow: 'hidden', maskImage: 'linear-gradient(180deg, transparent, black 30%)' }}>
                    …{shortThink}
                  </p>
                )}
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
