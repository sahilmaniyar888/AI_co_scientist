// Shared visual encodings.

export const ARCHETYPES = {
  CONFIRMATORY: { color: '70 229 181', label: 'Confirmatory' },
  MECHANISTIC: { color: '167 139 250', label: 'Mechanistic' },
  COMBINATORIAL: { color: '91 140 255', label: 'Combinatorial' },
  CONTRARIAN: { color: '255 92 122', label: 'Contrarian' },
  TRANSLATIONAL: { color: '245 181 71', label: 'Translational' },
  GAP_FILLING: { color: '94 234 212', label: 'Gap-Filling' },
  EVOLVED: { color: '125 211 252', label: 'Evolved' },
}

export function archetypeMeta(a) {
  if (!a) return { color: '124 134 156', label: 'Hypothesis' }
  const key = String(a).toUpperCase().replace(/[\s-]+/g, '_')
  return ARCHETYPES[key] || { color: '124 134 156', label: a }
}

// Discovery score -> color band
export function scoreColor(score) {
  if (score == null) return '124 134 156'
  if (score >= 75) return '70 229 181'
  if (score >= 50) return '245 181 71'
  return '255 92 122'
}

export const DIMENSIONS = [
  { key: 'evidence_strength', label: 'Evidence', short: 'EVD' },
  { key: 'novelty', label: 'Novelty', short: 'NOV' },
  { key: 'feasibility', label: 'Feasibility', short: 'FEA' },
  { key: 'impact', label: 'Impact', short: 'IMP' },
  { key: 'reproducibility', label: 'Reproducibility', short: 'REP' },
]

export const AGENT_SEQUENCE = [
  { name: 'Supervisor', glyph: '◆' },
  { name: 'Literature Scout', glyph: '⛏' },
  { name: 'Knowledge Graph', glyph: '⬡' },
  { name: 'Gap Discovery', glyph: '◍' },
  { name: 'Contradiction Engine', glyph: '⚡' },
  { name: 'Hypothesis Generator', glyph: '✦' },
  { name: 'Skeptic', glyph: '⊘' },
  { name: 'Ranking Tournament', glyph: '⚔' },
  { name: 'Evolution', glyph: '⟳' },
  { name: 'Novelty Verifier', glyph: '⌖' },
  { name: 'Trial Auditor', glyph: '⚕' },
  { name: 'Plausibility Auditor', glyph: '⚛' },
  { name: 'Discovery Scoring', glyph: '◎' },
  { name: 'Meta-Review', glyph: '❖' },
]

export function fmtElo(e) {
  return Math.round(e || 1000)
}
