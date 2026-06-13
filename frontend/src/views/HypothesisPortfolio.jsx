import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { getHypotheses } from '../lib/api'
import { ArchetypeBadge, GenBadge } from '../components/Badges'
import DimensionBars from '../components/DimensionBars'
import { scoreColor, ARCHETYPES } from '../lib/ui'

const SORTS = [
  { key: 'elo', label: 'Elo' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'novelty', label: 'Novelty' },
  { key: 'feasibility', label: 'Feasibility' },
]

export default function HypothesisPortfolio() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [hyps, setHyps] = useState([])
  const [sort, setSort] = useState('elo')
  const [archFilter, setArchFilter] = useState(null)
  const [showElim, setShowElim] = useState(false)

  useEffect(() => {
    let stop = false
    const load = () => getHypotheses(runId).then((d) => { if (!stop) setHyps(d.hypotheses) }).catch(() => {})
    load()
    const iv = setInterval(load, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [runId])

  const active = hyps.filter((h) => h.status !== 'eliminated')
  const eliminated = hyps.filter((h) => h.status === 'eliminated')

  const dims = (h) => h.scores || {}
  const sortVal = (h) => {
    if (sort === 'elo') return h.elo_score || 0
    if (sort === 'discovery') return dims(h).discovery_score || 0
    if (sort === 'novelty') return dims(h).novelty || 0
    if (sort === 'feasibility') return dims(h).feasibility || 0
    return 0
  }
  let shown = active.filter((h) => !archFilter || (h.archetype || '').toUpperCase().replace(/[\s-]+/g, '_') === archFilter)
  shown = [...shown].sort((a, b) => sortVal(b) - sortVal(a))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-7 py-8">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink-0">Hypothesis Portfolio</h1>
            <p className="text-ink-2 mt-1 text-sm">{active.length} surviving · {eliminated.length} eliminated by the Skeptic</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-mono">sort</span>
            {SORTS.map((s) => (
              <button key={s.key} onClick={() => setSort(s.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono transition ${sort === s.key ? 'text-phosphor' : 'text-ink-2 hover:text-ink-0'}`}
                style={sort === s.key ? { background: 'rgb(70 229 181 / 0.1)', border: '1px solid rgb(70 229 181 / 0.3)' } : { border: '1px solid transparent' }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* archetype filter */}
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button onClick={() => setArchFilter(null)}
            className={`chip ${!archFilter ? 'text-phosphor' : ''}`}
            style={!archFilter ? { borderColor: 'rgb(70 229 181 / 0.4)', color: 'rgb(70 229 181)' } : undefined}>All</button>
          {Object.entries(ARCHETYPES).filter(([k]) => k !== 'EVOLVED').map(([k, v]) => (
            <button key={k} onClick={() => setArchFilter(archFilter === k ? null : k)}
              className="chip transition"
              style={{ color: archFilter === k ? `rgb(${v.color})` : undefined,
                       borderColor: archFilter === k ? `rgb(${v.color} / 0.5)` : undefined }}>
              {v.label}
            </button>
          ))}
        </div>

        {/* grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 mt-6">
          {shown.map((h, i) => {
            const d = dims(h)
            const col = scoreColor(d.discovery_score)
            return (
              <motion.button
                key={h.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.4) }}
                onClick={() => navigate(`/run/${runId}/hypothesis/${h.id}`)}
                className="panel p-4 text-left hover:border-phosphor/30 transition group flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <ArchetypeBadge archetype={h.archetype} small />
                  <div className="text-right">
                    <div className="font-mono text-phosphor text-sm leading-none">{Math.round(h.elo_score)}</div>
                    <div className="label-mono" style={{ fontSize: '0.5rem' }}>elo</div>
                  </div>
                </div>
                <h3 className="text-[15px] text-ink-0 mt-2.5 leading-snug font-medium line-clamp-2 group-hover:text-phosphor transition">{h.title}</h3>
                <p className="text-[12px] text-ink-2 mt-1.5 leading-snug line-clamp-2 flex-1">{h.statement}</p>

                <div className="flex items-center justify-between mt-3 mb-2.5">
                  <GenBadge type={h.generation_type} parents={h.parent_ids} />
                  {d.discovery_score != null && (
                    <span className="font-mono text-xs" style={{ color: `rgb(${col})` }}>disc {Math.round(d.discovery_score)}</span>
                  )}
                </div>
                {d.discovery_score != null ? (
                  <DimensionBars dimensions={d} compact />
                ) : (
                  <div className="text-[11px] text-ink-3 font-mono">{h.wins || 0}W · {h.losses || 0}L · scoring pending</div>
                )}
              </motion.button>
            )
          })}
        </div>

        {shown.length === 0 && <div className="text-center text-ink-3 font-mono text-sm py-20">No hypotheses yet — the run may still be in progress.</div>}

        {/* eliminated */}
        {eliminated.length > 0 && (
          <div className="mt-8">
            <button onClick={() => setShowElim((v) => !v)} className="flex items-center gap-2 label-mono" style={{ color: 'rgb(255 92 122)' }}>
              <ChevronDown size={14} className={`transition ${showElim ? 'rotate-180' : ''}`} />
              Eliminated by Skeptic ({eliminated.length})
            </button>
            {showElim && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-3">
                {eliminated.map((h) => (
                  <div key={h.id} className="panel p-3.5" style={{ borderColor: 'rgb(255 92 122 / 0.2)' }}>
                    <div className="text-sm text-ink-2 line-through leading-snug">{h.title}</div>
                    {h.critique?.strongest_counter_argument && (
                      <div className="text-[12px] text-ink-3 mt-1.5 leading-snug">{h.critique.strongest_counter_argument}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
