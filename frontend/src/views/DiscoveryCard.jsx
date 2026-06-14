import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, FlaskConical, ShieldAlert, Swords, Microscope, ClipboardList, Database, ExternalLink, ScanSearch, Activity, Atom } from 'lucide-react'
import { getHypothesis, getDebates } from '../lib/api'
import { ArchetypeBadge, GenBadge } from '../components/Badges'
import ScoreRing from '../components/ScoreRing'
import DimensionBars from '../components/DimensionBars'
import { DimensionRadar, EloLine, eloTimeline } from '../components/Charts'
import { DIMENSIONS, scoreColor } from '../lib/ui'

const VERDICT_META = {
  novel: { color: '70 229 181', label: 'Novel', note: 'No close prior art found.' },
  incremental: { color: '125 211 252', label: 'Incremental', note: 'An advance over existing work.' },
  recombination: { color: '245 181 71', label: 'Recombination', note: 'Combines already-published components.' },
  known: { color: '255 92 122', label: 'Already known', note: 'Substantially already published.' },
}

const FAILURE_META = {
  untested: { color: '70 229 181', label: 'Clinically untested', note: 'No registered trials found for this approach.' },
  in_progress: { color: '125 211 252', label: 'In trials', note: 'Currently under clinical investigation.' },
  failed_before: { color: '255 92 122', label: 'Failed before', note: 'A prior trial was terminated or withdrawn.' },
  mixed: { color: '245 181 71', label: 'Mixed evidence', note: 'Prior trials show mixed results.' },
  established: { color: '245 181 71', label: 'Already tried', note: 'This intervention has prior trial history.' },
}

const PLAUS_META = {
  coherent: { color: '70 229 181', label: 'Mechanistically coherent', note: 'The proposed mechanism holds up against known biology.' },
  uncertain: { color: '245 181 71', label: 'Mechanistically uncertain', note: 'Parts of the mechanism are unverified.' },
  incoherent: { color: '255 92 122', label: 'Mechanistically incoherent', note: 'The mechanism conflicts with established biology.' },
}

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
  const nov = h.novelty || null
  const vmeta = nov ? (VERDICT_META[nov.verdict] || VERDICT_META.incremental) : null
  const pf = h.prior_failure || null
  const fmeta = pf ? (FAILURE_META[pf.verdict] || FAILURE_META.untested) : null
  const trials = h.trials || []
  const pl = h.plausibility || null
  const pmeta = pl ? (PLAUS_META[pl.verdict] || PLAUS_META.uncertain) : null

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
                <span className="font-mono text-ink-3 text-xs" title="Pairwise debate preference signal — secondary to the discovery score">elo {Math.round(h.elo_score)} · {h.wins || 0}W·{h.losses || 0}L</span>
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

        {/* grounded novelty / prior-art check */}
        {nov && (
          <div className="mt-3.5">
            <Section icon={ScanSearch} title="Prior-art check — grounded against live literature" color={vmeta.color}>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <span className="chip text-[12px]" style={{ color: `rgb(${vmeta.color})`, borderColor: `rgb(${vmeta.color} / 0.4)`, background: `rgb(${vmeta.color} / 0.08)` }}>
                  {vmeta.label}
                </span>
                <span className="text-[12px] text-ink-3">{vmeta.note}</span>
                <div className="flex items-center gap-4 ml-auto font-mono text-[12px]">
                  <span className="text-ink-3">grounded novelty <span className="text-base" style={{ color: `rgb(${vmeta.color})` }}>{Math.round(nov.novelty_score ?? 0)}</span></span>
                  {h.prior_art?.length > 0 && <span className="text-ink-3">{h.prior_art.length} papers checked</span>}
                </div>
              </div>
              {nov.assessment && <p className="text-[13px] text-ink-1 leading-relaxed">{nov.assessment}</p>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4">
                {nov.components_known?.length > 0 && (
                  <div>
                    <div className="label-mono mb-1" style={{ color: 'rgb(245 181 71)' }}>Already in the literature</div>
                    <ul className="space-y-1">{nov.components_known.slice(0, 6).map((c, i) => <li key={i} className="text-[12px] text-ink-2 leading-snug">· {c}</li>)}</ul>
                  </div>
                )}
                {nov.novel_element && (
                  <div>
                    <div className="label-mono mb-1" style={{ color: 'rgb(70 229 181)' }}>What appears genuinely new</div>
                    <p className="text-[12px] text-ink-1 leading-snug">{nov.novel_element}</p>
                  </div>
                )}
              </div>

              {nov.closest_prior_art?.length > 0 && (
                <div className="mt-4">
                  <div className="label-mono mb-2">Closest existing work</div>
                  <div className="space-y-1.5">
                    {nov.closest_prior_art.slice(0, 4).map((p, i) => {
                      const match = (h.prior_art || []).find((x) => x.title === p.title)
                      const url = match?.oa_id ? `https://openalex.org/${match.oa_id}` : null
                      return (
                        <div key={i} className="panel px-3 py-2">
                          <div className="flex items-start gap-2 text-[12.5px]">
                            <span className="font-mono text-ink-3 shrink-0">{p.year || '—'}</span>
                            <div className="min-w-0">
                              {url ? (
                                <a href={url} target="_blank" rel="noreferrer" className="text-ink-0 hover:text-phosphor inline-flex items-center gap-1">{p.title} <ExternalLink size={11} /></a>
                              ) : <span className="text-ink-0">{p.title}</span>}
                              {p.overlap && <div className="text-[11.5px] text-ink-2 leading-snug mt-0.5">{p.overlap}</div>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* reality check — already tried clinically? */}
        {pf && (
          <div className="mt-3.5">
            <Section icon={Activity} title="Reality check — has this already been tried?" color={fmeta.color}>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <span className="chip text-[12px]" style={{ color: `rgb(${fmeta.color})`, borderColor: `rgb(${fmeta.color} / 0.4)`, background: `rgb(${fmeta.color} / 0.08)` }}>
                  {fmeta.label}
                </span>
                <span className="text-[12px] text-ink-3">{fmeta.note}</span>
                {trials.length > 0 && (
                  <span className="font-mono text-[12px] text-ink-3 ml-auto">
                    {trials.length} trials checked
                    {trials.some((t) => t.failed) && <span style={{ color: 'rgb(255 92 122)' }}> · {trials.filter((t) => t.failed).length} terminated/withdrawn</span>}
                  </span>
                )}
              </div>
              {pf.caution && (
                <div className="text-[12.5px] mb-2 px-3 py-2 rounded-md" style={{ color: 'rgb(255 92 122)', background: 'rgb(255 92 122 / 0.08)', border: '1px solid rgb(255 92 122 / 0.2)' }}>⚠ {pf.caution}</div>
              )}
              {pf.assessment && <p className="text-[13px] text-ink-1 leading-relaxed">{pf.assessment}</p>}

              {trials.length > 0 && (
                <div className="mt-4">
                  <div className="label-mono mb-2">Registered trials (ClinicalTrials.gov)</div>
                  <div className="space-y-1.5">
                    {trials.slice(0, 6).map((t, i) => (
                      <div key={i} className="panel px-3 py-2">
                        <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
                          <span className="chip" style={{ fontSize: '0.6rem', color: t.failed ? 'rgb(255 92 122)' : 'rgb(124 134 156)', borderColor: t.failed ? 'rgb(255 92 122 / 0.4)' : 'rgb(140 160 200 / 0.2)' }}>{t.status}</span>
                          {t.phase && <span className="font-mono text-[10px] text-ink-3">{t.phase}</span>}
                          <a href={t.url} target="_blank" rel="noreferrer" className="text-ink-0 hover:text-phosphor inline-flex items-center gap-1 min-w-0">
                            <span className="truncate">{t.title}</span><ExternalLink size={11} className="shrink-0" />
                          </a>
                        </div>
                        {t.why_stopped && <div className="text-[11.5px] mt-0.5" style={{ color: 'rgb(255 92 122)' }}>stopped: {t.why_stopped}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}

        {/* mechanistic plausibility */}
        {pl && (
          <div className="mt-3.5">
            <Section icon={Atom} title="Mechanistic plausibility — does the biology hold up?" color={pmeta.color}>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <span className="chip text-[12px]" style={{ color: `rgb(${pmeta.color})`, borderColor: `rgb(${pmeta.color} / 0.4)`, background: `rgb(${pmeta.color} / 0.08)` }}>
                  {pmeta.label}
                </span>
                <span className="text-[12px] text-ink-3">{pmeta.note}</span>
                <div className="flex items-center gap-4 ml-auto font-mono text-[12px]">
                  <span className="text-ink-3">coherence <span className="text-base" style={{ color: `rgb(${pmeta.color})` }}>{Math.round(pl.plausibility_score ?? 0)}</span></span>
                  {pl.penalty > 0 && <span style={{ color: 'rgb(255 92 122)' }}>−{Math.round(pl.penalty)} penalty</span>}
                </div>
              </div>
              {pl.assessment && <p className="text-[13px] text-ink-1 leading-relaxed">{pl.assessment}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-4">
                {pl.concerns?.length > 0 && (
                  <div>
                    <div className="label-mono mb-1" style={{ color: 'rgb(255 92 122)' }}>Mechanistic concerns</div>
                    <ul className="space-y-1">{pl.concerns.slice(0, 5).map((c, i) => <li key={i} className="text-[12px] text-ink-2 leading-snug">· {c}</li>)}</ul>
                  </div>
                )}
                {pl.key_factors?.length > 0 && (
                  <div>
                    <div className="label-mono mb-1">Key mechanistic factors</div>
                    <ul className="space-y-1">{pl.key_factors.slice(0, 5).map((c, i) => <li key={i} className="text-[12px] text-ink-2 leading-snug">· {c}</li>)}</ul>
                  </div>
                )}
              </div>
            </Section>
          </div>
        )}

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

        {/* experiment protocol */}
        {h.protocol?.steps?.length > 0 && (
          <div className="mt-3.5">
            <Section icon={ClipboardList} title="Experiment protocol — start tomorrow" color="70 229 181">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="text-[15px] text-ink-0 font-medium">{h.protocol.protocol_name}</div>
                <div className="flex gap-2">
                  <span className="chip">{h.protocol.experiment_type?.replace(/_/g, ' ')}</span>
                  {h.protocol.timeline?.total_duration && <span className="chip">{h.protocol.timeline.total_duration}</span>}
                  {h.protocol.budget_estimate && (
                    <span className="chip" style={{ color: 'rgb(245 181 71)', borderColor: 'rgb(245 181 71 / 0.3)' }}>
                      ${h.protocol.budget_estimate.low_usd?.toLocaleString()}–{h.protocol.budget_estimate.high_usd?.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              {h.protocol.objective && <p className="text-[13px] text-ink-1 leading-relaxed mb-4">{h.protocol.objective}</p>}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <div className="label-mono mb-2">Procedure</div>
                  <ol className="space-y-2.5">
                    {h.protocol.steps.map((s) => (
                      <li key={s.step_number} className="flex gap-3">
                        <span className="font-mono text-phosphor shrink-0 text-sm">{String(s.step_number).padStart(2, '0')}</span>
                        <div>
                          <div className="text-[13px] text-ink-0">{s.title} <span className="text-ink-3 font-mono text-[11px]">· {s.duration}</span></div>
                          <div className="text-[12px] text-ink-2 leading-snug mt-0.5">{s.procedure}</div>
                          {s.critical_parameter && <div className="text-[11px] mt-0.5" style={{ color: 'rgb(245 181 71)' }}>⚠ {s.critical_parameter}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="space-y-4">
                  {h.protocol.materials?.length > 0 && (
                    <div>
                      <div className="label-mono mb-2">Materials</div>
                      <div className="space-y-1">
                        {h.protocol.materials.map((m, i) => (
                          <div key={i} className="flex items-center justify-between text-[12px] panel px-2.5 py-1.5">
                            <span className="text-ink-1">{m.item} <span className="text-ink-3">{m.quantity}</span></span>
                            {m.estimated_cost_usd != null && <span className="font-mono text-ink-2">${Number(m.estimated_cost_usd).toLocaleString()}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {h.protocol.controls && (
                    <div>
                      <div className="label-mono mb-1.5">Controls</div>
                      <div className="text-[12px] text-ink-2 space-y-0.5">
                        {h.protocol.controls.positive && <div><span className="text-phosphor">+</span> {h.protocol.controls.positive}</div>}
                        {h.protocol.controls.negative && <div><span style={{ color: 'rgb(255 92 122)' }}>−</span> {h.protocol.controls.negative}</div>}
                      </div>
                    </div>
                  )}
                  {h.protocol.readouts?.length > 0 && (
                    <div>
                      <div className="label-mono mb-1.5">Readouts</div>
                      <ul className="text-[12px] text-ink-2 space-y-0.5">
                        {h.protocol.readouts.map((r, i) => <li key={i}>· {r.measurement} <span className="text-ink-3">({r.instrument})</span></li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              {(h.protocol.if_positive_then || h.protocol.if_negative_then) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t hairline">
                  {h.protocol.if_positive_then && <div className="text-[12px]"><span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>if positive → </span><span className="text-ink-1">{h.protocol.if_positive_then}</span></div>}
                  {h.protocol.if_negative_then && <div className="text-[12px]"><span className="label-mono" style={{ color: 'rgb(255 92 122)' }}>if negative → </span><span className="text-ink-1">{h.protocol.if_negative_then}</span></div>}
                </div>
              )}
            </Section>
          </div>
        )}

        {/* computational validation */}
        {h.datasets?.datasets?.length > 0 && (
          <div className="mt-3.5">
            <Section icon={Database} title="Computational validation — test it today" color="91 140 255">
              {h.datasets.summary && <p className="text-[13px] text-ink-1 leading-relaxed mb-3">{h.datasets.summary}</p>}
              <div className="space-y-2.5">
                {h.datasets.datasets.map((d, i) => (
                  <div key={i} className="panel p-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="chip" style={{ color: 'rgb(91 140 255)', borderColor: 'rgb(91 140 255 / 0.3)' }}>{d.source}</span>
                      <span className="font-mono text-[12px] text-ink-1">{d.accession}</span>
                      <span className="text-[13px] text-ink-0">{d.title}</span>
                    </div>
                    {d.why_relevant && <p className="text-[12px] text-ink-2 mt-1.5 leading-snug">{d.why_relevant}</p>}
                    {d.analysis && <p className="text-[12px] mt-1 leading-snug" style={{ color: 'rgb(91 140 255)' }}>▸ {d.analysis}</p>}
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
