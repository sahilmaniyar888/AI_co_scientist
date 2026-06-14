import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Telescope, Radio, ShieldAlert, Swords, Gauge, Map, X, ArrowRight, ArrowLeft,
} from 'lucide-react'

const STEPS = [
  {
    icon: Telescope, color: '70 229 181',
    title: 'An autonomous co-scientist',
    body: 'Give the engine a research goal. It reads the literature, finds what’s unstudied, and returns a ranked, evidence-backed list of the hypotheses worth pursuing next — not a paper draft.',
  },
  {
    icon: Radio, color: '91 140 255',
    title: 'Watch K2 think, live',
    body: 'More than a dozen specialized agents run a cyclical pipeline. Their reasoning streams to you in real time — the green readout is K2-Think working through the problem, not a progress bar.',
  },
  {
    icon: ShieldAlert, color: '255 92 122',
    title: 'Generate, then break',
    body: 'Hypotheses are generated across six archetypes (mechanistic, contrarian, combinatorial…). A Skeptic agent then tries to break each one — genuinely flawed ideas are eliminated, and you see why.',
  },
  {
    icon: Swords, color: '245 181 71',
    title: 'A tournament of ideas',
    body: 'Survivors compete head-to-head in an Elo tournament — K2 judges which has greater discovery potential. Between rounds, an Evolution agent breeds stronger hybrids from the leaders.',
  },
  {
    icon: Gauge, color: '167 139 250',
    title: 'Three grounded reality checks',
    body: 'Before scoring, every top hypothesis faces due diligence against live sources: is it novel (vs. the published literature), has it already been tried and failed (ClinicalTrials.gov), and is the mechanism even coherent? Recombinations and implausible ideas are penalized — then scored on five weighted dimensions.',
  },
  {
    icon: Map, color: '70 229 181',
    title: 'A research roadmap',
    body: 'Everything is synthesized into a roadmap: the top discovery, a ranked portfolio, key contradictions, valuable gaps, and a recommended experiment sequence. Click Competition Mode to see it end-to-end.',
  },
]

export default function Tour({ open, onClose }) {
  const [i, setI] = useState(0)
  if (!open) return null
  const step = STEPS[i]
  const Icon = step.icon
  const last = i === STEPS.length - 1
  const done = () => { localStorage.setItem('de_tour_seen', '1'); onClose() }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 grid place-items-center p-6"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: 'rgb(4 6 11 / 0.72)', backdropFilter: 'blur(6px)' }}
        onClick={done}>
        <motion.div onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="panel panel-raised w-full max-w-lg p-7 relative">
          <button onClick={done} className="absolute top-4 right-4 text-ink-3 hover:text-ink-0 transition"><X size={18} /></button>

          <div className="grid place-items-center w-12 h-12 rounded-xl mb-5"
            style={{ background: `rgb(${step.color} / 0.12)`, border: `1px solid rgb(${step.color} / 0.3)`,
                     boxShadow: `0 0 24px rgb(${step.color} / 0.22)` }}>
            <Icon size={22} color={`rgb(${step.color})`} />
          </div>

          <div className="label-mono mb-2">Step {i + 1} of {STEPS.length}</div>
          <h2 className="font-display text-2xl text-ink-0 leading-snug">{step.title}</h2>
          <p className="text-[14px] text-ink-1 mt-3 leading-relaxed">{step.body}</p>

          <div className="flex items-center justify-between mt-7">
            <div className="flex gap-1.5">
              {STEPS.map((_, j) => (
                <button key={j} onClick={() => setI(j)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: j === i ? 22 : 7, background: j === i ? `rgb(${step.color})` : 'rgb(140 160 200 / 0.25)' }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {i > 0 && (
                <button onClick={() => setI(i - 1)} className="btn btn-ghost px-3 py-1.5 text-xs"><ArrowLeft size={13} /> Back</button>
              )}
              {last ? (
                <button onClick={done} className="btn btn-primary px-4 py-1.5 text-sm">Got it</button>
              ) : (
                <button onClick={() => setI(i + 1)} className="btn btn-primary px-4 py-1.5 text-sm">Next <ArrowRight size={14} /></button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export function shouldAutoOpenTour() {
  try {
    if (location.hash.includes('notour')) return false
    return !localStorage.getItem('de_tour_seen')
  } catch { return false }
}
