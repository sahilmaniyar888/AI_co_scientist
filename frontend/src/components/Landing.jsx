import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, FileText, Microscope, Upload, X, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { startSession, uploadFile } from '../api/client'
import { useStore } from '../store'
import { OrionLogo } from './OrionLogo'

const EXAMPLES = [
  'Improve CRISPR-Cas9 off-target prediction using chromatin accessibility features',
  "Identify biomarkers for early Alzheimer's detection via proteomics",
  'Design protein sequences with enhanced thermostability using ESM-2',
  'Characterize long-read sequencing errors in nanopore data with ML approaches',
]

const FEATURES = [
  { icon: Microscope, label: 'Literature synthesis', desc: 'Grounded by uploaded papers and notes' },
  { icon: Zap, label: 'Autonomous code gen', desc: 'Runnable Python experiments and validation' },
  { icon: FileText, label: 'Publication draft', desc: 'Figures plus manuscript-ready export' },
]

export function Landing() {
  const [query, setQuery] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef(null)
  const setSession = useStore((state) => state.setSession)
  const setUploadedFile = useStore((state) => state.setUploadedFile)

  const handleStart = async () => {
    if (!query.trim()) {
      toast.error('Enter a research question first.')
      return
    }

    setLoading(true)
    try {
      const { session_id } = await startSession(query.trim())
      if (file) {
        await uploadFile(session_id, file)
        setUploadedFile({ name: file.name, size: file.size })
      }
      setSession(session_id, query.trim())
    } catch (error) {
      toast.error('Could not connect to NovaScience API. Is the backend running?')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleFile = (event) => {
    const selectedFile = event.target.files?.[0]
    if (selectedFile) setFile(selectedFile)
  }

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-bg-0 px-6">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.10) 0%, transparent 70%)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-2xl"
      >
        <div className="mb-10 flex flex-col items-center">
          <div className="mb-3 flex items-center gap-3">
            <OrionLogo size={36} />
            <span className="font-display text-4xl italic tracking-tight text-ink-0">NovaScience</span>
          </div>
          <p className="text-center text-sm tracking-[0.28em] text-ink-2 uppercase">
            Autonomous AI scientists for frontier discovery
          </p>
        </div>

        <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="tag border-border text-ink-2">
              <Icon size={11} className="text-indigo-400" />
              {label}
            </div>
          ))}
        </div>

        <div className="glass mb-4 rounded-2xl p-1">
          <textarea
            className="input-base min-h-[100px] w-full rounded-xl p-4 leading-relaxed"
            placeholder={
              'Describe your research question or frontier hypothesis...\n\n' +
              'e.g. Improve CRISPR-Cas9 off-target prediction using chromatin accessibility features'
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.metaKey) handleStart()
            }}
          />

          <div className="flex items-center gap-3 px-3 pb-2 pt-1">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.csv,.md"
              onChange={handleFile}
              className="hidden"
            />
            {file ? (
              <div className="tag border-border text-ink-1">
                <FileText size={11} className="text-emerald-400" />
                <span className="max-w-[180px] truncate text-xs">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-0.5 text-ink-3 hover:text-ink-1">
                  <X size={11} />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="btn-ghost px-2.5 py-1 text-xs">
                <Upload size={12} />
                Attach paper
              </button>
            )}

            <div className="flex-1" />
            <span className="font-mono text-xs text-ink-3">Cmd+Enter to run</span>
            <button
              onClick={handleStart}
              disabled={loading || !query.trim()}
              className="btn-primary px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="thinking-dot bg-white" />
                  <span className="thinking-dot bg-white" />
                  <span className="thinking-dot bg-white" />
                </span>
              ) : (
                <>
                  Start Research <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-3 text-center font-mono text-xs text-ink-3">or try an example</p>
          <div className="flex flex-col gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => setQuery(example)}
                className="rounded-lg border border-transparent px-4 py-2 text-left text-sm leading-snug text-ink-2 transition-all duration-150 hover:border-border hover:bg-white/4 hover:text-ink-0"
              >
                <ArrowRight size={11} className="mr-2 inline text-indigo-400/60" />
                {example}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
