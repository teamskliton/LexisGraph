import { createContext, useEffect, useMemo, useState } from 'react';

export const ThemeContext = createContext(null);

const STORAGE_KEY = 'lexisgraph-theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const resolvedTheme = 'light';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('light');
    localStorage.setItem(STORAGE_KEY, 'light');
  }, [theme, resolvedTheme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
