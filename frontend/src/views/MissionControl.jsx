import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Play, Settings2, Zap, ChevronRight, Clock } from 'lucide-react'
import { getDemos, getRuns, launchRun } from '../lib/api'
import { useStore } from '../store'

const PLACEHOLDER =
  'e.g. What mechanisms drive treatment resistance in triple-negative breast cancer, and which approved drugs might overcome it?'

function Slider({ label, value, min, max, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="label-mono">{label}</span>
        <span className="font-mono text-phosphor text-sm">{value}</span>
      </div>
      <input type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-phosphor" style={{ accentColor: 'rgb(70 229 181)' }} />
    </div>
  )
}

export default function MissionControl() {
  const navigate = useNavigate()
  const reset = useStore((s) => s.resetLive)
  const [demos, setDemos] = useState([])
  const [runs, setRuns] = useState([])
  const [goal, setGoal] = useState('')
  const [activeDemo, setActiveDemo] = useState(null)
  const [maxHyp, setMaxHyp] = useState(18)
  const [rounds, setRounds] = useState(3)
  const [showSettings, setShowSettings] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [source, setSource] = useState('PubMed')

  useEffect(() => {
    getDemos().then(setDemos).catch(() => {})
    getRuns().then(setRuns).catch(() => {})
  }, [])

  function pickDemo(d) {
    setActiveDemo(d.id)
    setGoal(d.goal)
    setMaxHyp(d.max_hypotheses)
    setRounds(d.debate_rounds)
    setSource(d.source)
  }

  async function launch(demoId = null) {
    if (launching) return
    if (!demoId && !goal.trim()) return
    setLaunching(true)
    try {
      const body = demoId
        ? { demo_id: demoId, max_hypotheses: maxHyp, debate_rounds: rounds }
        : { goal, source, max_hypotheses: maxHyp, debate_rounds: rounds, demo_id: activeDemo }
      const res = await launchRun(body)
      reset(res.run_id, res.goal)
      navigate(`/run/${res.run_id}/live`)
    } catch {
      setLaunching(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12">
        {/* hero */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.3)' }}>
            <span className="live-dot relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(70 229 181)' }} />
            Autonomous Scientific Discovery
          </div>
          <h1 className="font-display text-5xl md:text-6xl font-semibold text-ink-0 mt-5 leading-[1.05] tracking-tight">
            Find the hypotheses<br />
            <span className="italic" style={{ color: 'rgb(70 229 181)' }}>worth pursuing next.</span>
          </h1>
          <p className="text-ink-2 mt-4 max-w-2xl leading-relaxed">
            A cyclical multi-agent engine reads the literature, maps what's known, hunts for
            gaps and contradictions, then generates, critiques, and battles hypotheses in an
            Elo tournament — ranked by a transparent discovery score.
          </p>
        </motion.div>

        {/* goal input */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="panel panel-raised mt-9 p-1.5">
          <textarea
            value={goal} onChange={(e) => { setGoal(e.target.value); setActiveDemo(null) }}
            placeholder={PLACEHOLDER} rows={3}
            className="input-base px-4 py-3.5 text-[15px] leading-relaxed"
          />
          <div className="flex items-center justify-between px-3 pb-2 pt-1">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSettings((v) => !v)} className="btn btn-ghost px-3 py-1.5 text-xs">
                <Settings2 size={13} /> Agent settings
              </button>
              <select value={source} onChange={(e) => setSource(e.target.value)}
                className="btn btn-ghost px-3 py-1.5 text-xs bg-transparent">
                <option value="PubMed" className="bg-bg-1">PubMed</option>
                <option value="ArXiv" className="bg-bg-1">ArXiv</option>
              </select>
            </div>
            <button onClick={() => launch()} disabled={launching || !goal.trim()}
              className="btn btn-primary px-5 py-2.5 disabled:opacity-40">
              {launching ? 'Launching…' : <>Launch discovery <Play size={15} /></>}
            </button>
          </div>
          {showSettings && (
            <div className="grid grid-cols-2 gap-6 px-4 pb-4 pt-2 border-t hairline">
              <Slider label="Max hypotheses" value={maxHyp} min={10} max={30} onChange={setMaxHyp} />
              <Slider label="Debate rounds" value={rounds} min={1} max={5} onChange={setRounds} />
            </div>
          )}
        </motion.div>

        {/* competition mode */}
        <motion.button
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          onClick={() => launch('liver_fibrosis')} disabled={launching}
          className="mt-4 w-full panel flex items-center justify-between px-5 py-3.5 group hover:border-phosphor/40 transition"
          style={{ borderColor: 'rgb(245 181 71 / 0.25)', background: 'rgb(245 181 71 / 0.05)' }}>
          <span className="flex items-center gap-2.5 text-sm">
            <Zap size={16} color="rgb(245 181 71)" />
            <span className="text-ink-0 font-semibold">Competition Mode</span>
            <span className="text-ink-2">— one-click liver-fibrosis demo, full pipeline</span>
          </span>
          <ChevronRight size={16} className="text-ink-3 group-hover:translate-x-1 transition" />
        </motion.button>

        {/* demos */}
        <div className="mt-11">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={15} color="rgb(70 229 181)" />
            <h2 className="label-mono">Pre-built demonstrations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {demos.map((d, i) => (
              <motion.button
                key={d.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                onClick={() => pickDemo(d)}
                className={`panel text-left p-5 transition group ${activeDemo === d.id ? 'border-phosphor/50' : 'hover:border-phosphor/25'}`}
                style={activeDemo === d.id ? { background: 'rgb(70 229 181 / 0.06)' } : undefined}>
                <div className="label-mono" style={{ color: 'rgb(70 229 181)' }}>{d.domain}</div>
                <h3 className="font-display text-lg text-ink-0 mt-2 leading-snug">{d.title}</h3>
                <p className="text-ink-2 text-[13px] mt-2 leading-relaxed line-clamp-3">{d.description}</p>
                <div className="flex items-center justify-between mt-4">
                  <span className="label-mono">{d.source} · {d.max_hypotheses} hyp</span>
                  <span className="text-xs text-phosphor opacity-0 group-hover:opacity-100 transition">Load →</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* past runs */}
        {runs.length > 0 && (
          <div className="mt-11">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-ink-3" />
              <h2 className="label-mono">Recent sessions · research memory</h2>
            </div>
            <div className="panel divide-y" style={{ borderColor: 'transparent' }}>
              {runs.slice(0, 6).map((r) => (
                <button key={r.id} onClick={() => navigate(`/run/${r.id}/${r.status === 'complete' ? 'roadmap' : 'live'}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition border-b hairline last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-ink-1 truncate">{r.title || r.goal}</div>
                    <div className="label-mono mt-0.5">{r.domain || '—'}</div>
                  </div>
                  <span className={`chip ml-3 shrink-0 ${r.status === 'complete' ? '' : 'animate-pulse'}`}
                    style={{ color: r.status === 'complete' ? 'rgb(70 229 181)' : 'rgb(245 181 71)',
                             borderColor: r.status === 'complete' ? 'rgb(70 229 181 / 0.3)' : 'rgb(245 181 71 / 0.3)' }}>
                    {r.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
