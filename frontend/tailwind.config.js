/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bgPrimary: 'var(--bg-base)',
        bgSecondary: 'var(--bg-surface)',
        bgCard: 'var(--bg-card)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        textMuted: 'var(--text-muted)',
        accentPrimary: 'var(--accent-blue)',
        accentSecondary: 'var(--accent-teal)',
        accentDanger: 'var(--accent-gap)',
        accentWarning: 'var(--accent-warning)',
        accentGraph: 'var(--accent-graph-node)',
        borderColor: 'var(--border-default)'
      },
      boxShadow: {
        card: 'var(--shadow-card)'
      },
      borderRadius: {
        card: '12px'
      }
    }
  },
  plugins: []
};
