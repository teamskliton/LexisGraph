export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}) {
  const variantClass = {
    primary: 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)] shadow-sm hover:bg-blue-700',
    secondary: 'bg-white text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)]',
    danger: 'bg-[var(--accent-gap)] text-white border border-transparent shadow-sm hover:bg-red-600',
    ghost: 'bg-transparent text-[var(--text-secondary)] border border-transparent hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
  }[variant];

  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}
