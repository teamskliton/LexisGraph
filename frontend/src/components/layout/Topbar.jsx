import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { fmtDate } from '../../utils/formatters';
import { useTheme } from '../../hooks/useTheme';

const titles = {
  '/': 'Dashboard',
  '/upload': 'Upload Documents',
  '/graph': 'Graph Explorer',
  '/compliance': 'Compliance Check',
  '/retrieval': 'Semantic Retrieval',
  '/domain': 'Domain Pipeline',
  '/export': 'Export & Reports',
  '/settings': 'Settings'
};

export default function Topbar({ lastUpdated, healthConnected, onToggleTheme }) {
  const location = useLocation();
  const { resolvedTheme } = useTheme();

  const breadcrumb = useMemo(() => {
    const path = location.pathname;
    return [{ label: 'LexisGraph', to: '/' }, { label: titles[path] || 'Page', to: path }];
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-borderColor bg-bgSecondary/90 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{titles[location.pathname] || 'LexisGraph'}</h2>
          <div className="mt-1 flex items-center gap-2 text-xs text-textMuted">
            {breadcrumb.map((item, idx) => (
              <span key={item.to} className="flex items-center gap-2">
                {idx > 0 ? '>' : ''}
                <Link to={item.to} className="hover:text-textPrimary">
                  {item.label}
                </Link>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${healthConnected ? 'bg-emerald-500/20 text-emerald-600' : 'bg-red-500/20 text-red-600'}`}>
            {healthConnected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="text-xs text-textMuted">Updated {fmtDate(lastUpdated)}</span>
          <button className="rounded-lg border border-borderColor p-2" onClick={onToggleTheme}>
            {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
