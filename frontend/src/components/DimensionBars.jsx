import { DIMENSIONS } from '../lib/ui'

export default function DimensionBars({ dimensions, compact }) {
  if (!dimensions) return null
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {DIMENSIONS.map((d) => {
        const v = Number(dimensions[d.key] ?? 0)
        return (
          <div key={d.key} className="flex items-center gap-2">
            <span className="label-mono w-9 shrink-0" style={{ fontSize: '0.58rem' }}>{d.short}</span>
            <div className="h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgb(140 160 200 / 0.1)' }}>
              <div className="h-full rounded-full"
                style={{
                  width: `${v}%`,
                  background: 'linear-gradient(90deg, rgb(91 140 255), rgb(70 229 181))',
                  transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                }} />
            </div>
            <span className="font-mono text-ink-2 w-6 text-right" style={{ fontSize: '0.62rem' }}>{Math.round(v)}</span>
          </div>
        )
      })}
    </div>
  )
}
