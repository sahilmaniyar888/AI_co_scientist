import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, FlaskConical, ShieldAlert, Swords, Microscope } from 'lucide-react'
import { getHypothesis, getDebates } from '../lib/api'
import { ArchetypeBadge, GenBadge } from '../components/Badges'
import ScoreRing from '../components/ScoreRing'
import DimensionBars from '../components/DimensionBars'
import { DimensionRadar, EloLine, eloTimeline } from '../components/Charts'
import { DIMENSIONS, scoreColor } from '../lib/ui'

function Section({ icon: Icon, title, color, children }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={15} color={color ? `rgb(${color})` : 'rgb(70 229 181)'} />}
        <h2 className="label-mono" style={color ? { color: `rgb(${color})` } : undefined}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function DiscoveryCard() {
  const { runId, hid } = useParams()
  const navigate = useNavigate()
  const [h, setH] = useState(null)
  const [allDebates, setAllDebates] = useState([])

  useEffect(() => {
    getHypothesis(runId, hid).then((d) => setH(d.hypothesis)).catch(() => {})
    getDebates(runId).then((d) => setAllDebates(d.debates || [])).catch(() => {})
  }, [runId, hid])

  if (!h) return <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">loading hypothesis…</div>

  const s = h.scores || {}
  const rationale = s.rationale || {}
  const feas = rationale.feasibility || {}
  const crit = h.critique || {}

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-7 py-7">
        <button onClick={() => navigate(`/run/${runId}/portfolio`)} className="btn btn-ghost px-3 py-1.5 text-xs mb-5">
          <ArrowLeft size={13} /> Portfolio
        </button>

        {/* header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel panel-raised p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ArchetypeBadge archetype={h.archetype} />
                <GenBadge type={h.generation_type} parents={h.parent_ids} />
                <span className="font-mono text-phosphor text-sm">elo {Math.round(h.elo_score)}</span>
                <span className="font-mono text-ink-3 text-xs">{h.wins || 0}W · {h.losses || 0}L</span>
              </div>
              <h1 className="font-display text-3xl text-ink-0 mt-3 leading-tight">{h.title}</h1>
            </div>
            {s.discovery_score != null && (
              <div className="shrink-0 text-center">
                <ScoreRing value={s.discovery_score} size={88} stroke={6} label="discovery" />
              </div>
            )}
          </div>
          {s.discovery_score != null && (
            <div className="grid grid-cols-5 gap-3 mt-5">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="text-center">
                  <div className="font-mono text-lg" style={{ color: `rgb(${scoreColor(s[d.key])})` }}>{Math.round(s[d.key] ?? 0)}</div>
                  <div className="label-mono mt-0.5" style={{ fontSize: '0.5rem' }}>{d.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mt-3.5">
          <Section icon={FlaskConical} title="The hypothesis">
            <p className="text-[15px] text-ink-0 leading-relaxed">{h.statement}</p>
            {h.mechanism && <>
              <div className="label-mono mt-4 mb-1.5">Mechanism</div>
              <p className="text-[13px] text-ink-1 leading-relaxed">{h.mechanism}</p>
            </>}
            {h.assumptions?.length > 0 && <>
              <div className="label-mono mt-4 mb-1.5">Key assumptions</div>
              <ul className="space-y-1">{h.assumptions.map((a, i) => <li key={i} className="text-[13px] text-ink-1 leading-snug">· {a}</li>)}</ul>
            </>}
            {h.predicted_outcome && <>
              <div className="label-mono mt-4 mb-1.5" style={{ color: 'rgb(70 229 181)' }}>Predicted outcome</div>
              <p className="text-[13px] text-ink-1 leading-relaxed">{h.predicted_outcome}</p>
            </>}
            {h.falsifiable_prediction && <>
              <div className="label-mono mt-4 mb-1.5" style={{ color: 'rgb(255 92 122)' }}>Falsifiable prediction</div>
              <p className="text-[13px] text-ink-1 leading-relaxed">{h.falsifiable_prediction}</p>
            </>}
          </Section>

          <div className="space-y-3.5">
            {h.supporting_evidence?.length > 0 && (
              <Section icon={Microscope} title="Evidence">
                <ul className="space-y-1.5">{h.supporting_evidence.map((e, i) => (
                  <li key={i} className="text-[12.5px] text-ink-1 leading-snug pl-3 border-l-2" style={{ borderColor: 'rgb(70 229 181 / 0.4)' }}>{e}</li>
                ))}</ul>
              </Section>
            )}

            {s.discovery_score != null && (
              <Section icon={Microscope} title="Discovery profile" color="91 140 255">
                <DimensionRadar scores={s} />
                <div className="mt-2"><DimensionBars dimensions={s} compact /></div>
              </Section>
            )}

            {(feas.recommended_experiment_type || feas.estimated_cost_range) && (
              <Section icon={FlaskConical} title="Recommended experiment" color="245 181 71">
                <div className="grid grid-cols-2 gap-3 text-[13px]">
                  {feas.recommended_experiment_type && <div><div className="label-mono mb-0.5">Type</div><div className="text-ink-1">{feas.recommended_experiment_type}</div></div>}
                  {feas.estimated_cost_range && <div><div className="label-mono mb-0.5">Cost</div><div className="text-ink-1">{feas.estimated_cost_range}</div></div>}
                  {feas.estimated_time_months != null && <div><div className="label-mono mb-0.5">Timeline</div><div className="text-ink-1">{feas.estimated_time_months} months</div></div>}
                </div>
              </Section>
            )}
          </div>
        </div>

        {/* skeptic */}
        {crit.strongest_counter_argument && (
          <div className="mt-3.5">
            <Section icon={ShieldAlert} title={`Skeptic's critique · score ${crit.critique_score ?? '—'}/10`} color="255 92 122">
              <p className="text-[13px] text-ink-0 leading-relaxed">{crit.strongest_counter_argument}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4">
                {[['Logical gaps', crit.logical_gaps], ['Hidden assumptions', crit.hidden_assumptions],
                  ['Confounders', crit.confounding_variables], ['Reproducibility concerns', crit.reproducibility_concerns]]
                  .filter(([, v]) => v?.length).map(([label, items]) => (
                  <div key={label}>
                    <div className="label-mono mb-1">{label}</div>
                    <ul className="space-y-1">{items.slice(0, 3).map((x, i) => <li key={i} className="text-[12px] text-ink-2 leading-snug">· {x}</li>)}</ul>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* tournament record */}
        {h.debates?.length > 0 && (
          <div className="mt-3.5">
            <Section icon={Swords} title={`Tournament record · ${h.debates.length} matchups`} color="245 181 71">
              {allDebates.length > 0 && (
                <div className="mb-4">
                  <div className="label-mono mb-1">Elo trajectory</div>
                  <EloLine data={eloTimeline(allDebates, h.id)} />
                </div>
              )}
              <div className="space-y-1.5">
                {h.debates.map((d) => {
                  const won = d.winner_id === h.id
                  return (
                    <div key={d.id} className="flex items-center justify-between text-[12.5px] panel px-3 py-2">
                      <span className={won ? 'text-phosphor' : 'text-ink-3'}>{won ? '▲ won' : '▼ lost'} · round {d.round}</span>
                      <span className="text-ink-2 truncate flex-1 px-3">{d.deciding_factor}</span>
                    </div>
                  )
                })}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}
