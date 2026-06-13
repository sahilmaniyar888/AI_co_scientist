import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Compass, Zap, AlertTriangle, Telescope, Sparkles, Database, ArrowRight } from 'lucide-react'
import { getRun, getHypotheses } from '../lib/api'
import ScoreRing from '../components/ScoreRing'
import { DimensionRadar, ScoreLeaderboard, ArchetypeDonut } from '../components/Charts'
import { scoreColor } from '../lib/ui'

export default function ResearchRoadmap() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [hyps, setHyps] = useState([])

  useEffect(() => {
    let stop = false
    const load = () => {
      getRun(runId).then((r) => { if (!stop) setRun(r) }).catch(() => {})
      getHypotheses(runId).then((d) => { if (!stop) setHyps(d.hypotheses) }).catch(() => {})
    }
    load()
    const iv = setInterval(() => { if (!run || run.status !== 'complete') load() }, 4000)
    return () => { stop = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const roadmap = run?.meta?.roadmap
  const stats = run?.meta?.stats || {}
  const byId = Object.fromEntries(hyps.map((h) => [h.id, h]))
  const top = roadmap?.top_discovery
  const topHyp = top ? byId[top.hypothesis_id] : null

  if (!run) return <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">loading roadmap…</div>
  if (!roadmap) return (
    <div className="h-full grid place-items-center text-center">
      <div>
        <div className="dots inline-flex mb-3"><span /><span /><span /></div>
        <div className="text-ink-2 font-mono text-sm">Roadmap is being synthesized…</div>
        <button onClick={() => navigate(`/run/${runId}/live`)} className="btn btn-ghost px-4 py-2 text-sm mt-4">Back to live view</button>
      </div>
    </div>
  )

  const portfolio = (roadmap.discovery_portfolio || []).map((p) => ({ ...p, h: byId[p.hypothesis_id] }))

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-7 py-8">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2">
            <Compass size={16} color="rgb(70 229 181)" />
            <span className="label-mono">Research Roadmap</span>
          </div>
          <h1 className="font-display text-4xl text-ink-0 mt-3 leading-tight">{run.title || run.domain}</h1>
          <p className="text-[15px] text-ink-1 mt-4 leading-relaxed max-w-3xl">{roadmap.executive_summary}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5">
            {[['papers', stats.papers], ['hypotheses', stats.hypotheses], ['eliminated', stats.eliminated],
              ['debates', stats.debates], ['gaps', stats.gaps], ['contradictions', stats.contradictions]]
              .map(([l, v]) => (
              <div key={l} className="flex items-baseline gap-1.5">
                <span className="font-mono text-phosphor">{v ?? 0}</span>
                <span className="label-mono">{l}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* top discovery */}
        {top && (
          <motion.button
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            onClick={() => topHyp && navigate(`/run/${runId}/hypothesis/${top.hypothesis_id}`)}
            className="panel panel-raised w-full text-left p-6 mt-7 scan"
            style={{ borderColor: 'rgb(70 229 181 / 0.3)', background: 'linear-gradient(135deg, rgb(70 229 181 / 0.06), transparent)' }}>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.4)' }}>
                  ★ Top discovery · {top.confidence_level}
                </div>
                <h2 className="font-display text-2xl text-ink-0 mt-3 leading-snug">{top.title}</h2>
                <p className="text-[13.5px] text-ink-1 mt-2.5 leading-relaxed">{top.why_top}</p>
                <div className="mt-4 flex items-start gap-2 text-[13px]">
                  <ArrowRight size={15} className="text-phosphor mt-0.5 shrink-0" />
                  <span className="text-ink-1"><span className="label-mono">next step · </span>{top.next_step}</span>
                </div>
              </div>
              {topHyp?.scores?.discovery_score != null && (
                <ScoreRing value={topHyp.scores.discovery_score} size={92} stroke={6} label="discovery" />
              )}
            </div>
          </motion.button>
        )}

        {/* analytics row */}
        {byId && Object.keys(byId).length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 mt-3.5">
            <div className="panel p-4">
              <div className="label-mono mb-2">Discovery scores</div>
              <ScoreLeaderboard rows={hyps.filter((x) => x.scores).map((x) => ({ title: x.title, score: x.scores.discovery_score }))} />
            </div>
            <div className="panel p-4 flex flex-col">
              <div className="label-mono mb-2">Top-discovery profile</div>
              {topHyp?.scores ? <DimensionRadar scores={topHyp.scores} height={200} />
                : <div className="flex-1 grid place-items-center text-ink-3 font-mono text-xs">—</div>}
            </div>
            <div className="panel p-4">
              <div className="label-mono mb-2">Surviving archetypes</div>
              <ArchetypeDonut hypotheses={hyps} height={200} />
            </div>
          </div>
        )}

        {/* portfolio */}
        {portfolio.length > 0 && (
          <div className="mt-7">
            <div className="flex items-center gap-2 mb-3"><Sparkles size={14} color="rgb(70 229 181)" /><span className="label-mono">Discovery portfolio</span></div>
            <div className="panel overflow-hidden">
              {portfolio.map((p, i) => {
                const ds = p.h?.scores?.discovery_score
                return (
                  <button key={i} onClick={() => p.h && navigate(`/run/${runId}/hypothesis/${p.hypothesis_id}`)}
                    className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[0.02] border-b hairline last:border-0 transition">
                    <span className="font-display text-xl text-ink-3 w-7 shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink-0 truncate">{p.title || p.h?.title}</div>
                      <div className="text-[12px] text-ink-2 truncate mt-0.5">{p.rationale}</div>
                    </div>
                    {ds != null && <span className="font-mono shrink-0" style={{ color: `rgb(${scoreColor(ds)})` }}>{Math.round(ds)}</span>}
                    {p.h && <span className="font-mono text-phosphor text-xs shrink-0">elo {Math.round(p.h.elo_score)}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mt-7">
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-3"><AlertTriangle size={14} color="rgb(255 92 122)" /><span className="label-mono" style={{ color: 'rgb(255 92 122)' }}>Key contradictions</span></div>
            <div className="space-y-3">
              {(roadmap.key_contradictions || []).map((c, i) => (
                <div key={i}><p className="text-[13px] text-ink-1 leading-snug">{c.summary}</p>
                  {c.implication && <p className="text-[11.5px] text-ink-3 mt-1 leading-snug">→ {c.implication}</p>}</div>
              ))}
              {!(roadmap.key_contradictions || []).length && <div className="text-ink-3 text-xs font-mono">none surfaced</div>}
            </div>
          </div>
          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-3"><Telescope size={14} color="rgb(245 181 71)" /><span className="label-mono" style={{ color: 'rgb(245 181 71)' }}>Most valuable gaps</span></div>
            <div className="space-y-3">
              {(roadmap.most_valuable_gaps || []).map((g, i) => (
                <div key={i}><p className="text-[13px] text-ink-1 leading-snug">{g.title}</p>
                  {g.why && <p className="text-[11.5px] text-ink-3 mt-1 leading-snug">{g.why}</p>}</div>
              ))}
            </div>
          </div>
          <div className="panel p-5" style={{ background: 'rgb(167 139 250 / 0.05)', borderColor: 'rgb(167 139 250 / 0.2)' }}>
            <div className="flex items-center gap-2 mb-3"><Zap size={14} color="rgb(167 139 250)" /><span className="label-mono" style={{ color: 'rgb(167 139 250)' }}>Surprise finding</span></div>
            <p className="text-[13px] text-ink-1 leading-relaxed">{roadmap.surprise_findings}</p>
          </div>
        </div>

        {/* experiment sequence */}
        {(roadmap.recommended_experiment_sequence || []).length > 0 && (
          <div className="panel p-5 mt-3.5">
            <div className="label-mono mb-3">Recommended experiment sequence · highest ROI first</div>
            <ol className="space-y-2">
              {roadmap.recommended_experiment_sequence.map((e, i) => (
                <li key={i} className="flex items-start gap-3 text-[13.5px] text-ink-1 leading-snug">
                  <span className="font-mono text-phosphor shrink-0">{String(i + 1).padStart(2, '0')}</span>{e}
                </li>
              ))}
            </ol>
          </div>
        )}

        {roadmap.what_would_change_everything && (
          <div className="panel p-5 mt-3.5 scan" style={{ borderColor: 'rgb(70 229 181 / 0.25)' }}>
            <div className="label-mono mb-2" style={{ color: 'rgb(70 229 181)' }}>What would change everything</div>
            <p className="text-[14px] text-ink-0 leading-relaxed font-display italic">{roadmap.what_would_change_everything}</p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-7 text-ink-3">
          <Database size={13} />
          <span className="label-mono">Research memory saved for domain · {run.domain} — future runs extend beyond these findings</span>
        </div>
      </div>
    </div>
  )
}
