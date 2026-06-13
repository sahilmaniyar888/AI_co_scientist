import { useEffect, useRef } from 'react'

export default function ThinkStream({ text, agent, active }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [text])

  return (
    <div className="panel panel-raised scan overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b hairline">
        <div className="flex items-center gap-2.5">
          <span className={`relative inline-flex w-2 h-2 rounded-full ${active ? 'live-dot' : ''}`}
            style={{ background: active ? 'rgb(70 229 181)' : 'rgb(124 134 156)' }} />
          <span className="label-mono" style={{ color: 'rgb(70 229 181)' }}>K2-Think · reasoning trace</span>
        </div>
        <span className="font-mono text-ink-2" style={{ fontSize: '0.66rem' }}>
          {agent || 'idle'}
        </span>
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-4 py-3.5 min-h-0">
        {text ? (
          <pre className={`think-stream ${active ? 'think-caret' : ''}`}>{text}</pre>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-ink-3">
            <span className="font-mono text-xs">awaiting cognition…</span>
            {active && <div className="dots"><span /><span /><span /></div>}
          </div>
        )}
      </div>
    </div>
  )
}
