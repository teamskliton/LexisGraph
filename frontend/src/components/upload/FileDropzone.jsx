import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FolderOpen, UploadCloud, X } from 'lucide-react';

export default function FileDropzone({
  files,
  setFiles,
  accept = {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
  },
}) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      setFiles((prev) => [...prev, ...acceptedFiles].slice(0, 5));
    },
    [setFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 10 * 1024 * 1024,
    accept,
  });

  const removeFile = (name) => setFiles((prev) => prev.filter((file) => file.name !== name));

  return (
    <div>
      <div
        {...getRootProps()}
        className="cursor-pointer text-center"
        style={{
          border: `1.5px dashed ${isDragActive ? 'var(--accent-blue)' : 'var(--border-default)'}`,
          borderRadius: 16,
          padding: '48px 32px',
          transition: 'all var(--transition-base)',
          background: isDragActive ? 'rgba(37, 99, 235, 0.06)' : 'var(--bg-card-hover)',
          boxShadow: isDragActive ? 'inset 0 0 40px rgba(37, 99, 235, 0.08)' : 'none',
          transform: isDragActive ? 'scale(1.01)' : 'scale(1)',
        }}
      >
        <input {...getInputProps()} />
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            margin: '0 auto 20px',
            background: isDragActive ? 'var(--accent-blue-glow)' : '#fff',
            border: `1px solid ${isDragActive ? 'var(--accent-blue)' : 'var(--border-default)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all var(--transition-base)',
          }}
        >
          <UploadCloud size={24} color={isDragActive ? 'var(--accent-blue)' : 'var(--text-muted)'} />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            color: isDragActive ? 'var(--accent-blue)' : 'var(--text-primary)',
            marginBottom: 8,
          }}
        >
          {isDragActive ? 'Release to upload' : 'Drop your legal documents here'}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>PDF, DOCX, TXT - Maximum 10MB</div>
        <div
          style={{
            marginTop: 20,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 999,
            background: 'var(--accent-blue-glow)',
            border: '1px solid var(--border-accent)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--accent-blue)',
          }}
        >
          <FolderOpen size={14} /> Browse files
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {files.map((file) => (
          <li
            key={file.name}
            className="flex items-center justify-between rounded-xl p-3 text-sm"
            style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-[var(--text-primary)]">{file.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={() => removeFile(file.name)}
              className="rounded-lg p-1 text-[var(--accent-gap)] transition hover:bg-red-50"
              aria-label={`Remove ${file.name}`}
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
