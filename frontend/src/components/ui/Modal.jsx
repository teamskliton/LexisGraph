export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button onClick={onClose} className="text-sm text-textSecondary">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
