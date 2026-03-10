import { AnimatePresence, motion } from 'framer-motion'
import { Landing } from './components/Landing'
import { Sidebar } from './components/Sidebar'
import { ArtifactViewer } from './components/ArtifactViewer'
import { ChatPanel } from './components/ChatPanel'
import { useStore } from './store'

function TopBar() {
  const { sessionId, query, activeStage } = useStore()
  const stageNames = ['', 'Literature', 'Hypothesis', 'Code Gen', 'Experiment', 'Viz', 'Feedback', 'Publication']

  return (
    <div className="h-11 shrink-0 border-b border-border bg-bg-0/80 px-4 backdrop-blur-md">
      <div className="flex h-full items-center justify-between">
        <div className="flex items-center gap-3">
          {['<-', '->'].map((arrow) => (
            <button key={arrow} className="btn-ghost px-2 py-1 text-xs text-ink-3">
              {arrow}
            </button>
          ))}
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5 font-mono text-xs text-ink-2">
            <span className="text-ink-3">session</span>
            <span className="text-ink-3">/</span>
            <span className="text-indigo-400">{sessionId}</span>
            <span className="text-ink-3">/</span>
            <span className="text-ink-1">{stageNames[activeStage]}</span>
          </div>
        </div>

        <div className="hidden max-w-sm truncate px-4 text-center text-xs text-ink-2 md:block">
          {query}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="font-mono text-[10px] text-emerald-400">live</span>
        </div>
      </div>
    </div>
  )
}

function Workspace() {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ArtifactViewer />
        <ChatPanel />
      </div>
    </div>
  )
}

export default function App() {
  const sessionId = useStore((state) => state.sessionId)

  return (
    <div className="h-full w-full overflow-hidden bg-bg-0">
      <AnimatePresence mode="wait">
        {!sessionId ? (
          <motion.div
            key="landing"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Landing />
          </motion.div>
        ) : (
          <motion.div
            key="workspace"
            className="h-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Workspace />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
