import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronDown, Trophy } from 'lucide-react'
import { getDebates } from '../lib/api'

export default function TournamentViewer() {
  const { runId } = useParams()
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

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-7 py-5 border-b hairline">
        <h1 className="font-display text-2xl text-ink-0">Tournament</h1>
        <p className="text-ink-2 text-sm mt-1">{debates.length} Elo matchups across {rounds.length} rounds — K2 judges which hypothesis has greater discovery potential.</p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,40%)_minmax(0,60%)]">
        {/* matchup list */}
        <div className="overflow-y-auto border-r hairline p-4">
          {rounds.map((r) => (
            <div key={r} className="mb-5">
              <div className="label-mono mb-2">Round {r}</div>
              <div className="space-y-1.5">
                {debates.filter((d) => d.round === r).map((d) => {
                  const active = sel === d
                  const aWon = d.winner_id === d.hyp_a_id
                  return (
                    <button key={d.id} onClick={() => setSel(d)}
                      className={`w-full panel px-3 py-2.5 text-left transition ${active ? 'border-phosphor/40' : 'hover:border-phosphor/20'}`}
                      style={active ? { background: 'rgb(70 229 181 / 0.06)' } : undefined}>
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className={`flex-1 truncate ${aWon ? 'text-ink-0' : 'text-ink-3'}`}>{title(d.hyp_a_id)}</span>
                        <Trophy size={11} className="shrink-0" color="rgb(245 181 71)" style={{ transform: aWon ? 'none' : 'scaleX(-1)' }} />
                        <span className={`flex-1 truncate text-right ${!aWon ? 'text-ink-0' : 'text-ink-3'}`}>{title(d.hyp_b_id)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="label-mono" style={{ fontSize: '0.5rem' }}>{d.margin} verdict</span>
                        <span className="font-mono text-phosphor" style={{ fontSize: '0.6rem' }}>winner ↑</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {debates.length === 0 && <div className="text-ink-3 font-mono text-xs text-center py-10">no debates yet…</div>}
        </div>

        {/* detail */}
        <div className="overflow-y-auto p-6">
          {sel ? (
            <motion.div key={sel.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="label-mono mb-4" style={{ color: 'rgb(245 181 71)' }}>⚔ Round {sel.round} · {sel.margin} verdict</div>
              <div className="grid grid-cols-2 gap-3">
                {[['a', sel.hyp_a_id], ['b', sel.hyp_b_id]].map(([side, id]) => {
                  const won = sel.winner_id === id
                  return (
                    <div key={side} className="panel p-4" style={won ? { borderColor: 'rgb(70 229 181 / 0.4)', background: 'rgb(70 229 181 / 0.05)' } : undefined}>
                      <div className="flex items-center justify-between">
                        <span className="label-mono">{side === 'a' ? 'Hypothesis A' : 'Hypothesis B'}</span>
                        {won && <span className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.4)' }}>winner</span>}
                      </div>
                      <div className="text-sm text-ink-0 mt-2 leading-snug">{title(id)}</div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 space-y-3">
                <div className="panel p-4" style={{ background: 'rgb(91 140 255 / 0.05)', borderColor: 'rgb(91 140 255 / 0.2)' }}>
                  <div className="label-mono mb-1.5" style={{ color: 'rgb(91 140 255)' }}>Case for A</div>
                  <p className="text-[13px] text-ink-1 leading-relaxed">{sel.a_argument || '—'}</p>
                </div>
                <div className="panel p-4">
                  <div className="label-mono mb-1.5">Case for B</div>
                  <p className="text-[13px] text-ink-1 leading-relaxed">{sel.b_argument || '—'}</p>
                </div>
                <div className="panel p-4" style={{ background: 'rgb(245 181 71 / 0.06)', borderColor: 'rgb(245 181 71 / 0.25)' }}>
                  <div className="label-mono mb-1.5" style={{ color: 'rgb(245 181 71)' }}>⚖ K2 verdict — deciding factor</div>
                  <p className="text-[13px] text-ink-0 leading-relaxed">{sel.deciding_factor || '—'}</p>
                  {sel.loser_improvement && <p className="text-[12px] text-ink-2 mt-2 leading-relaxed">↑ To improve the loser: {sel.loser_improvement}</p>}
                </div>

                {sel.k2_think_trace && (
                  <div className="panel overflow-hidden">
                    <button onClick={() => setShowTrace((v) => !v)} className="w-full flex items-center justify-between px-4 py-3">
                      <span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>K2 reasoning trace</span>
                      <ChevronDown size={14} className={`text-ink-3 transition ${showTrace ? 'rotate-180' : ''}`} />
                    </button>
                    {showTrace && (
                      <div className="px-4 pb-4 max-h-72 overflow-y-auto">
                        <pre className="think-stream" style={{ fontSize: '0.68rem' }}>{sel.k2_think_trace}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">select a matchup</div>
          )}
        </div>
      </div>
    </div>
  )
}
