import { archetypeMeta } from '../lib/ui'

export function ArchetypeBadge({ archetype, small }) {
  const m = archetypeMeta(archetype)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide"
      style={{
        color: `rgb(${m.color})`,
        background: `rgb(${m.color} / 0.1)`,
        border: `1px solid rgb(${m.color} / 0.28)`,
        fontSize: small ? '0.6rem' : '0.66rem',
        padding: small ? '0.16rem 0.5rem' : '0.24rem 0.62rem',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: 9, background: `rgb(${m.color})` }} />
      {m.label}
    </span>
  )
}

export function GenBadge({ type, parents }) {
  if (type !== 'evolved') {
    return <span className="label-mono">Original</span>
  }
  return (
    <span className="chip" style={{ color: 'rgb(125 211 252)', borderColor: 'rgb(125 211 252 / 0.3)', background: 'rgb(125 211 252 / 0.08)' }}>
      ⟳ Evolved{parents?.length ? ` · ${parents.length} parent${parents.length > 1 ? 's' : ''}` : ''}
    </span>
  )
}

export function EloPill({ elo }) {
  return (
    <span className="font-mono text-phosphor" style={{ textShadow: '0 0 12px rgb(70 229 181 / 0.35)' }}>
      {Math.round(elo || 1000)}
    </span>
  )
}
