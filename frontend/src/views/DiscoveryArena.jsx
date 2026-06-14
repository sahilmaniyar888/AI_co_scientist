import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { getHypotheses, getDebates } from '../lib/api'

// ---- verdict → color encodings (match the rest of the app) ----
const NOVELTY_C = { novel: '70 229 181', incremental: '125 211 252', recombination: '245 181 71', known: '255 92 122' }
const REALITY_C = { untested: '70 229 181', in_progress: '125 211 252', failed_before: '255 92 122', mixed: '245 181 71', established: '245 181 71' }
const PLAUS_C = { coherent: '70 229 181', uncertain: '245 181 71', incoherent: '255 92 122' }

function statusColor(h) {
  if (h.status === 'eliminated') return '255 92 122'
  if (h.generation_type === 'evolved') return '125 211 252'
  return '70 229 181'
}

// Build the renderable model for one hypothesis node.
function toNode(h) {
  const disc = h.scores?.discovery_score
  const base = disc != null ? disc : (h.elo_score ? (h.elo_score - 960) / 4 : 40)
  const elim = h.status === 'eliminated'
  return {
    id: h.id,
    title: h.title || '',
    _elim: elim,
    _evolved: h.generation_type === 'evolved',
    _color: statusColor(h),
    _r: Math.max(12, Math.min(40, (elim ? 11 : 16) + base * 0.34)),
    _disc: disc,
    _parents: h.parent_ids || [],
    _rings: [
      h.novelty?.verdict && NOVELTY_C[h.novelty.verdict],
      h.prior_failure?.verdict && REALITY_C[h.prior_failure.verdict],
      h.plausibility?.verdict && PLAUS_C[h.plausibility.verdict],
    ].filter(Boolean),
  }
}

function Arena({ nodes, links, debateLinks, onSelect }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!nodes.length) return
    const el = ref.current
    const w = el.clientWidth, h = el.clientHeight
    const svg = d3.select(el).select('svg')
    svg.selectAll('*').remove()
    svg.attr('viewBox', [0, 0, w, h])

    // ---- ambient arena backdrop: concentric range rings + crosshair ----
    const bg = svg.append('g').attr('opacity', 0.5)
    const cx = w / 2, cy = h / 2
    ;[0.18, 0.34, 0.5, 0.66].forEach((f) => {
      bg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', Math.min(w, h) * f)
        .attr('fill', 'none').attr('stroke', 'rgb(140 160 200 / 0.06)').attr('stroke-width', 1)
        .attr('stroke-dasharray', '2 6')
    })

    const g = svg.append('g')
    svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', (e) => g.attr('transform', e.transform)))

    const ids = new Set(nodes.map((n) => n.id))
    const ev = links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }))
    const deb = debateLinks.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }))

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(ev).id((d) => d.id).distance(70).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-520))
      .force('center', d3.forceCenter(cx, cy))
      .force('collide', d3.forceCollide((d) => d._r + 30))
      // eliminated drift outward, survivors pull to centre
      .force('radial', d3.forceRadial((d) => d._elim ? Math.min(w, h) * 0.34 : Math.min(w, h) * 0.15, cx, cy)
        .strength((d) => d._elim ? 0.5 : 0.06))

    // ---- debate threads (faint, behind everything) ----
    const dlink = g.append('g').selectAll('path').data(deb).join('path')
      .attr('fill', 'none')
      .attr('stroke', 'rgb(245 181 71 / 0.14)')
      .attr('stroke-width', 1)

    // ---- evolution lineage (glowing energy flow parent → child) ----
    const elink = g.append('g').selectAll('line').data(ev).join('line')
      .attr('stroke', 'rgb(125 211 252 / 0.7)')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '2 4')
      .attr('stroke-linecap', 'round')
      .attr('class', 'lineage-flow')
      .style('filter', 'drop-shadow(0 0 5px rgb(125 211 252 / 0.7))')

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
      .on('click', (e, d) => onSelect(d))
      .on('mouseenter', (e, d) => {
        node.style('opacity', (o) => o.id === d.id ? 1 : 0.22)
        elink.style('opacity', (o) => (o.source.id === d.id || o.target.id === d.id) ? 1 : 0.08)
        dlink.style('opacity', (o) => (o.source.id === d.id || o.target.id === d.id) ? 1 : 0.05)
      })
      .on('mouseleave', () => { node.style('opacity', 1); elink.style('opacity', 1); dlink.style('opacity', 1) })

    node.attr('opacity', (d) => d._elim ? 0.55 : 1)

    // breathing outer glow
    node.append('circle')
      .attr('r', (d) => d._r + 6)
      .attr('fill', (d) => `rgb(${d._color} / 0.10)`)
      .attr('class', 'arena-breathe')
      .style('animation-delay', () => `${Math.random() * 2}s`)

    // diagnostic halo rings (novelty / reality / plausibility) — slow sweep
    node.each(function (d) {
      const halo = d3.select(this).append('g').attr('class', 'halo-spin')
      d._rings.forEach((c, i) => {
        halo.append('circle')
          .attr('r', d._r + 7 + i * 5)
          .attr('fill', 'none')
          .attr('stroke', `rgb(${c})`)
          .attr('stroke-width', 2.5)
          .attr('stroke-opacity', d._elim ? 0.3 : 0.9)
          .attr('stroke-dasharray', i % 2 === 0 ? '4 4' : '2 6')
          .style('filter', `drop-shadow(0 0 4px rgb(${c} / 0.6))`)
      })
    })

    // core
    node.append('circle')
      .attr('r', (d) => d._r)
      .attr('fill', (d) => `rgb(${d._color} / ${d._elim ? 0.18 : 0.9})`)
      .attr('stroke', (d) => `rgb(${d._color})`)
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.5)
      .style('filter', (d) => d._elim ? 'none' : `drop-shadow(0 0 8px rgb(${d._color} / 0.6))`)

    // discovery score inside core
    node.append('text')
      .text((d) => d._disc != null ? Math.round(d._disc) : '')
      .attr('text-anchor', 'middle').attr('dy', 4)
      .attr('font-size', 11).attr('font-family', 'IBM Plex Mono, monospace').attr('font-weight', 600)
      .attr('fill', (d) => d._elim ? `rgb(${d._color})` : '#04130d')
      .style('pointer-events', 'none')

    // title label
    node.append('text')
      .text((d) => d.title.slice(0, 34) + (d.title.length > 34 ? '…' : ''))
      .attr('x', 0).attr('y', (d) => d._r + 28)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10.5).attr('font-family', 'IBM Plex Sans, sans-serif')
      .attr('fill', (d) => d._elim ? 'rgb(110 120 140)' : 'rgb(200 208 222)')
      .style('pointer-events', 'none')
      .each(function (d) { if (d._elim) d3.select(this).attr('text-decoration', 'line-through') })

    sim.on('tick', () => {
      elink.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      dlink.attr('d', (d) => {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y
        const dr = Math.hypot(dx, dy) * 1.6
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`
      })
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })
    return () => sim.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, debateLinks])

  return <div ref={ref} className="w-full h-full"><svg className="w-full h-full" /></div>
}

function Stat({ label, value, color }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="label-mono">{label}</span>
      <span className="font-mono text-lg leading-none" style={{ color: color ? `rgb(${color})` : 'rgb(var(--ink-0))' }}>{value}</span>
    </div>
  )
}

export default function DiscoveryArena() {
  const { runId } = useParams()
  const navigate = useNavigate()
  const [hyps, setHyps] = useState([])
  const [debates, setDebates] = useState([])
  const [sel, setSel] = useState(null)

  useEffect(() => {
    let stop = false
    const load = () => {
      getHypotheses(runId).then((d) => { if (!stop) setHyps(d.hypotheses || []) }).catch(() => {})
      getDebates(runId).then((d) => { if (!stop) setDebates(d.debates || []) }).catch(() => {})
    }
    load()
    const iv = setInterval(load, 4000)
    return () => { stop = true; clearInterval(iv) }
  }, [runId])

  const { nodes, links, debateLinks, stats } = useMemo(() => {
    const nodes = hyps.map(toNode)
    const ids = new Set(nodes.map((n) => n.id))
    const links = []
    nodes.forEach((n) => n._parents.forEach((p) => { if (ids.has(p)) links.push({ source: p, target: n.id }) }))
    const debateLinks = debates.map((d) => ({ source: d.hyp_a_id, target: d.hyp_b_id })).filter((l) => ids.has(l.source) && ids.has(l.target))
    const surviving = hyps.filter((h) => h.status !== 'eliminated')
    const top = [...surviving].filter((h) => h.scores?.discovery_score != null)
      .sort((a, b) => b.scores.discovery_score - a.scores.discovery_score)[0]
    const stats = {
      emerged: hyps.length,
      surviving: surviving.length,
      eliminated: hyps.filter((h) => h.status === 'eliminated').length,
      evolved: hyps.filter((h) => h.generation_type === 'evolved').length,
      debates: debates.length,
      top,
    }
    return { nodes, links, debateLinks, stats }
  }, [hyps, debates])

  const selFull = sel ? hyps.find((h) => h.id === sel.id) : null

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-7 py-5 border-b hairline flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="live-dot relative inline-flex w-2 h-2 rounded-full" style={{ background: 'rgb(70 229 181)' }} />
            <span className="label-mono">Discovery Arena · live selection</span>
          </div>
          <h1 className="font-display text-2xl text-ink-0 mt-1.5">Hypotheses competing for survival</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className="chip" style={{ color: 'rgb(70 229 181)', borderColor: 'rgb(70 229 181 / 0.3)' }}>surviving {stats.surviving}</span>
          <span className="chip" style={{ color: 'rgb(125 211 252)', borderColor: 'rgb(125 211 252 / 0.3)' }}>evolved {stats.evolved}</span>
          <span className="chip" style={{ color: 'rgb(255 92 122)', borderColor: 'rgb(255 92 122 / 0.3)' }}>eliminated {stats.eliminated}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        {nodes.length > 0 ? (
          <Arena nodes={nodes} links={links} debateLinks={debateLinks} onSelect={setSel} />
        ) : (
          <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">no hypotheses yet — the run may still be in progress.</div>
        )}

        {/* mission stats HUD */}
        <div className="absolute top-4 left-4 panel panel-raised px-4 py-3.5 w-56 space-y-2.5">
          <div className="label-mono" style={{ color: 'rgb(70 229 181)' }}>Mission status</div>
          <Stat label="emerged" value={stats.emerged} />
          <Stat label="surviving" value={stats.surviving} color="70 229 181" />
          <Stat label="evolved" value={stats.evolved} color="125 211 252" />
          <Stat label="eliminated" value={stats.eliminated} color="255 92 122" />
          <Stat label="debates" value={stats.debates} color="245 181 71" />
          {stats.top && (
            <div className="pt-2.5 mt-1 border-t hairline">
              <div className="label-mono mb-1" style={{ color: 'rgb(70 229 181)' }}>★ leading</div>
              <div className="text-[12px] text-ink-1 leading-snug">{stats.top.title}</div>
              <div className="font-mono text-phosphor text-sm mt-1">disc {Math.round(stats.top.scores.discovery_score)}</div>
            </div>
          )}
        </div>

        {/* legend */}
        <div className="absolute top-4 right-4 panel px-3.5 py-3 space-y-2 text-[11px] text-ink-2">
          <div className="label-mono mb-1">Node state</div>
          {[['70 229 181', 'surviving'], ['125 211 252', 'evolved hybrid'], ['255 92 122', 'eliminated']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: `rgb(${c})`, boxShadow: `0 0 6px rgb(${c})` }} />{l}</div>
          ))}
          <div className="label-mono mt-2.5 mb-1 pt-2 border-t hairline">Halo rings</div>
          <div className="text-[10.5px] leading-relaxed text-ink-3">inner→outer:<br />novelty · reality · plausibility<br />green ok · amber caution · red risk</div>
          <div className="text-[10.5px] text-ink-3 pt-1.5">size = discovery score · blue threads = evolution lineage</div>
        </div>

        {/* selected node dossier */}
        {selFull && (
          <div className="absolute bottom-4 left-4 panel panel-raised p-4 max-w-md animate-in">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="chip" style={{ color: `rgb(${statusColor(selFull)})`, borderColor: `rgb(${statusColor(selFull)} / 0.4)` }}>
                {selFull.status === 'eliminated' ? 'eliminated' : selFull.generation_type === 'evolved' ? 'evolved' : 'surviving'}
              </span>
              {selFull.scores?.discovery_score != null && <span className="font-mono text-phosphor text-sm">disc {Math.round(selFull.scores.discovery_score)}</span>}
              <span className="font-mono text-ink-3 text-[11px]">elo {Math.round(selFull.elo_score)}</span>
            </div>
            <div className="text-ink-0 font-medium leading-snug text-[14px]">{selFull.title}</div>
            <div className="flex items-center gap-2 flex-wrap mt-2.5">
              {selFull.novelty?.verdict && <span className="chip" style={{ fontSize: '0.58rem', color: `rgb(${NOVELTY_C[selFull.novelty.verdict] || NOVELTY_C.incremental})`, borderColor: `rgb(${NOVELTY_C[selFull.novelty.verdict] || NOVELTY_C.incremental} / 0.4)` }}>⌖ {selFull.novelty.verdict}</span>}
              {selFull.prior_failure?.verdict && <span className="chip" style={{ fontSize: '0.58rem', color: `rgb(${REALITY_C[selFull.prior_failure.verdict] || '245 181 71'})`, borderColor: `rgb(${REALITY_C[selFull.prior_failure.verdict] || '245 181 71'} / 0.4)` }}>⚕ {selFull.prior_failure.verdict.replace(/_/g, ' ')}</span>}
              {selFull.plausibility?.verdict && <span className="chip" style={{ fontSize: '0.58rem', color: `rgb(${PLAUS_C[selFull.plausibility.verdict] || PLAUS_C.uncertain})`, borderColor: `rgb(${PLAUS_C[selFull.plausibility.verdict] || PLAUS_C.uncertain} / 0.4)` }}>⚛ {selFull.plausibility.verdict}</span>}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => navigate(`/run/${runId}/hypothesis/${selFull.id}`)} className="btn btn-primary px-3.5 py-1.5 text-xs">Open full dossier →</button>
              <button onClick={() => setSel(null)} className="label-mono hover:text-phosphor">close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
