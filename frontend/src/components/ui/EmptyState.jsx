export default function EmptyState({ icon: Icon, title, description, action, actionLabel }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '60px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: 20,
          background: 'var(--accent-blue-glow)',
          border: '1px solid var(--border-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--glow-blue)',
          animation: 'breathe 3s ease-in-out infinite'
        }}
      >
        <Icon size={32} color="var(--accent-blue)" strokeWidth={1.5} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--text-primary)'
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', maxWidth: 320, lineHeight: 1.6 }}>
        {description}
      </div>
      {action ? (
        <button
          onClick={action}
          style={{
            marginTop: 8,
            padding: '10px 20px',
            borderRadius: 8,
            background: 'var(--accent-blue-glow)',
            border: '1px solid var(--border-accent)',
            color: 'var(--accent-blue)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)'
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
