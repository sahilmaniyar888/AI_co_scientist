import axios from 'axios'

const BASE = '/api'

export const api = axios.create({ baseURL: BASE })

export const startSession = (query, context = '') =>
  api.post('/session/start', { query, context }).then((response) => response.data)

export const getSession = (sessionId) =>
  api.get(`/session/${sessionId}`).then((response) => response.data)

export const uploadFile = (sessionId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api
    .post(`/upload/${sessionId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((response) => response.data)
}

export function runStage(sessionId, stage, onEvent) {
  const controller = new AbortController()
  const url = `${BASE}/pipeline/run/${sessionId}/${stage}`

  fetch(url, { signal: controller.signal })
    .then(async (response) => {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          if (!part.trim()) continue
          const lines = part.split('\n')
          let event = 'message'
          let dataString = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            if (line.startsWith('data: ')) dataString = line.slice(6).trim()
          }
          try {
            onEvent({ type: event, data: JSON.parse(dataString) })
          } catch {
            // Ignore malformed SSE chunks.
          }
        }
      }
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        onEvent({ type: 'error', data: { message: error.message } })
      }
    })

  return controller
}

export function sendChat(sessionId, message, mode, onEvent) {
  const controller = new AbortController()
  const url = `${BASE}/chat/${sessionId}`

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message, mode }),
    signal: controller.signal,
  })
    .then(async (response) => {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const parts = buffer.split('\n\n')
        buffer = parts.pop()
        for (const part of parts) {
          if (!part.trim()) continue
          const lines = part.split('\n')
          let event = 'message'
          let dataString = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            if (line.startsWith('data: ')) dataString = line.slice(6).trim()
          }
          try {
            onEvent({ type: event, data: JSON.parse(dataString) })
          } catch {
            // Ignore malformed SSE chunks.
          }
        }
      }
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        onEvent({ type: 'error', data: { message: error.message } })
      }
    })

  return controller
}
