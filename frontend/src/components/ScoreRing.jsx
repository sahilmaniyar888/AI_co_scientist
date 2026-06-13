import { useEffect, useState } from 'react'
import { scoreColor } from '../lib/ui'

export default function ScoreRing({ value, size = 64, stroke = 5, label }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setV(value ?? 0), 60)
    return () => clearTimeout(t)
  }, [value])

  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, v)) / 100
  const col = scoreColor(value)

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(140,160,200,0.12)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`rgb(${col})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)',
                   filter: `drop-shadow(0 0 6px rgb(${col} / 0.55))` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-semibold" style={{ color: `rgb(${col})`, fontSize: size * 0.26 }}>
          {value == null ? '—' : Math.round(value)}
        </span>
        {label && <span className="label-mono" style={{ fontSize: size * 0.1 }}>{label}</span>}
      </div>
    </div>
  )
}
