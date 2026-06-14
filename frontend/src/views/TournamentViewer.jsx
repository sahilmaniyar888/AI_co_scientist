import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Trophy, Swords, Crown, Zap } from 'lucide-react'
import { getDebates } from '../lib/api'

function Fighter({ h, won, side }) {
  const col = won ? '70 229 181' : '124 134 156'
  return (
    <div className="flex-1 min-w-0 panel p-4 relative overflow-hidden transition"
      style={{ borderColor: won ? 'rgb(70 229 181 / 0.45)' : 'rgb(140 160 200 / 0.12)',
               background: won ? 'linear-gradient(160deg, rgb(70 229 181 / 0.08), transparent)' : 'transparent',
               opacity: won ? 1 : 0.72 }}>
      {won && <div className="absolute top-3 right-3"><Crown size={16} color="rgb(70 229 181)" /></div>}
      <div className="label-mono" style={{ color: `rgb(${col})` }}>{side} {won ? '· winner' : ''}</div>
      <div className="text-[14px] text-ink-0 mt-2 leading-snug pr-5">{h?.title || '—'}</div>
      <div className="flex items-center gap-3 mt-3 font-mono text-[12px]">
        <span style={{ color: `rgb(${col})` }}>elo {Math.round(h?.elo_score || 1000)}</span>
        <span className="text-ink-3">{h?.wins || 0}W·{h?.losses || 0}L</span>
      </div>
    </div>
  )
}

export default function TournamentViewer() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [debates, setDebates] = useState([])
  const [hyps, setHyps] = useState({})
  const [sel, setSel] = useState(null)
  const [showTrace, setShowTrace] = useState(false)

  useEffect(() => {
    let stop = false
    const load = () => getDebates(runId).then((d) => {
      if (stop) return
      setDebates(d.debates); setHyps(d.hypotheses)
      setSel((cur) => cur || d.debates[d.debates.length - 1] || null)
    }).catch(() => {})
    load()
    const iv = setInterval(load, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [runId])

  const rounds = [...new Set(debates.map((d) => d.round))].sort()
  const title = (id) => hyps[id]?.title || '—'

  // champion = most wins among debated hypotheses (elo tiebreak)
  const champion = Object.values(hyps)
    .filter((h) => (h.wins || 0) + (h.losses || 0) > 0)
    .sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.elo_score || 0) - (a.elo_score || 0))[0]

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-7 py-5 border-b hairline flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2"><Swords size={15} color="rgb(245 181 71)" /><span className="label-mono" style={{ color: 'rgb(245 181 71)' }}>Tournament · natural selection of ideas</span></div>
          <h1 className="font-display text-2xl text-ink-0 mt-1.5">{debates.length} head-to-head matches · {rounds.length} rounds</h1>
        </div>
        {champion && (
          <button onClick={() => navigate(`/run/${runId}/hypothesis/${champion.id}`)}
            className="panel px-4 py-2.5 flex items-center gap-3 hover:border-phosphor/40 transition" style={{ borderColor: 'rgb(70 229 181 / 0.3)', background: 'rgb(70 229 181 / 0.05)' }}>
            <Trophy size={18} color="rgb(70 229 181)" />
            <div className="text-left min-w-0">
              <div className="label-mono" style={{ color: 'rgb(70 229 181)' }}>tournament leader</div>
              <div className="text-[13px] text-ink-0 truncate max-w-[260px]">{champion.title}</div>
            </div>
            <span className="font-mono text-phosphor text-sm shrink-0">{champion.wins || 0}W</span>
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,38%)_minmax(0,62%)]">
        {/* bracket / match list */}
        <div className="overflow-y-auto border-r hairline p-4">
          {rounds.map((r) => (
            <div key={r} className="mb-5">
              <div className="label-mono mb-2 flex items-center gap-2"><Zap size={11} color="rgb(245 181 71)" /> Round {r}</div>
              <div className="space-y-1.5">
                {debates.filter((d) => d.round === r).map((d) => {
                  const active = sel?.id === d.id
                  const aWon = d.winner_id === d.hyp_a_id
                  return (
                    <button key={d.id} onClick={() => { setSel(d); setShowTrace(false) }}
                      className={`w-full panel px-3 py-2.5 text-left transition ${active ? 'border-phosphor/40' : 'hover:border-phosphor/20'}`}
                      style={active ? { background: 'rgb(70 229 181 / 0.06)' } : undefined}>
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className={`flex-1 truncate ${aWon ? 'text-ink-0 font-medium' : 'text-ink-3 line-through'}`}>{title(d.hyp_a_id)}</span>
                        <span className="font-mono text-ink-3 shrink-0">vs</span>
                        <span className={`flex-1 truncate text-right ${!aWon ? 'text-ink-0 font-medium' : 'text-ink-3 line-through'}`}>{title(d.hyp_b_id)}</span>
                      </div>
                      {/* who-won meter */}
                      <div className="flex items-center gap-1 mt-2">
                        <div className="flex-1 h-1 rounded-full" style={{ background: aWon ? 'rgb(70 229 181)' : 'rgb(140 160 200 / 0.15)' }} />
                        <Trophy size={10} color="rgb(245 181 71)" />
                        <div className="flex-1 h-1 rounded-full" style={{ background: !aWon ? 'rgb(70 229 181)' : 'rgb(140 160 200 / 0.15)' }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {debates.length === 0 && <div className="text-ink-3 font-mono text-xs text-center py-10">no matches yet…</div>}
        </div>

        {/* the match */}
        <div className="overflow-y-auto p-6">
          <AnimatePresence mode="wait">
          {sel ? (
            <motion.div key={sel.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="label-mono mb-4 flex items-center gap-2" style={{ color: 'rgb(245 181 71)' }}>
                <Swords size={13} /> Round {sel.round} · the match
              </div>

              {/* versus */}
              <div className="flex items-stretch gap-3">
                <Fighter h={hyps[sel.hyp_a_id]} won={sel.winner_id === sel.hyp_a_id} side="A" />
                <div className="grid place-items-center shrink-0">
                  <div className="font-display text-2xl text-ink-3 italic">vs</div>
                </div>
                <Fighter h={hyps[sel.hyp_b_id]} won={sel.winner_id === sel.hyp_b_id} side="B" />
              </div>

              {/* verdict — the key finding */}
              <div className="panel p-4 mt-3" style={{ background: 'rgb(245 181 71 / 0.06)', borderColor: 'rgb(245 181 71 / 0.25)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Trophy size={13} color="rgb(245 181 71)" />
                  <span className="label-mono" style={{ color: 'rgb(245 181 71)' }}>why it won{sel.margin ? ` · ${sel.margin}` : ''}</span>
                </div>
                <p className="text-[14px] text-ink-0 leading-relaxed">{sel.deciding_factor || '—'}</p>
              </div>

              {/* cases — short */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="panel p-3.5" style={{ borderColor: sel.winner_id === sel.hyp_a_id ? 'rgb(70 229 181 / 0.25)' : undefined }}>
                  <div className="label-mono mb-1.5" style={{ color: 'rgb(91 140 255)' }}>case for A</div>
                  <p className="text-[12.5px] text-ink-1 leading-snug line-clamp-5">{sel.a_argument || '—'}</p>
                </div>
                <div className="panel p-3.5" style={{ borderColor: sel.winner_id === sel.hyp_b_id ? 'rgb(70 229 181 / 0.25)' : undefined }}>
                  <div className="label-mono mb-1.5" style={{ color: 'rgb(91 140 255)' }}>case for B</div>
                  <p className="text-[12.5px] text-ink-1 leading-snug line-clamp-5">{sel.b_argument || '—'}</p>
                </div>
              </div>

              {sel.loser_improvement && (
                <div className="panel p-3.5 mt-3">
                  <div className="label-mono mb-1" style={{ color: 'rgb(125 211 252)' }}>↑ how the loser could come back</div>
                  <p className="text-[12.5px] text-ink-2 leading-snug">{sel.loser_improvement}</p>
                </div>
              )}

              {sel.k2_think_trace && (
                <div className="panel overflow-hidden mt-3">
                  <button onClick={() => setShowTrace((v) => !v)} className="w-full flex items-center justify-between px-4 py-3">
                    <span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>K2 reasoning trace · {(sel.k2_think_trace.length / 1000).toFixed(1)}k chars</span>
                    <ChevronDown size={14} className={`text-ink-3 transition ${showTrace ? 'rotate-180' : ''}`} />
                  </button>
                  {showTrace && <div className="px-4 pb-4 max-h-72 overflow-y-auto"><pre className="think-stream" style={{ fontSize: '0.68rem' }}>{sel.k2_think_trace}</pre></div>}
                </div>
              )}
            </motion.div>
          ) : (
            <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">select a match</div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
