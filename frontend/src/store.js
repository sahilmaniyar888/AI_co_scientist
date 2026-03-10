import { create } from 'zustand'

export const useStore = create((set) => ({
  sessionId: null,
  query: '',
  setSession: (sessionId, query) => set({ sessionId, query }),
  clearSession: () =>
    set({
      sessionId: null,
      query: '',
      completedStages: [],
      activeStage: 1,
      messages: {},
      artifacts: {},
      thinking: {},
      uploadedFile: null,
      isRunning: false,
    }),

  activeStage: 1,
  completedStages: [],
  setActiveStage: (stage) => set({ activeStage: stage }),
  markStageComplete: (stage) =>
    set((state) => ({ completedStages: [...new Set([...state.completedStages, stage])] })),

  isRunning: false,
  setRunning: (value) => set({ isRunning: value }),

  messages: {},
  addMessage: (stage, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [stage]: [...(state.messages[stage] || []), message],
      },
    })),

  thinking: {},
  setThinking: (stage, value) =>
    set((state) => ({
      thinking: {
        ...state.thinking,
        [stage]: value,
      },
    })),

  artifacts: {},
  setArtifact: (stage, data) =>
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [stage]: data,
      },
    })),

  uploadedFile: null,
  setUploadedFile: (file) => set({ uploadedFile: file }),

  showThinking: true,
  toggleThinking: () => set((state) => ({ showThinking: !state.showThinking })),
}))
