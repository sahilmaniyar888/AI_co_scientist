import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  PieChart, Pie, Cell, BarChart, Bar, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { DIMENSIONS, archetypeMeta, scoreColor } from '../lib/ui'

const GRID = 'rgb(140 160 200 / 0.14)'
const AXIS = 'rgb(124 134 156)'
const PHOS = 'rgb(70 229 181)'

function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="panel px-3 py-2 text-[11px]" style={{ background: 'rgb(11 15 24 / 0.96)' }}>
      {label != null && <div className="label-mono mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 font-mono" style={{ color: p.color || 'rgb(183 192 210)' }}>
          {p.name}: {typeof p.value === 'number' ? Math.round(p.value) : p.value}{unit}
        </div>
      ))}
    </div>
  )
}

/* ---- 5-dimension radar ---- */
export function DimensionRadar({ scores, height = 220 }) {
  if (!scores) return null
  const data = DIMENSIONS.map((d) => ({ dim: d.label, value: Number(scores[d.key] ?? 0) }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <defs>
          <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(91 140 255)" stopOpacity={0.5} />
            <stop offset="100%" stopColor={PHOS} stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey="dim" tick={{ fill: AXIS, fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke={PHOS} strokeWidth={1.5} fill="url(#radarFill)" />
        <Tooltip content={<ChartTip />} />
      </RadarChart>
    </ResponsiveContainer>
  )
}

/* ---- Elo trajectory (reconstructed from ordered debates) ---- */
function expected(a, b) { return 1 / (1 + 10 ** ((b - a) / 400)) }
function clamp(x) { return Math.max(600, Math.min(1400, x)) }

export function eloTimeline(debates, hypId) {
  // Replay every debate in order, reproducing stored Elo, and snapshot the focal hyp.
  const elo = {}
  const pts = [{ n: 0, elo: 1000 }]
  const ordered = [...debates].sort((a, b) => (a.round - b.round) || ((a.created_at || 0) - (b.created_at || 0)))
  let step = 0
  for (const d of ordered) {
    const a = d.hyp_a_id, b = d.hyp_b_id
    if (elo[a] == null) elo[a] = 1000
    if (elo[b] == null) elo[b] = 1000
    const w = d.winner_id, l = w === a ? b : a
    const ew = expected(elo[w], elo[l])
    elo[w] = clamp(elo[w] + 32 * (1 - ew))
    elo[l] = clamp(elo[l] - 32 * (1 - ew))
    if (a === hypId || b === hypId) {
      step += 1
      pts.push({ n: step, elo: Math.round(elo[hypId]), result: w === hypId ? 'won' : 'lost' })
    }
  }
  return pts
}

export function EloLine({ data, height = 160 }) {
  if (!data || data.length < 2) return <div className="text-ink-3 font-mono text-xs">no tournament history</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="n" tick={{ fill: AXIS, fontSize: 10 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis domain={['dataMin - 30', 'dataMax + 30']} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
        <ReferenceLine y={1000} stroke={GRID} strokeDasharray="3 3" />
        <Tooltip content={<ChartTip />} />
        <Line type="monotone" dataKey="elo" stroke={PHOS} strokeWidth={2}
          dot={{ r: 3, fill: PHOS }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ---- Archetype distribution donut ---- */
export function ArchetypeDonut({ hypotheses, height = 200 }) {
  const counts = {}
  hypotheses.forEach((h) => {
    if (h.status === 'eliminated') return
    const k = archetypeMeta(h.archetype).label
    counts[k] = (counts[k] || 0) + 1
  })
  const data = Object.entries(counts).map(([name, value]) => {
    const h = hypotheses.find((x) => archetypeMeta(x.archetype).label === name)
    return { name, value, color: `rgb(${archetypeMeta(h?.archetype).color})` }
  })
  if (!data.length) return null
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%"
          paddingAngle={3} stroke="rgb(11 15 24)" strokeWidth={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip content={<ChartTip />} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ---- Discovery score leaderboard (horizontal bars) ---- */
export function ScoreLeaderboard({ rows, height = 220 }) {
  const data = rows
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => ({ name: r.title.length > 32 ? r.title.slice(0, 32) + '…' : r.title, score: r.score }))
  if (!data.length) return <div className="text-ink-3 font-mono text-xs">no scored hypotheses yet</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 2, right: 16, bottom: 2, left: 6 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fill: AXIS, fontSize: 9.5 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(140 160 200 / 0.05)' }} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={13}>
          {data.map((d, i) => <Cell key={i} fill={`rgb(${scoreColor(d.score)})`} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ---- Gap opportunity scatter ---- */
const GAP_TYPE_COLOR = {
  missing_intersection: 'rgb(91 140 255)', weak_connection: 'rgb(124 134 156)',
  contradiction: 'rgb(255 92 122)', missing_mechanism: 'rgb(167 139 250)',
  translation: 'rgb(245 181 71)',
}

export function GapScatter({ gaps, height = 220 }) {
  const data = gaps.map((g, i) => ({
    x: i + 1,
    y: Math.round((g.opportunity_score || 0.5) * 100),
    title: g.title, type: g.type || 'gap',
    color: GAP_TYPE_COLOR[g.type] || 'rgb(70 229 181)',
  }))
  if (!data.length) return <div className="text-ink-3 font-mono text-xs">no gaps</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 16, bottom: 4, left: -18 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" dataKey="x" tick={false} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis type="number" dataKey="y" domain={[0, 100]} tick={{ fill: AXIS, fontSize: 10 }}
          axisLine={false} tickLine={false} label={{ value: 'opportunity', angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 9, dy: 30 }} />
        <ZAxis range={[80, 80]} />
        <Tooltip content={({ active, payload }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload
          return <div className="panel px-3 py-2 max-w-[220px]" style={{ background: 'rgb(11 15 24 / 0.96)' }}>
            <div className="label-mono mb-1" style={{ color: d.color }}>{d.type.replace(/_/g, ' ')}</div>
            <div className="text-[12px] text-ink-1 leading-snug">{d.title}</div>
          </div>
        }} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}
