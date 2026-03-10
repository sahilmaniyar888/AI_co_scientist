import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Download } from 'lucide-react'
import clsx from 'clsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import toast from 'react-hot-toast'
import { useStore } from '../store'
import { PIPELINE } from './Sidebar'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Clipboard access failed.')
    }
  }

  return (
    <button onClick={handleCopy} className="btn-ghost px-2 py-1 text-xs">
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function SynthesisArtifact({ data }) {
  const papers = data.papers || []
  return (
    <div className="space-y-5 p-6">
      {papers.length > 0 && (
        <div>
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">
            Papers Retrieved ({papers.length})
          </h3>
          <div className="space-y-2">
            {papers.map((paper, index) => (
              <div key={`${paper.title || 'paper'}-${index}`} className="glass rounded-lg p-3">
                <div className="mb-0.5 text-sm font-medium text-ink-0">{paper.title || `Paper ${index + 1}`}</div>
                <div className="flex items-center gap-3 text-xs text-ink-2">
                  <span>{paper.authors || 'Unknown'}</span>
                  {paper.year && <span>| {paper.year}</span>}
                  {paper.preview && <span className="truncate">{paper.preview}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">Synthesis</h3>
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-1">{data.content}</div>
      </div>
    </div>
  )
}

function JsonArtifact({ data }) {
  const raw = typeof data.content === 'string' ? data.content : JSON.stringify(data.content, null, 2)
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="tag border-amber-400/20 text-[10px] text-amber-400">JSON</span>
        <CopyButton text={raw} />
      </div>
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          language="json"
          style={vscDarkPlus}
          customStyle={{
            background: 'transparent',
            margin: 0,
            padding: '20px 24px',
            fontSize: '12px',
            lineHeight: '1.8',
          }}
          codeTagProps={{ style: { fontFamily: 'JetBrains Mono, monospace' } }}
        >
          {raw}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

function CodeArtifact({ data }) {
  const code = data.content || ''
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="tag border-emerald-400/20 text-[10px] text-emerald-400">Python</span>
          {data.filename && <span className="font-mono text-xs text-ink-2">{data.filename}</span>}
        </div>
        <div className="flex items-center gap-1">
          <CopyButton text={code} />
          {data.filename && (
            <a
              href={`data:text/plain,${encodeURIComponent(code)}`}
              download={data.filename}
              className="btn-ghost px-2 py-1 text-xs"
            >
              <Download size={12} /> Save
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          language="python"
          style={vscDarkPlus}
          showLineNumbers
          lineNumberStyle={{ color: '#1e293b', minWidth: '2.5em', fontSize: '11px' }}
          customStyle={{
            background: 'transparent',
            margin: 0,
            padding: '20px 24px',
            fontSize: '12px',
            lineHeight: '1.85',
          }}
          codeTagProps={{ style: { fontFamily: 'JetBrains Mono, monospace' } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

function ValidationArtifact({ data }) {
  const metrics = data.metrics || {}
  const success = data.success
  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <div className={clsx('h-2.5 w-2.5 rounded-full', success ? 'bg-emerald-400' : 'bg-red-400')} />
        <span className="text-sm font-medium text-ink-0">Validation {success ? 'Passed' : 'Needs Review'}</span>
      </div>

      {Object.keys(metrics).length > 0 && (
        <div>
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">Metrics</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(metrics).map(([key, value]) => (
              <div key={key} className="glass rounded-lg p-3">
                <div className="font-mono text-[10px] uppercase text-ink-3">{key}</div>
                <div className="mt-0.5 text-lg font-semibold text-ink-0">
                  {typeof value === 'number' ? value.toFixed(3) : value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.content && (
        <div>
          <h3 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-ink-3">Output</h3>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-1">{data.content}</pre>
        </div>
      )}
    </div>
  )
}

function FiguresArtifact({ data }) {
  const urls = data.figure_urls || []
  if (urls.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-3">
        No figures generated yet.
      </div>
    )
  }

  return (
    <div className="grid gap-4 p-6">
      {urls.map((url, index) => (
        <div key={`${url}-${index}`} className="glass overflow-hidden rounded-xl">
          <img src={url} alt={`Figure ${index + 1}`} className="w-full object-contain" />
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <span className="font-mono text-xs text-ink-2">Figure {index + 1}</span>
            <a href={url} download className="btn-ghost px-2 py-1 text-xs">
              <Download size={11} /> Download
            </a>
          </div>
        </div>
      ))}
    </div>
  )
}

function PdfArtifact({ data }) {
  const pdfUrl = data.pdf_url
  if (!pdfUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-2">
        <span className="text-sm">PDF compilation in progress...</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <span className="tag border-orange-400/20 text-[10px] text-orange-400">PDF | Manuscript</span>
        <a href={pdfUrl} download className="btn-ghost px-2 py-1 text-xs">
          <Download size={12} /> Download PDF
        </a>
      </div>
      <iframe src={pdfUrl} className="flex-1 w-full border-none" title="NovaScience manuscript" />
    </div>
  )
}

function FeedbackArtifact({ data }) {
  let feedback = {}
  try {
    feedback = data.content ? JSON.parse(data.content) : {}
  } catch {
    feedback = { raw_response: data.content }
  }

  return (
    <div className="space-y-5 p-6">
      {['successes', 'limitations', 'insights'].map((key) =>
        feedback[key] ? (
          <div key={key}>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">{key}</h3>
            <ul className="space-y-1">
              {feedback[key].map((item, index) => (
                <li key={`${key}-${index}`} className="flex gap-2 text-sm leading-snug text-ink-1">
                  <span
                    className={clsx(
                      'mt-1 shrink-0 text-[10px]',
                      key === 'successes' ? 'text-emerald-400' : key === 'limitations' ? 'text-amber-400' : 'text-indigo-400'
                    )}
                  >
                    {key === 'successes' ? 'OK' : key === 'limitations' ? '!' : '>'}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}

      {feedback.refined_hypotheses && (
        <div>
          <h3 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ink-3">Refined Hypotheses</h3>
          {feedback.refined_hypotheses.map((refinement, index) => (
            <div key={`refinement-${index}`} className="glass mb-2 rounded-lg p-4">
              <div className="mb-1 text-xs font-mono text-indigo-400">{refinement.original_hypothesis_id}</div>
              <div className="mb-2 text-sm text-ink-0">{refinement.refinement}</div>
              <div className="text-xs text-ink-2">{refinement.rationale}</div>
            </div>
          ))}
        </div>
      )}

      {feedback.raw_response && <pre className="whitespace-pre-wrap text-xs text-ink-1">{feedback.raw_response}</pre>}
    </div>
  )
}

function EmptyArtifact({ stage }) {
  const step = PIPELINE.find((item) => item.id === stage)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      {step && (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: step.bg }}>
          <step.Icon size={22} color={step.color} />
        </div>
      )}
      <div>
        <div className="mb-1 text-sm font-medium text-ink-0">{step?.label}</div>
        <div className="text-xs leading-relaxed text-ink-3">
          Run this stage to generate the artifact output.
          <br />
          Click <strong className="text-ink-2">Run Stage</strong> in the chat panel.
        </div>
      </div>
    </div>
  )
}

export function ArtifactViewer() {
  const { activeStage, artifacts } = useStore()
  const step = PIPELINE.find((item) => item.id === activeStage)
  const data = artifacts[activeStage]

  const renderContent = () => {
    if (!data) return <EmptyArtifact stage={activeStage} />
    switch (data.artifact_type) {
      case 'synthesis':
        return <SynthesisArtifact data={data} />
      case 'json':
        return <JsonArtifact data={data} />
      case 'code':
        return <CodeArtifact data={data} />
      case 'validation':
        return <ValidationArtifact data={data} />
      case 'figures':
        return <FiguresArtifact data={data} />
      case 'pdf':
        return <PdfArtifact data={data} />
      case 'feedback':
        return <FeedbackArtifact data={data} />
      default:
        return <EmptyArtifact stage={activeStage} />
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-r border-border bg-bg-0/60">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-1/30 px-4 py-3">
        <div className="flex items-center gap-2">
          {step && (
            <>
              <div className="flex h-5 w-5 items-center justify-center rounded" style={{ background: step.bg }}>
                <step.Icon size={11} color={step.color} />
              </div>
              <span className="text-xs font-medium text-ink-1">{step.label}</span>
              <span className="text-xs text-ink-3">|</span>
            </>
          )}
          <span className="font-mono text-xs text-ink-2">{data ? 'artifact ready' : 'awaiting run'}</span>
        </div>

        {data && (data.artifact_type === 'code' || data.artifact_type === 'json') && (
          <CopyButton text={data.content || ''} />
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeStage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex-1 overflow-auto"
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
