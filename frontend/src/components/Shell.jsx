import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Telescope, Radio, FlaskConical, Swords, Share2, Map, Plus, HelpCircle,
} from 'lucide-react'
import Tour, { shouldAutoOpenTour } from './Tour'

const NAV = [
  { to: 'live', label: 'Live Discovery', icon: Radio },
  { to: 'portfolio', label: 'Hypotheses', icon: FlaskConical },
  { to: 'tournament', label: 'Tournament', icon: Swords },
  { to: 'graph', label: 'Knowledge Graph', icon: Share2 },
  { to: 'roadmap', label: 'Roadmap', icon: Map },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid place-items-center w-8 h-8 rounded-lg"
        style={{ background: 'radial-gradient(circle at 30% 30%, rgb(70 229 181 / 0.9), rgb(54 213 181 / 0.4))',
                 boxShadow: '0 0 18px rgb(70 229 181 / 0.45)' }}>
        <Telescope size={16} color="#04130d" strokeWidth={2.4} />
      </div>
      <div className="leading-none">
        <div className="font-display text-[15px] font-semibold text-ink-0 tracking-tight">Discovery Engine</div>
        <div className="label-mono mt-0.5" style={{ fontSize: '0.54rem' }}>powered by K2-Think</div>
      </div>
    </div>
  )
}

export default function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const m = location.pathname.match(/\/run\/([^/]+)/)
  const runId = m ? m[1] : null
  const inRun = !!runId
  const [tourOpen, setTourOpen] = useState(false)
  useEffect(() => { if (shouldAutoOpenTour()) setTourOpen(true) }, [])

  return (
    <div className="relative z-10 h-full w-full flex">
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <aside className="w-[244px] shrink-0 border-r hairline flex flex-col px-4 py-5"
        style={{ background: 'linear-gradient(180deg, rgb(9 13 22 / 0.6), rgb(6 8 13 / 0.3))' }}>
        <button onClick={() => navigate('/')} className="text-left">
          <Logo />
        </button>

        <button onClick={() => navigate('/')}
          className="btn btn-ghost mt-6 w-full justify-start px-3 py-2 text-sm">
          <Plus size={15} /> New discovery
        </button>

        <div className="mt-7 label-mono px-1">Run views</div>
        <nav className="mt-2.5 flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={inRun ? `/run/${runId}/${to}` : '#'}
              onClick={(e) => { if (!inRun) e.preventDefault() }}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                  !inRun ? 'opacity-35 cursor-not-allowed' :
                  isActive ? 'text-ink-0' : 'text-ink-2 hover:text-ink-0'
                }`
              }
              style={({ isActive }) => isActive && inRun ? {
                background: 'rgb(70 229 181 / 0.1)',
                boxShadow: 'inset 2px 0 0 rgb(70 229 181)',
              } : undefined}
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-5 border-t hairline">
          <button onClick={() => setTourOpen(true)}
            className="flex items-center gap-2 text-sm text-ink-2 hover:text-phosphor transition w-full px-1 py-1">
            <HelpCircle size={15} /> How it works
          </button>
          {runId && (
            <div className="font-mono text-ink-3 px-1 mt-3" style={{ fontSize: '0.62rem' }}>
              run · <span className="text-ink-2">{runId}</span>
            </div>
          )}
          <div className="label-mono px-1 mt-2" style={{ fontSize: '0.52rem' }}>
            Multi-agent · cyclical
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
