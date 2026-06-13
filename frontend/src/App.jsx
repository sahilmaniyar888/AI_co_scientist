import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Shell from './components/Shell'
import MissionControl from './views/MissionControl'
import LiveDiscovery from './views/LiveDiscovery'
import HypothesisPortfolio from './views/HypothesisPortfolio'
import TournamentViewer from './views/TournamentViewer'
import KnowledgeGraph from './views/KnowledgeGraph'
import DiscoveryCard from './views/DiscoveryCard'
import ResearchRoadmap from './views/ResearchRoadmap'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<MissionControl />} />
          <Route path="/run/:runId/live" element={<LiveDiscovery />} />
          <Route path="/run/:runId/portfolio" element={<HypothesisPortfolio />} />
          <Route path="/run/:runId/tournament" element={<TournamentViewer />} />
          <Route path="/run/:runId/graph" element={<KnowledgeGraph />} />
          <Route path="/run/:runId/hypothesis/:hid" element={<DiscoveryCard />} />
          <Route path="/run/:runId/roadmap" element={<ResearchRoadmap />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
