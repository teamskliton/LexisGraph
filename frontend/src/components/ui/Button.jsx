export default function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  ...props
}) {
  const variantClass = {
    primary: 'bg-accentPrimary text-white hover:opacity-90',
    secondary: 'bg-bgSecondary text-textPrimary border border-borderColor hover:bg-slate-100 dark:hover:bg-slate-700',
    danger: 'bg-accentDanger text-white hover:opacity-90',
    ghost: 'bg-transparent text-textSecondary hover:bg-bgSecondary border border-transparent'
  }[variant];

  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${variantClass} disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? 'Please wait...' : children}
    </button>
  );
}
