import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Download,
  LayoutDashboard,
  Layers,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  UserCircle,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/upload', label: 'Upload Documents', icon: Upload },
  { to: '/graph', label: 'Graph Explorer', icon: Network },
  { to: '/compliance', label: 'Compliance Check', icon: ShieldCheck },
  { to: '/retrieval', label: 'Semantic Retrieval', icon: Search },
  { to: '/domain', label: 'Domain Pipeline', icon: Layers },
  { to: '/export', label: 'Export & Reports', icon: Download },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const titles = {
  '/': 'Dashboard',
  '/upload': 'Upload Documents',
  '/graph': 'Graph Explorer',
  '/compliance': 'Compliance Check',
  '/retrieval': 'Semantic Retrieval',
  '/domain': 'Domain Pipeline',
  '/export': 'Export & Reports',
  '/settings': 'Settings',
};

function BrandMark() {
  return (
    <Link to="/" className="flex min-w-fit items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--accent-blue)] text-sm font-bold text-white shadow-sm">
        LG
      </span>
      <span className="hidden sm:block">
        <span className="block text-sm font-semibold leading-tight text-[var(--text-primary)]">LexisGraph</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Legal Intelligence</span>
      </span>
    </Link>
  );
}

function ConnectionPill({ healthConnected }) {
  return (
    <span
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
        healthConnected
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-700'
      }`}
      title={healthConnected ? 'Backend connected' : 'Backend offline'}
    >
      <span className={`h-2 w-2 rounded-full ${healthConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <span className="hidden lg:inline">{healthConnected ? 'System Online' : 'System Offline'}</span>
    </span>
  );
}

function GlobalSearch() {
  const [value, setValue] = useState('');
  const navigate = useNavigate();

  const submit = (event) => {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;
    navigate(`/retrieval?q=${encodeURIComponent(query)}`);
  };

  return (
    <form onSubmit={submit} className="relative hidden min-w-[220px] flex-1 xl:block">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Global semantic search"
        placeholder="Search clauses, documents, regulations"
        className="h-9 w-full rounded-full border border-[var(--border-default)] bg-[var(--bg-card-hover)] pl-9 pr-4 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--border-accent)] focus:bg-white focus:shadow-sm"
      />
    </form>
  );
}

export default function Topbar({ healthConnected }) {
  const location = useLocation();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const activeTitle = useMemo(() => titles[location.pathname] || 'LexisGraph', [location.pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--border-subtle)] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1800px] items-center gap-4 px-4 sm:px-6">
        <BrandMark />

        <nav className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto lg:flex">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-[var(--accent-blue)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                  }`
                }
              >
                <Icon size={15} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="min-w-0 flex flex-1 items-center justify-end gap-2 lg:flex-none">
          <div className="hidden text-right xl:block">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{activeTitle}</p>
            <p className="text-[10px] text-[var(--text-muted)]">{time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <GlobalSearch />
          <ConnectionPill healthConnected={healthConnected} />
          <Link
            to="/settings"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-default)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--border-accent)] hover:text-[var(--text-primary)]"
            title="Settings"
          >
            <Settings size={16} />
          </Link>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--border-default)] bg-white text-[var(--text-secondary)]"
            title="Local profile"
          >
            <UserCircle size={17} />
          </button>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t border-[var(--border-subtle)] px-3 py-2 lg:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold ${
                  isActive ? 'bg-[var(--accent-blue)] text-white' : 'text-[var(--text-secondary)]'
                }`
              }
            >
              <Icon size={14} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
}
