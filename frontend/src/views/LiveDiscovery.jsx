import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ArrowRight, Brain } from 'lucide-react'
import { streamRun, getRun } from '../lib/api'
import { useStore, STAGE_ORDER } from '../store'
import { AGENT_SEQUENCE, archetypeMeta, scoreColor } from '../lib/ui'
import ThinkStream from '../components/ThinkStream'
import { ArchetypeBadge } from '../components/Badges'

const STAGE_LABELS = {
  queued: 'Queued', literature: 'Literature', graph: 'Graph', gaps: 'Gaps',
  contradictions: 'Contradictions', hypothesis_gen: 'Hypotheses', critique: 'Skeptic',
  tournament: 'Tournament', scoring: 'Scoring', enrichment: 'Protocols',
  meta_review: 'Meta-Review', complete: 'Done',
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
  const { stage, stageLabel, progress, agents, thinkBuffer, activeAgent, feed, plan,
          papersCount, gapsCount, contradictionsCount, complete, memoryUsed, goal } = store
  useEffect(() => {
    const { applyEvent, resetLive } = useStore.getState()
    if (useStore.getState().runId !== runId) {
      resetLive(runId, '')
      getRun(runId).then((r) => useStore.setState({ goal: r.goal })).catch(() => {})
    }
    const close = streamRun(runId, applyEvent)
    return close
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const counters = [
    { label: 'papers', value: papersCount },
    { label: 'hypotheses', value: Object.values(store.hypotheses).filter((h) => h.status !== 'eliminated').length },
    { label: 'gaps', value: gapsCount },
    { label: 'contradictions', value: contradictionsCount },
    { label: 'debates', value: store.debates.length },
  ]

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
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,38%)_minmax(0,62%)]">
        {/* left: agents + think */}
        <div className="flex flex-col min-h-0 border-r hairline">
          <div className="px-5 py-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-b hairline">
            {counters.map((c) => (
              <div key={c.label} className="flex items-baseline justify-between">
                <span className="label-mono">{c.label}</span>
                <span className="font-mono text-phosphor text-sm">{c.value}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-b hairline overflow-x-auto">
            <div className="flex gap-1.5">
              {AGENT_SEQUENCE.map((a) => {
                const st = agents[a.name]?.status
                const color = st === 'thinking' ? 'rgb(70 229 181)' : st === 'done' ? 'rgb(124 134 156)' : 'rgb(78 87 106)'
                return (
                  <div key={a.name} title={a.name}
                    className="grid place-items-center w-7 h-7 rounded-md shrink-0 transition"
                    style={{ color, background: st === 'thinking' ? 'rgb(70 229 181 / 0.12)' : 'transparent',
                             border: `1px solid ${st === 'thinking' ? 'rgb(70 229 181 / 0.35)' : 'rgb(140 160 200 / 0.1)'}`,
                             boxShadow: st === 'thinking' ? '0 0 12px rgb(70 229 181 / 0.3)' : 'none' }}>
                    <span style={{ fontSize: 13 }}>{a.glyph}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <ThinkStream text={thinkBuffer} agent={activeAgent} active={!complete} />
          </div>
        </div>

        {/* right: feed */}
        <div className="flex flex-col min-h-0">
          <div className="px-5 py-3 border-b hairline flex items-center gap-2">
            <Brain size={14} className="text-ink-3" />
            <span className="label-mono">Discovery feed</span>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
            <AnimatePresence initial={false}>
              {feed.length === 0 && (
                <div className="text-center text-ink-3 font-mono text-xs py-16">events will stream here…</div>
              )}
              {feed.map((c) => (
                <motion.div key={c.id} layout initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
                  <FeedCard c={c} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
