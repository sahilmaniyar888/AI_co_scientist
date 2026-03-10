import { motion } from 'framer-motion'
import {
  BarChart2,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  FileText,
  FlaskConical,
  Lightbulb,
  RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { OrionLogo } from './OrionLogo'

export const PIPELINE = [
  { id: 1, label: 'Literature Analysis', Icon: BookOpen, color: '#818cf8', bg: 'rgba(129,140,248,0.10)' },
  { id: 2, label: 'Hypothesis Generation', Icon: Lightbulb, color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
  { id: 3, label: 'Code Gen & Bench', Icon: Code2, color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
  { id: 4, label: 'Experimental Design', Icon: FlaskConical, color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  { id: 5, label: 'Visualization', Icon: BarChart2, color: '#38bdf8', bg: 'rgba(56,189,248,0.10)' },
  { id: 6, label: 'Feedback & Iteration', Icon: RefreshCw, color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  { id: 7, label: 'Publication Draft', Icon: FileText, color: '#fb923c', bg: 'rgba(251,146,60,0.10)' },
]

export function Sidebar() {
  const { activeStage, completedStages, setActiveStage, query, sessionId, clearSession } = useStore()

  return (
    <aside className="flex h-full w-[230px] shrink-0 flex-col border-r border-border bg-bg-1/50">
      <div className="flex items-start gap-2.5 border-b border-border px-4 py-4">
        <OrionLogo size={26} />
        <div>
          <div className="text-sm font-semibold leading-none tracking-tight text-ink-0">NovaScience</div>
          <div className="mt-1 max-w-[150px] font-mono text-[9px] leading-tight text-indigo-300/70">
            Autonomous AI scientists for frontier discovery
          </div>
        </div>
      </div>

      {sessionId && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">Session</div>
          <p className="max-h-8 overflow-hidden text-xs leading-snug text-ink-1">{query}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
            <span className="font-mono text-[10px] text-emerald-400">active | {sessionId}</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Pipeline</div>

        {PIPELINE.map((step) => {
          const done = completedStages.includes(step.id)
          const active = activeStage === step.id
          const locked = !done && step.id > (completedStages.length > 0 ? Math.max(...completedStages) + 1 : 1)

          return (
            <motion.button
              key={step.id}
              onClick={() => !locked && setActiveStage(step.id)}
              whileHover={!locked ? { x: 2 } : {}}
              whileTap={!locked ? { scale: 0.98 } : {}}
              className={clsx(
                'mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition-all duration-150',
                active ? 'bg-white/5' : 'hover:bg-white/3',
                locked && 'cursor-not-allowed opacity-30'
              )}
              style={{ borderLeft: active ? `2px solid ${step.color}` : '2px solid transparent' }}
            >
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all"
                style={{ background: active || done ? step.bg : 'rgba(255,255,255,0.04)' }}
              >
                {done ? <Check size={11} color={step.color} /> : <step.Icon size={11} color={active ? step.color : '#475569'} />}
              </div>

              <span
                className={clsx(
                  'flex-1 text-xs font-medium leading-snug tracking-tight',
                  active ? 'text-ink-0' : done ? 'text-ink-1' : 'text-ink-2'
                )}
              >
                {step.label}
              </span>

              {active && <ChevronRight size={11} color={step.color} />}
            </motion.button>
          )
        })}
      </div>

      {sessionId && (
        <div className="border-t border-border p-3">
          <button
            onClick={clearSession}
            className="w-full rounded-lg border border-transparent px-3 py-2 text-center text-xs text-ink-3 transition-all duration-150 hover:border-border hover:bg-white/4 hover:text-ink-1"
          >
            + New session
          </button>
        </div>
      )}
    </aside>
  )
}
