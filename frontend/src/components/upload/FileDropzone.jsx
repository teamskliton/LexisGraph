import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, X } from 'lucide-react';

export default function FileDropzone({ files, setFiles, accept = { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt'] } }) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      setFiles((prev) => [...prev, ...acceptedFiles].slice(0, 5));
    },
    [setFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 10 * 1024 * 1024,
    accept
  });

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  return (
    <div>
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
          isDragActive ? 'border-accentPrimary bg-blue-500/10 shadow-lg' : 'border-borderColor'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="mx-auto mb-2" />
        <p className="font-semibold">Drag and drop files here</p>
        <p className="text-sm text-textSecondary">PDF, DOCX, TXT up to 10MB</p>
      </div>
      <ul className="mt-3 space-y-2">
        {files.map((file) => (
          <li key={file.name} className="flex items-center justify-between rounded-lg border border-borderColor p-2 text-sm">
            <div>
              <p className="font-medium">{file.name}</p>
              <p className="text-xs text-textMuted">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={() => removeFile(file.name)} className="rounded p-1 hover:bg-red-500/10">
              <X size={14} className="text-red-500" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
