import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as d3 from 'd3'
import { getGraph, getHypotheses } from '../lib/api'
import { GapScatter } from '../components/Charts'

const ROLE_COLOR = {
  contradiction: '255 92 122',
  hypothesis: '70 229 181',
  hub: '91 140 255',
  paper: '167 139 250',
}

// A paper node is "in a contradiction" if its title matches a contradiction's
// cited paper, "in a top hypothesis" if a top hypothesis cites it as evidence.
function classify(node, contraTitles, hypEvidence) {
  const t = (node.full_title || node.label || '').toLowerCase().slice(0, 36)
  if (t && contraTitles.some((c) => c.includes(t.slice(0, 24)) || t.includes(c.slice(0, 24)))) return 'contradiction'
  if (t && hypEvidence.some((e) => e.includes(t.slice(0, 24)) || t.includes(e.slice(0, 24)))) return 'hypothesis'
  if ((node._degree || 0) >= 4) return 'hub'
  return 'paper'
}

function ForceGraph({ nodes, edges, onSelect, selected }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!nodes.length) return
    const el = ref.current
    const w = el.clientWidth, h = el.clientHeight
    const svg = d3.select(el).select('svg')
    svg.selectAll('*').remove()
    svg.attr('viewBox', [0, 0, w, h])
    const g = svg.append('g')
    svg.call(d3.zoom().scaleExtent([0.3, 4]).on('zoom', (e) => g.attr('transform', e.transform)))

    const ids = new Set(nodes.map((n) => n.id))
    const links = edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e }))
    const neighbors = {}
    links.forEach((e) => {
      (neighbors[e.source] ||= new Set()).add(e.target)
      ;(neighbors[e.target] ||= new Set()).add(e.source)
    })

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(95).strength(0.35))
      .force('charge', d3.forceManyBody().strength(-320))
      .force('center', d3.forceCenter(w / 2, h / 2))
      .force('collide', d3.forceCollide((d) => d._r + 6))

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', (d) => d.relation === 'contradicts' ? 'rgb(255 92 122 / 0.6)' : 'rgb(140 160 200 / 0.16)')
      .attr('stroke-width', (d) => 0.7 + (d.strength || 0.4) * 2.2)

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
        .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
      .on('click', (e, d) => onSelect({ ...d, neighbors: [...(neighbors[d.id] || [])] }))
      .on('mouseenter', (e, d) => {
        const nb = neighbors[d.id] || new Set()
        node.style('opacity', (o) => (o.id === d.id || nb.has(o.id)) ? 1 : 0.18)
        link.style('opacity', (o) => (o.source.id === d.id || o.target.id === d.id) ? 0.9 : 0.05)
      })
      .on('mouseleave', () => { node.style('opacity', 1); link.style('opacity', 1) })

    node.append('circle')
      .attr('r', (d) => d._r)
      .attr('fill', (d) => `rgb(${d._color})`)
      .attr('fill-opacity', 0.92)
      .attr('stroke', (d) => `rgb(${d._color})`)
      .attr('stroke-width', 1.5).attr('stroke-opacity', 0.35)
      .style('filter', (d) => `drop-shadow(0 0 ${d._role === 'concept' ? 3 : 6}px rgb(${d._color} / 0.5))`)

    node.append('text')
      .text((d) => (d.label || d.id || '').slice(0, 22))
      .attr('x', (d) => d._r + 4).attr('y', 4)
      .attr('font-size', (d) => d._role === 'hub' || d._role === 'hypothesis' || d._role === 'contradiction' ? 11 : 9.5)
      .attr('font-family', 'IBM Plex Mono, monospace')
      .attr('fill', (d) => d._role === 'concept' ? 'rgb(124 134 156)' : 'rgb(200 208 222)')

    sim.on('tick', () => {
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })
    return () => sim.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges])

  return <div ref={ref} className="w-full h-full"><svg className="w-full h-full" /></div>
}

const LEGEND = [
  ['rgb(70 229 181)', 'Cited by a top hypothesis'],
  ['rgb(255 92 122)', 'In a contradiction'],
  ['rgb(91 140 255)', 'Hub paper (highly connected)'],
  ['rgb(167 139 250)', 'Paper'],
]

export default function KnowledgeGraph() {
  const { runId } = useParams()
  const [graph, setGraph] = useState(null)
  const [hyps, setHyps] = useState([])
  const [sel, setSel] = useState(null)

  useEffect(() => {
    getGraph(runId).then(setGraph).catch(() => {})
    getHypotheses(runId).then((d) => setHyps(d.hypotheses || [])).catch(() => {})
  }, [runId])

  const { nodes, edges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    const edges = graph.edges || []
    const degree = {}
    edges.forEach((e) => { degree[e.source] = (degree[e.source] || 0) + 1; degree[e.target] = (degree[e.target] || 0) + 1 })
    const contraTitles = (graph.contradictions || [])
      .flatMap((c) => [c.paper_a, c.paper_b]).filter(Boolean).map((s) => s.toLowerCase())
    const top = [...hyps].filter((h) => h.status !== 'eliminated')
      .sort((a, b) => b.elo_score - a.elo_score).slice(0, 6)
    const hypEvidence = top.flatMap((h) => h.supporting_evidence || []).map((s) => String(s).toLowerCase())
    const maxCites = Math.max(1, ...(graph.nodes || []).map((n) => n.cited_by_count || 0))
    const nodes = (graph.nodes || []).slice(0, 60).map((n) => {
      const deg = degree[n.id] || 0
      const base = { ...n, _degree: deg }
      const role = classify(base, contraTitles, hypEvidence)
      const citeScale = Math.log1p(n.cited_by_count || 0) / Math.log1p(maxCites)
      return { ...base, _role: role, _color: ROLE_COLOR[role],
               _r: 7 + citeScale * 15 + Math.min(6, deg) }
    })
    return { nodes, edges }
  }, [graph, hyps])

  if (!graph) return <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">loading graph…</div>

  const roleCounts = nodes.reduce((a, n) => ((a[n._role] = (a[n._role] || 0) + 1), a), {})

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 px-7 py-5 border-b hairline flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl text-ink-0">Citation Network</h1>
          <p className="text-ink-2 text-sm mt-1">{nodes.length} papers · {edges.length} citation links · node size = times cited</p>
        </div>
        <div className="flex gap-2">
          {[['hypothesis', 'in top hyp'], ['contradiction', 'contested'], ['hub', 'hubs']].map(([k, lbl]) => (
            roleCounts[k] ? <span key={k} className="chip" style={{ color: `rgb(${ROLE_COLOR[k]})`, borderColor: `rgb(${ROLE_COLOR[k]} / 0.3)` }}>{roleCounts[k]} {lbl}</span> : null
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-[1fr_360px]">
        <div className="relative border-r hairline">
          {nodes.length > 0 ? <ForceGraph nodes={nodes} edges={edges} onSelect={setSel} selected={sel} /> : (
            <div className="h-full grid place-items-center text-ink-3 font-mono text-sm">graph not yet built</div>
          )}
          <div className="absolute top-4 right-4 panel px-3.5 py-3 space-y-1.5">
            {LEGEND.map(([c, l]) => (
              <div key={l} className="flex items-center gap-2 text-[11px] text-ink-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />{l}
              </div>
            ))}
          </div>
          {sel && (
            <div className="absolute bottom-4 left-4 panel panel-raised p-4 max-w-sm animate-in">
              <div className="label-mono" style={{ color: `rgb(${sel._color})` }}>{sel._role === 'paper' ? 'paper' : sel._role}</div>
              <div className="text-ink-0 font-medium mt-1 leading-snug text-[13px]">{sel.full_title || sel.label}</div>
              <div className="text-[12px] text-ink-2 mt-1.5 font-mono">{sel.cited_by_count ?? 0} citations · {sel.year || '—'} · {sel._degree} links</div>
              {sel.venue && <div className="text-[11px] text-ink-3 mt-1 italic truncate">{sel.venue}</div>}
              {sel.neighbors?.length > 0 && (
                <div className="mt-2 text-[11px] text-ink-2 leading-snug">
                  <span className="label-mono">connected: </span>{sel.neighbors.length} papers
                </div>
              )}
              <button onClick={() => setSel(null)} className="label-mono mt-2 hover:text-phosphor">close</button>
            </div>
          )}
        </div>

        {/* sidebar: gaps scatter + contradiction map */}
        <div className="overflow-y-auto p-5 space-y-5">
          {(graph.gaps || []).length > 0 && (
            <div>
              <div className="label-mono mb-2" style={{ color: 'rgb(245 181 71)' }}>◍ Research gap landscape</div>
              <GapScatter gaps={graph.gaps} />
            </div>
          )}
          <div>
            <div className="label-mono mb-3" style={{ color: 'rgb(255 92 122)' }}>⚡ Contradiction map</div>
            <div className="space-y-3">
              {(graph.contradictions || []).length === 0 && <div className="text-ink-3 text-xs font-mono">no contradictions detected</div>}
              {(graph.contradictions || []).map((c, i) => (
                <div key={i} className="panel p-3.5" style={{ borderColor: 'rgb(255 92 122 / 0.2)' }}>
                  <div className="text-[13px] text-ink-0 leading-snug">{c.claim || c.explanation}</div>
                  {c.contradiction_type && <div className="chip mt-2" style={{ color: 'rgb(255 92 122)', borderColor: 'rgb(255 92 122 / 0.3)' }}>{c.contradiction_type.replace(/_/g, ' ')}</div>}
                  {c.possible_explanations?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {c.possible_explanations.slice(0, 2).map((e, j) => <li key={j} className="text-[11.5px] text-ink-2 leading-snug">· {e}</li>)}
                    </ul>
                  )}
                  {c.resolution_experiments?.length > 0 && <div className="mt-2 text-[11px] text-phosphor leading-snug">⌖ {c.resolution_experiments[0]}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
