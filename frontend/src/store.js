import { create } from 'zustand'
import { streamRun } from './lib/api'

const THINK_CAP = 7000
const FEED_CAP = 200

// The live stream is owned at module scope, NOT by the LiveDiscovery component, so it
// keeps running to completion even when the user navigates to other views and back.
let _activeRunId = null
let _activeClose = null

const STAGE_ORDER = [
  'queued', 'literature', 'graph', 'gaps', 'contradictions',
  'hypothesis_gen', 'critique', 'tournament', 'novelty', 'scoring', 'enrichment',
  'meta_review', 'complete',
]

function freshLive() {
  return {
    runId: null,
    goal: '',
    plan: null,
    stage: 'queued',
    stageLabel: 'Queued',
    progress: 0,
    memoryUsed: false,
    papersCount: 0,
    reachable: 0,
    gapsCount: 0,
    contradictionsCount: 0,
    agents: {},          // name -> { status, ts }
    activeAgent: null,
    thinkBuffer: '',
    feed: [],            // newest-first feed cards
    hypotheses: {},      // id -> { ... }
    eliminated: [],      // { id, title, reason, critique_score }
    debates: [],         // newest-first
    complete: false,
    error: null,
  }
}

let feedSeq = 0
const card = (type, payload) => ({ id: `f${feedSeq++}`, type, ts: Date.now(), ...payload })

export const useStore = create((set, get) => ({
  ...freshLive(),

  resetLive(runId, goal) {
    set({ ...freshLive(), runId, goal })
  },

  // Start (or resume) the live stream for a run. Idempotent: calling it again for the
  // same run does NOTHING — so navigating away and back never restarts the replay.
  // The stream runs to completion regardless of which view is mounted.
  startStream(runId) {
    if (_activeRunId === runId) return
    if (_activeClose) { try { _activeClose() } catch { /* noop */ } _activeClose = null }
    _activeRunId = runId
    set({ ...freshLive(), runId })
    _activeClose = streamRun(runId, (ev) => get().applyEvent(ev))
  },

  applyEvent({ type, data }) {
    const s = get()
    switch (type) {
      case 'run_started':
        set({ runId: data.run_id, goal: data.goal || s.goal })
        break
      case 'plan':
        set({
          plan: data,
          memoryUsed: !!data.memory_used,
        })
        break
      case 'stage':
        set({ stage: data.stage, stageLabel: data.label, progress: data.progress })
        break
      case 'papers_loaded':
        set({ papersCount: data.count, reachable: data.reachable || data.count })
        set({ feed: [card('papers', { count: data.count, reachable: data.reachable, source: data.source }), ...s.feed].slice(0, FEED_CAP) })
        break
      case 'agent_started':
        set({ agents: { ...s.agents, [data.agent]: { status: 'thinking', ts: Date.now() } } })
        break
      case 'agent_thinking': {
        const next = (s.thinkBuffer + data.chunk).slice(-THINK_CAP)
        set({
          thinkBuffer: next,
          activeAgent: data.agent,
          agents: { ...s.agents, [data.agent]: { status: 'thinking', ts: Date.now() } },
        })
        break
      }
      case 'agent_output':
        set({ agents: { ...s.agents, [data.agent]: { status: 'done', ts: Date.now() } } })
        break
      case 'gaps_done':
        set({ gapsCount: data.count })
        set({ feed: [card('gaps', { count: data.count, gaps: data.gaps || [] }), ...s.feed].slice(0, FEED_CAP) })
        break
      case 'contradictions_done':
        set({ contradictionsCount: data.count })
        if (data.count) set({ feed: [card('contradictions', { count: data.count }), ...s.feed].slice(0, FEED_CAP) })
        break
      case 'hypothesis_added': {
        const h = {
          id: data.id, title: data.title, archetype: data.archetype,
          elo: data.elo || 1000, generation_type: data.generation_type,
          parent_ids: data.parent_ids || [], status: 'active',
        }
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...(s.hypotheses[data.id] || {}), ...h } },
          feed: [card('hypothesis', h), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'hypothesis_critiqued': {
        const cur = s.hypotheses[data.id] || {}
        set({ hypotheses: { ...s.hypotheses, [data.id]: { ...cur, critique_score: data.critique_score } } })
        break
      }
      case 'hypothesis_eliminated': {
        const cur = s.hypotheses[data.id] || {}
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...cur, status: 'eliminated' } },
          eliminated: [{ id: data.id, title: data.title, reason: data.reason, critique_score: data.critique_score }, ...s.eliminated],
          feed: [card('eliminated', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'debate_result': {
        const hyps = { ...s.hypotheses }
        if (data.a_id && hyps[data.a_id]) hyps[data.a_id] = { ...hyps[data.a_id], elo: data.a_elo }
        if (data.b_id && hyps[data.b_id]) hyps[data.b_id] = { ...hyps[data.b_id], elo: data.b_elo }
        set({
          hypotheses: hyps,
          debates: [data, ...s.debates].slice(0, 80),
          feed: [card('debate', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'score_updated': {
        const cur = s.hypotheses[data.id] || {}
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...cur, discovery_score: data.discovery_score, dimensions: data.dimensions } },
          feed: [card('score', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'novelty_checked': {
        const cur = s.hypotheses[data.id] || {}
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...cur, novelty: {
            novelty_score: data.novelty_score, verdict: data.verdict,
            recombination_penalty: data.recombination_penalty,
          } } },
          feed: [card('novelty', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'prior_failure_checked': {
        const cur = s.hypotheses[data.id] || {}
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...cur, prior_failure: {
            verdict: data.verdict, already_tried: data.already_tried,
          } } },
          feed: [card('prior_failure', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'plausibility_checked': {
        const cur = s.hypotheses[data.id] || {}
        set({
          hypotheses: { ...s.hypotheses, [data.id]: { ...cur, plausibility: {
            plausibility_score: data.plausibility_score, verdict: data.verdict,
          } } },
          feed: [card('plausibility', data), ...s.feed].slice(0, FEED_CAP),
        })
        break
      }
      case 'enrichment_ready':
        set({ feed: [card('enrichment', data), ...s.feed].slice(0, FEED_CAP) })
        break
      case 'run_complete':
        set({ complete: true, stage: 'complete', progress: 100 })
        break
      case 'run_error':
      case 'agent_error':
        if (type === 'run_error') set({ error: data.error })
        break
      default:
        break
    }
  },
}))

export { STAGE_ORDER }
