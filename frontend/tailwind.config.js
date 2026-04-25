/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bgPrimary: 'var(--bg-primary)',
        bgSecondary: 'var(--bg-secondary)',
        bgCard: 'var(--bg-card)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        textMuted: 'var(--text-muted)',
        accentPrimary: 'var(--accent-primary)',
        accentSecondary: 'var(--accent-secondary)',
        accentDanger: 'var(--accent-danger)',
        accentWarning: 'var(--accent-warning)',
        accentGraph: 'var(--accent-graph)',
        borderColor: 'var(--border)'
      },
      boxShadow: {
        card: '0 12px 28px var(--shadow)'
      },
      borderRadius: {
        card: '12px'
      }
    }
  },
  plugins: []
};
