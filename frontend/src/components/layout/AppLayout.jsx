import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getHealth } from '../../api/endpoints';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useTheme } from '../../hooks/useTheme';

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [healthConnected, setHealthConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme((current) => {
      const resolved = current === 'system' ? 'light' : current;
      return resolved === 'dark' ? 'light' : 'dark';
    });
  };

  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let mounted = true;
    const ping = async () => {
      try {
        await getHealth();
        if (mounted) {
          setHealthConnected(true);
          setLastUpdated(new Date().toISOString());
        }
      } catch {
        if (mounted) {
          setHealthConnected(false);
          setLastUpdated(new Date().toISOString());
        }
      }
    };

    ping();
    const timer = setInterval(ping, 30000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-bgPrimary text-textPrimary">
      <Sidebar
        collapsed={collapsed}
        healthConnected={healthConnected}
        onToggleTheme={toggleTheme}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          healthConnected={healthConnected}
          lastUpdated={lastUpdated}
          onToggleTheme={toggleTheme}
          theme={theme}
        />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet context={{ healthConnected, lastUpdated }} />
        </main>
      </div>
    </div>
  );
}
