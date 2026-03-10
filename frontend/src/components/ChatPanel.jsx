import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, FileText, Play, Send, Upload, X } from 'lucide-react'
import clsx from 'clsx'
import TextareaAutosize from 'react-textarea-autosize'
import toast from 'react-hot-toast'
import { runStage, sendChat, uploadFile } from '../api/client'
import { useStore } from '../store'
import { PIPELINE } from './Sidebar'

function ThinkingTrace({ text, show }) {
  const [open, setOpen] = useState(false)
  if (!show || !text) return null

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-indigo-400/10">
      <button
        onClick={() => setOpen((state) => !state)}
        className="flex w-full items-center gap-2 bg-indigo-400/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-indigo-400/70 transition-colors hover:bg-indigo-400/8"
      >
        <span className="opacity-60">trace</span>
        Reasoning trace
        {open ? <ChevronUp size={9} className="ml-auto" /> : <ChevronDown size={9} className="ml-auto" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="whitespace-pre-wrap bg-black/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-2">
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Message({ message, step, showThinking }) {
  const isUser = message.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={clsx('animate-fade-up', isUser && 'flex justify-end')}>
      {isUser ? (
        <div className="max-w-[85%] rounded-xl rounded-tr-sm border border-border bg-white/5 px-3.5 py-2.5 text-sm leading-relaxed text-ink-1">
          {message.text}
        </div>
      ) : (
        <div className="max-w-[95%]">
          <div className="mb-1.5 flex items-center gap-1.5">
            <div
              className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
              style={{ background: step?.bg, border: `1px solid ${step?.color}30` }}
            >
              {step && <step.Icon size={9} color={step.color} />}
            </div>
            <span className="font-mono text-[10px] text-ink-3">novascience | {step?.label?.toLowerCase()}</span>
          </div>

          <ThinkingTrace text={message.thinking} show={showThinking} />

          <div className="space-y-1.5 text-sm leading-relaxed text-ink-1">
            {(message.text || '').split('\n').map((line, index) => {
              if (line.startsWith('- ')) {
                return (
                  <div key={index} className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-xs text-indigo-400/50">*</span>
                    <span dangerouslySetInnerHTML={{ __html: boldify(line.slice(2)) }} />
                  </div>
                )
              }
              if (line.startsWith('**') && line.endsWith('**')) {
                return (
                  <div key={index} className="font-semibold text-ink-0">
                    {line.slice(2, -2)}
                  </div>
                )
              }
              return line ? (
                <div key={index} dangerouslySetInnerHTML={{ __html: boldify(line) }} />
              ) : (
                <div key={index} className="h-1" />
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function boldify(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-ink-0 font-semibold">$1</strong>')
    .replace(/`(.*?)`/g, '<code class="rounded bg-white/6 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">$1</code>')
}

function ThinkingIndicator({ step }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: step?.bg }}>
        {step && <step.Icon size={9} color={step.color} />}
      </div>
      <div className="flex gap-1">
        <div className="thinking-dot" style={{ background: step?.color || '#818cf8' }} />
        <div className="thinking-dot" style={{ background: step?.color || '#818cf8' }} />
        <div className="thinking-dot" style={{ background: step?.color || '#818cf8' }} />
      </div>
    </div>
  )
}

export function ChatPanel() {
  const {
    sessionId,
    activeStage,
    messages,
    addMessage,
    isRunning,
    setRunning,
    setArtifact,
    markStageComplete,
    showThinking,
    toggleThinking,
    thinking,
    setThinking,
  } = useStore()

  const [input, setInput] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const bottomRef = useRef(null)
  const fileRef = useRef(null)
  const abortRef = useRef(null)

  const step = PIPELINE.find((item) => item.id === activeStage)
  const stageMessages = messages[activeStage] || []
  const isThinking = thinking[activeStage] || false

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [stageMessages, isThinking])

  const handleRun = () => {
    if (!sessionId || isRunning) return

    setRunning(true)
    setThinking(activeStage, true)
    abortRef.current?.abort()
    abortRef.current = runStage(sessionId, activeStage, (event) => {
      const { type, data } = event

      if (type === 'thinking') {
        addMessage(activeStage, { role: 'agent', thinking: data.text, text: '' })
      } else if (type === 'result') {
        setArtifact(activeStage, data)
        setThinking(activeStage, false)
        addMessage(activeStage, {
          role: 'agent',
          text: resultSummary(activeStage, data),
        })
      } else if (type === 'status') {
        addMessage(activeStage, { role: 'agent', thinking: '', text: data.message })
      } else if (type === 'error') {
        toast.error(data.message || 'Stage failed')
        setThinking(activeStage, false)
        setRunning(false)
      } else if (type === 'done') {
        markStageComplete(activeStage)
        setThinking(activeStage, false)
        setRunning(false)
      }
    })
  }

  const handleSend = async () => {
    if (!input.trim() && !pendingFile) return
    if (!sessionId) return

    if (pendingFile) {
      try {
        await uploadFile(sessionId, pendingFile)
        addMessage(activeStage, { role: 'user', text: `Uploaded: ${pendingFile.name}` })
        setPendingFile(null)
      } catch {
        toast.error('Upload failed')
      }
    }

    if (!input.trim()) return

    addMessage(activeStage, { role: 'user', text: input })
    const message = input
    setInput('')
    setThinking(activeStage, true)

    sendChat(sessionId, message, activeStage, (event) => {
      if (event.type === 'message') {
        addMessage(activeStage, { role: 'agent', text: event.data.text })
        setThinking(activeStage, false)
      } else if (event.type === 'done') {
        setThinking(activeStage, false)
      } else if (event.type === 'error') {
        toast.error(event.data.message)
        setThinking(activeStage, false)
      }
    })
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const handleFile = (event) => {
    const file = event.target.files?.[0]
    if (file) setPendingFile(file)
  }

  return (
    <div className="flex h-full w-[360px] shrink-0 flex-col overflow-hidden bg-bg-1/30">
      <div className="shrink-0 border-b border-border bg-bg-1/50 px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          {step && (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: step.bg }}>
              <step.Icon size={11} color={step.color} />
            </div>
          )}
          <span className="flex-1 text-sm font-medium tracking-tight text-ink-0">{step?.label}</span>

          <button
            onClick={handleRun}
            disabled={isRunning || !sessionId}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              isRunning || !sessionId
                ? 'cursor-not-allowed bg-white/5 text-ink-3'
                : 'bg-indigo-500/90 text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500'
            )}
          >
            <Play size={11} />
            {isRunning ? 'Running...' : 'Run Stage'}
          </button>
        </div>

        <div className="space-y-2 text-xs text-ink-2">
          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Research Workflow</div>
            {[
              'Grounded literature synthesis from uploaded papers',
              'Strong Inference hypothesis generation',
              'Runnable Python validation and figure generation',
              'Publication-ready manuscript export',
            ].map((text) => (
              <div key={text} className="mb-0.5 flex gap-1.5">
                <span className="mt-0.5 text-indigo-400/40">*</span>
                <span className="text-ink-2">{text}</span>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-ink-3">Infrastructure</div>
            {['FastAPI + SSE streaming workspace', 'K2 reasoning engine + local scientific tooling'].map((text) => (
              <div key={text} className="mb-0.5 flex gap-1.5">
                <span className="mt-0.5 text-indigo-400/40">*</span>
                <span className="text-ink-2">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={toggleThinking} className="mt-2.5 font-mono text-[10px] text-ink-3 transition-colors hover:text-ink-1">
          {showThinking ? 'Hide' : 'Show'} reasoning traces
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 px-4 py-4">
        {stageMessages.length === 0 && !isThinking && (
          <div className="py-8 text-center">
            <p className="text-xs leading-relaxed text-ink-3">
              Click <strong className="text-ink-2">Run Stage</strong> to execute this pipeline phase,
              or type a message to instruct NovaScience.
            </p>
          </div>
        )}

        {stageMessages.map((message, index) => (
          <Message key={index} message={message} step={step} showThinking={showThinking} />
        ))}

        {isThinking && <ThinkingIndicator step={step} />}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-border px-3 pb-3 pt-2">
        <AnimatePresence>
          {pendingFile && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mb-2"
            >
              <div className="glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-ink-1">
                <FileText size={11} className="shrink-0 text-emerald-400" />
                <span className="flex-1 truncate">{pendingFile.name}</span>
                <button onClick={() => setPendingFile(null)} className="text-ink-3 hover:text-ink-1">
                  <X size={11} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="glass flex items-end gap-2 rounded-xl px-3 py-2.5 transition-colors focus-within:border-indigo-400/20">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.csv,.txt,.md"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            title="Attach paper or data file"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-all hover:bg-indigo-400/10 hover:text-indigo-400"
          >
            <Upload size={13} />
          </button>

          <TextareaAutosize
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message NovaScience..."
            maxRows={6}
            minRows={1}
            className="input-base flex-1 py-0.5 leading-relaxed"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() && !pendingFile}
            className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all',
              input.trim() || pendingFile ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'text-ink-3 hover:bg-white/5'
            )}
          >
            <Send size={12} />
          </button>
        </div>
        <div className="mt-1.5 text-center">
          <span className="font-mono text-[10px] text-ink-3">Enter sends | Shift+Enter newline | attach files</span>
        </div>
      </div>
    </div>
  )
}

function resultSummary(stage, data) {
  switch (stage) {
    case 1:
      return `Synthesized **${data.papers?.length || 0} sources** and prepared the literature brief.`
    case 2:
      return `Generated **${data.hypotheses?.length || 0} competing hypotheses** using Strong Inference.`
    case 3:
      return 'Python experiment code generated. Benchmark context stored for downstream stages.'
    case 4:
      return `Validated **${data.metrics?.validated || 0} hypotheses**. Review the experimental findings.`
    case 5:
      return `Generated **${data.figure_urls?.length || 0} figures** for the publication workflow.`
    case 6:
      return 'Feedback analysis complete. Refined hypotheses are ready for the next iteration.'
    case 7:
      return 'Manuscript compilation finished. Check the PDF artifact for download.'
    default:
      return 'Stage complete.'
  }
}
