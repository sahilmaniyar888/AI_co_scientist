import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Compass, Filter, Trophy, ScanSearch, Activity, ClipboardList, Database,
  ArrowRight, ExternalLink, ListChecks, Microscope,
} from 'lucide-react'
import { getRun, getHypotheses, getHypothesis } from '../lib/api'
import ScoreRing from '../components/ScoreRing'
import { DimensionRadar } from '../components/Charts'
import { scoreColor } from '../lib/ui'

const NOVELTY_C = { novel: '70 229 181', incremental: '125 211 252', recombination: '245 181 71', known: '255 92 122' }
const REALITY_C = { untested: '70 229 181', in_progress: '125 211 252', failed_before: '255 92 122', mixed: '245 181 71', established: '245 181 71' }
const PLAUS_C = { coherent: '70 229 181', uncertain: '245 181 71', incoherent: '255 92 122' }

function Verdicts({ h, size = '0.62rem' }) {
  if (!h) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {h.novelty?.verdict && <span className="chip" style={{ fontSize: size, color: `rgb(${NOVELTY_C[h.novelty.verdict] || '125 211 252'})`, borderColor: `rgb(${NOVELTY_C[h.novelty.verdict] || '125 211 252'} / 0.4)` }}>⌖ {h.novelty.verdict}</span>}
      {h.prior_failure?.verdict && <span className="chip" style={{ fontSize: size, color: `rgb(${REALITY_C[h.prior_failure.verdict] || '245 181 71'})`, borderColor: `rgb(${REALITY_C[h.prior_failure.verdict] || '245 181 71'} / 0.4)` }}>⚕ {h.prior_failure.verdict.replace(/_/g, ' ')}</span>}
      {h.plausibility?.verdict && <span className="chip" style={{ fontSize: size, color: `rgb(${PLAUS_C[h.plausibility.verdict] || '245 181 71'})`, borderColor: `rgb(${PLAUS_C[h.plausibility.verdict] || '245 181 71'} / 0.4)` }}>⚛ {h.plausibility.verdict}</span>}
    </div>
  )
}

function Section({ icon: Icon, title, color = '70 229 181', children, n }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} className="mt-9">
      <div className="flex items-center gap-2.5 mb-3.5">
        {n != null && <span className="font-mono text-ink-3 text-xs">{String(n).padStart(2, '0')}</span>}
        <Icon size={15} color={`rgb(${color})`} />
        <h2 className="label-mono" style={{ color: `rgb(${color})` }}>{title}</h2>
      </div>
      {children}
    </motion.section>
  )
}

export default function ResearchRoadmap() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [run, setRun] = useState(null)
  const [hyps, setHyps] = useState([])
  const [topDetail, setTopDetail] = useState(null)

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

  useEffect(() => {
    if (top?.hypothesis_id) getHypothesis(runId, top.hypothesis_id).then((d) => setTopDetail(d.hypothesis)).catch(() => {})
  }, [runId, top?.hypothesis_id])

  if (!run) return <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">loading report…</div>
  if (!roadmap) return (
    <div className="h-full grid place-items-center text-center">
      <div>
        <div className="dots inline-flex mb-3"><span /><span /><span /></div>
        <div className="text-ink-2 font-mono text-sm">Discovery report is being synthesized…</div>
        <button onClick={() => navigate(`/run/${runId}/live`)} className="btn btn-ghost px-4 py-2 text-sm mt-4">Back to live view</button>
      </div>
    </div>
  )

  // ---- funnel maths ----
  const emerged = stats.hypotheses ?? hyps.length
  const survivedSkeptic = emerged - (stats.eliminated ?? 0)
  const scored = hyps.filter((h) => h.scores?.discovery_score != null).length
  const surviving = hyps.filter((h) => h.status !== 'eliminated')
  const topThree = [...surviving].filter((h) => h.scores?.discovery_score != null)
    .sort((a, b) => b.scores.discovery_score - a.scores.discovery_score).slice(0, 3)
  const funnel = [
    ['Emerged', emerged, '125 211 252'],
    ['Survived Skeptic', survivedSkeptic, '167 139 250'],
    ['Reality-checked & scored', scored, '245 181 71'],
    ['Top survivors', topThree.length, '70 229 181'],
  ]
  const proto = topDetail?.protocol
  const datasets = topDetail?.datasets?.datasets || []
  const priorArt = topDetail?.novelty?.closest_prior_art || []
  const nextActions = roadmap.recommended_experiment_sequence || []

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-7 py-9">

        {/* 1 · MISSION SUMMARY */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2">
            <Compass size={15} color="rgb(70 229 181)" />
            <span className="label-mono">Discovery Report · Mission Summary</span>
          </div>
          <h1 className="font-display text-4xl text-ink-0 mt-3 leading-[1.1]">{run.title || run.domain}</h1>
          <p className="text-[15px] text-ink-1 mt-3.5 leading-relaxed max-w-3xl">{roadmap.executive_summary}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[['papers scanned', stats.papers], ['hypotheses', stats.hypotheses], ['survivors', surviving.length], ['debates', stats.debates]].map(([l, v]) => (
              <div key={l} className="panel px-4 py-3">
                <div className="font-mono text-2xl text-phosphor leading-none">{v ?? 0}</div>
                <div className="label-mono mt-1.5">{l}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* 2 · DISCOVERY FUNNEL */}
        <Section icon={Filter} title="Discovery Funnel" n={2} color="125 211 252">
          <div className="panel p-5 space-y-3">
            {funnel.map(([lbl, val, col], i) => (
              <div key={lbl} className="flex items-center gap-3">
                <span className="text-[12px] text-ink-2 w-44 shrink-0">{lbl}</span>
                <div className="flex-1 h-7 rounded-md overflow-hidden relative" style={{ background: 'rgb(140 160 200 / 0.06)' }}>
                  <motion.div initial={{ width: 0 }} whileInView={{ width: `${emerged ? Math.max(6, (val / emerged) * 100) : 0}%` }} viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.1 }}
                    className="h-full rounded-md grid place-items-start"
                    style={{ background: `linear-gradient(90deg, rgb(${col} / 0.5), rgb(${col} / 0.18))`, borderRight: `2px solid rgb(${col})` }} />
                </div>
                <span className="font-mono text-lg w-8 text-right shrink-0" style={{ color: `rgb(${col})` }}>{val}</span>
              </div>
            ))}
            <div className="text-[12px] text-ink-3 pt-1">{emerged} ideas generated → {survivedSkeptic} survived scrutiny → <span className="text-phosphor">{topThree.length} defensible discoveries</span></div>
          </div>
        </Section>

        {/* 3 · SURVIVOR PORTFOLIO */}
        <Section icon={Trophy} title="Survivor Portfolio" n={3} color="245 181 71">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {topThree.map((h, i) => (
              <button key={h.id} onClick={() => navigate(`/run/${runId}/hypothesis/${h.id}`)}
                className="panel p-4 text-left hover:border-phosphor/30 transition group flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl text-ink-3">{i + 1}</span>
                  <ScoreRing value={h.scores.discovery_score} size={52} stroke={4} />
                </div>
                <div className="text-[13.5px] text-ink-0 mt-2.5 leading-snug font-medium line-clamp-3 group-hover:text-phosphor transition">{h.title}</div>
                <div className="mt-auto pt-3"><Verdicts h={h} /></div>
              </button>
            ))}
          </div>
        </Section>

        {/* 4 · WHY THE WINNER SURVIVED */}
        {top && (
          <Section icon={ScanSearch} title="Why The Winner Survived" n={4} color="70 229 181">
            <div className="panel panel-raised p-6 scan" style={{ borderColor: 'rgb(70 229 181 / 0.3)', background: 'linear-gradient(135deg, rgb(70 229 181 / 0.06), transparent)' }}>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <span className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.4)' }}>★ Top discovery · {top.confidence_level}</span>
                  <h3 className="font-display text-2xl text-ink-0 mt-3 leading-snug">{top.title}</h3>
                  <p className="text-[13.5px] text-ink-1 mt-2.5 leading-relaxed">{top.why_top}</p>
                  <div className="mt-3.5"><Verdicts h={topDetail || topHyp} size="0.66rem" /></div>
                </div>
                {topHyp?.scores?.discovery_score != null && <ScoreRing value={topHyp.scores.discovery_score} size={96} stroke={6} label="discovery" />}
              </div>
              {topHyp?.scores && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5 pt-5 border-t hairline items-center">
                  <DimensionRadar scores={topHyp.scores} height={190} />
                  <div className="flex items-start gap-2 text-[13px]">
                    <ArrowRight size={15} className="text-phosphor mt-0.5 shrink-0" />
                    <span className="text-ink-1"><span className="label-mono">next step · </span>{top.next_step}</span>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 5 · SUPPORTING EVIDENCE */}
        {(priorArt.length > 0 || (topHyp?.supporting_evidence || []).length > 0) && (
          <Section icon={Microscope} title="Supporting Evidence" n={5} color="167 139 250">
            <div className="panel p-4 space-y-2">
              {priorArt.length > 0
                ? priorArt.slice(0, 4).map((p, i) => (
                  <div key={i} className="flex items-start gap-3 text-[12.5px]">
                    <span className="font-mono text-ink-3 shrink-0">{p.year || '—'}</span>
                    <div><span className="text-ink-0">{p.title}</span>{p.overlap && <span className="text-ink-3"> — {p.overlap}</span>}</div>
                  </div>
                ))
                : (topHyp.supporting_evidence || []).slice(0, 4).map((e, i) => (
                  <div key={i} className="text-[12.5px] text-ink-1 pl-3 border-l-2" style={{ borderColor: 'rgb(167 139 250 / 0.4)' }}>{e}</div>
                ))}
            </div>
          </Section>
        )}

        {/* 6 · EXPERIMENTAL PROTOCOL */}
        {proto?.steps?.length > 0 && (
          <Section icon={ClipboardList} title="Experimental Protocol" n={6} color="70 229 181">
            <div className="panel p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="text-[15px] text-ink-0 font-medium">{proto.protocol_name}</div>
                <div className="flex gap-2">
                  <span className="chip">{proto.experiment_type?.replace(/_/g, ' ')}</span>
                  {proto.budget_estimate && <span className="chip" style={{ color: 'rgb(245 181 71)', borderColor: 'rgb(245 181 71 / 0.3)' }}>${proto.budget_estimate.low_usd?.toLocaleString()}–{proto.budget_estimate.high_usd?.toLocaleString()}</span>}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                {proto.steps.slice(0, 6).map((s) => (
                  <div key={s.step_number} className="flex gap-2.5 text-[12.5px]">
                    <span className="font-mono text-phosphor shrink-0">{String(s.step_number).padStart(2, '0')}</span>
                    <span className="text-ink-1">{s.title} <span className="text-ink-3">· {s.duration}</span></span>
                  </div>
                ))}
              </div>
              <button onClick={() => navigate(`/run/${runId}/hypothesis/${top.hypothesis_id}`)} className="label-mono mt-3 hover:text-phosphor">full protocol →</button>
            </div>
          </Section>
        )}

        {/* 7 · VALIDATION DATASETS */}
        {datasets.length > 0 && (
          <Section icon={Database} title="Validation Datasets" n={7} color="91 140 255">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {datasets.slice(0, 4).map((d, i) => (
                <div key={i} className="panel px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="chip" style={{ color: 'rgb(91 140 255)', borderColor: 'rgb(91 140 255 / 0.3)' }}>{d.source}</span>
                    <span className="font-mono text-[11px] text-ink-2">{d.accession}</span>
                  </div>
                  <div className="text-[12.5px] text-ink-1 mt-1.5 leading-snug">{d.title}</div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* 8 · RECOMMENDED NEXT ACTIONS */}
        {nextActions.length > 0 && (
          <Section icon={ListChecks} title="Recommended Next Actions" n={8} color="70 229 181">
            <div className="panel p-5">
              <ol className="space-y-2.5">
                {nextActions.slice(0, 5).map((e, i) => (
                  <li key={i} className="flex items-start gap-3 text-[13.5px] text-ink-1 leading-snug">
                    <span className="grid place-items-center w-5 h-5 rounded-md shrink-0 font-mono text-[11px] mt-0.5" style={{ background: 'rgb(70 229 181 / 0.12)', color: 'rgb(70 229 181)' }}>{i + 1}</span>
                    {e}
                  </li>
                ))}
              </ol>
            </div>
          </Section>
        )}

        {/* IN SHORT — what / how / what next */}
        <motion.div initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="panel panel-raised p-6 mt-10" style={{ background: 'linear-gradient(135deg, rgb(70 229 181 / 0.05), transparent 60%)', borderColor: 'rgb(70 229 181 / 0.25)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Compass size={15} color="rgb(70 229 181)" />
            <span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>In short</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5"><Trophy size={13} color="rgb(70 229 181)" /><span className="label-mono">What we found</span></div>
              <p className="text-[13px] text-ink-1 leading-snug">
                <span className="text-ink-0">{topThree.length}</span> defensible discoveries — led by <span className="text-ink-0">{top?.title || (topThree[0]?.title)}</span>.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5"><Filter size={13} color="rgb(125 211 252)" /><span className="label-mono">How we did it</span></div>
              <p className="text-[13px] text-ink-1 leading-snug">
                Read <span className="text-ink-0">{stats.papers ?? 0}</span> papers → generated <span className="text-ink-0">{emerged}</span> hypotheses → Skeptic cut <span className="text-ink-0">{stats.eliminated ?? 0}</span> → <span className="text-ink-0">{stats.debates ?? 0}</span> debates → 3 grounded reality checks (literature · trials · mechanism).
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5"><ArrowRight size={13} color="rgb(245 181 71)" /><span className="label-mono">What to do next</span></div>
              <p className="text-[13px] text-ink-1 leading-snug">{top?.next_step || nextActions[0] || 'Validate the leading hypothesis with the recommended protocol.'}</p>
            </div>
          </div>
        </motion.div>

        {roadmap.what_would_change_everything && (
          <div className="panel p-5 mt-3.5 scan" style={{ borderColor: 'rgb(70 229 181 / 0.25)' }}>
            <div className="label-mono mb-2" style={{ color: 'rgb(70 229 181)' }}>What would change everything</div>
            <p className="text-[15px] text-ink-0 leading-relaxed font-display italic">{roadmap.what_would_change_everything}</p>
          </div>
        )}

        <div className="flex items-center gap-2 mt-8 mb-2 text-ink-3">
          <Activity size={13} />
          <span className="label-mono">Research memory saved · {run.domain} — future runs build on these findings</span>
        </div>
      </div>
    </div>
  )
}
