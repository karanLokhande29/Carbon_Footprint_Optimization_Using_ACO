import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Zap, BarChart3, Leaf } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const links = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/predict',   icon: Zap,             label: 'Predict'    },
  { to: '/analytics', icon: BarChart3,        label: 'Analytics'  },
]

export default function Sidebar() {
  const ctx = useApp()
  if (!ctx) return null   // guard: context not yet available during HMR
  const { state } = ctx
  const online = state.health?.status === 'ok'

  return (
    <aside className="sticky top-0 self-start h-screen w-56 flex-shrink-0 glass border-r border-gray-800 flex flex-col overflow-y-auto">
      {/* Brand */}
      <div className="px-6 py-8 border-b border-gray-800/60">
        <div className="flex items-center gap-3.5">
          <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 flex-shrink-0">
            <div className="absolute inset-0 bg-white/20 rounded-xl opacity-0 hover:opacity-100 transition-opacity"></div>
            <Leaf size={20} className="text-white drop-shadow-md z-10" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 leading-none truncate">CarbonVis</p>
            <p className="text-[10px] text-cyan-500/80 mt-1 font-mono tracking-wider uppercase truncate">CIFAR-100 · ACO</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 active:scale-[0.97] relative overflow-hidden group ${
                isActive
                  ? 'text-white border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-transparent shadow-[0_0_15px_rgba(56,189,248,0.05)]'
                  : 'text-gray-400 hover:text-white border border-transparent hover:bg-gray-800/40'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className={`relative z-10 transition-all duration-300 ${isActive ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]' : 'group-hover:text-cyan-400'}`} />
                <span className={`relative z-10 font-semibold tracking-wide ${isActive ? 'text-white' : ''}`}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Status */}
      <div className="px-5 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-xs text-gray-500">
            {online ? `API · ${state.health.device}` : 'API offline'}
          </span>
        </div>
        {online && (
          <p className="text-[10px] text-gray-600 mt-1">
            {state.health.loaded_dl_models?.length ?? 0} DL + {state.health.loaded_classical?.length ?? 0} CL loaded
          </p>
        )}
      </div>
    </aside>
  )
}
