import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getHealth } from '../../api/endpoints';
import Topbar from './Topbar';
import { useTheme } from '../../hooks/useTheme';

export default function AppLayout() {
  const [healthConnected, setHealthConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());
  const { theme } = useTheme();

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
    <div className="min-h-screen bg-bgPrimary text-textPrimary">
      <Topbar
        healthConnected={healthConnected}
        lastUpdated={lastUpdated}
        theme={theme}
      />
      <main className="mx-auto min-h-screen max-w-[1800px] px-4 pb-8 pt-24 sm:px-6 lg:pt-24">
        <Outlet context={{ healthConnected, lastUpdated }} />
      </main>
    </div>
  );
}
