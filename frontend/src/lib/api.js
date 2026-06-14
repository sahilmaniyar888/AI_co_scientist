const BASE = '/api'

async function jget(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

export const getDemos = () => jget('/demos')
export const getRuns = () => jget('/runs')
export const getRun = (id) => jget(`/run/${id}`)
export const getHypotheses = (id) => jget(`/run/${id}/hypotheses`)
export const getHypothesis = (id, hid) => jget(`/run/${id}/hypothesis/${hid}`)
export const getDebates = (id) => jget(`/run/${id}/debates`)
export const getGraph = (id) => jget(`/run/${id}/graph`)
export const getContradictions = (id) => jget(`/run/${id}/contradictions`)

export async function launchRun(body) {
  const r = await fetch(`${BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`launch failed: ${r.status}`)
  return r.json()
}

/**
 * Subscribe to a run's SSE stream. Returns a function to close the connection.
 * onEvent receives { type, data }.
 */
export function streamRun(runId, onEvent) {
  const es = new EventSource(`${BASE}/run/${runId}/stream`)
  const types = [
    'run_started', 'plan', 'stage', 'papers_loaded', 'literature_done',
    'agent_started', 'agent_thinking', 'agent_output', 'agent_error',
    'graph_done', 'gaps_done', 'contradictions_done', 'hypothesis_added',
    'hypothesis_critiqued', 'hypothesis_eliminated', 'debate_result',
    'round_done', 'novelty_checked', 'prior_failure_checked', 'plausibility_checked',
    'score_updated', 'datasets_found', 'enrichment_ready', 'run_complete',
    'run_error', 'stream_end',
  ]
  for (const t of types) {
    es.addEventListener(t, (e) => {
      let data = {}
      try { data = JSON.parse(e.data) } catch { /* noop */ }
      onEvent({ type: t, data })
      // Close on stream_end so the browser does not auto-reconnect and replay
      // the event history (which would duplicate feed cards).
      if (t === 'stream_end') es.close()
    })
  }
  es.onerror = () => { /* transient; browser retries. history replay covers gaps */ }
  return () => es.close()
}
