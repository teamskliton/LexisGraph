import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  Network,
  ShieldCheck,
  Search,
  Layers,
  Download,
  Settings,
  Moon,
  Sun,
  Scale,
  Activity
} from 'lucide-react';

import { useTheme } from '../../hooks/useTheme';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload Documents', icon: Upload },
  { to: '/graph', label: 'Graph Explorer', icon: Network },
  { to: '/compliance', label: 'Compliance Check', icon: ShieldCheck },
  { to: '/retrieval', label: 'Semantic Retrieval', icon: Search },
  { to: '/domain', label: 'Domain Pipeline', icon: Layers },
  { to: '/export', label: 'Export & Reports', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ collapsed, healthConnected, onToggleTheme }) {
  const { resolvedTheme } = useTheme();

  return (
    <aside className={`sticky top-0 h-screen border-r border-borderColor bg-bgSecondary px-3 py-4 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'}`}>
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-content-center rounded-xl bg-accentPrimary text-white">
          <Scale size={18} />
        </div>
        {!collapsed ? <h1 className="text-lg font-bold">LexisGraph</h1> : null}
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg border-l-4 px-3 py-2 text-sm transition ${
                  isActive
                    ? 'border-accentPrimary bg-blue-500/10 text-accentPrimary'
                    : 'border-transparent text-textSecondary hover:bg-bgPrimary'
                }`
              }
            >
              <Icon size={18} />
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="absolute bottom-4 left-3 right-3 space-y-3">
        <div className="flex items-center gap-2 rounded-lg border border-borderColor p-2 text-xs">
          <Activity size={14} className={healthConnected ? 'text-emerald-500' : 'text-red-500'} />
          {!collapsed ? <span>{healthConnected ? 'System Healthy' : 'System Unreachable'}</span> : null}
        </div>

        <button
          onClick={onToggleTheme}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-borderColor bg-bgCard text-sm font-semibold"
        >
          {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed ? <span>Toggle Theme</span> : null}
        </button>
      </div>
    </aside>
  );
}
