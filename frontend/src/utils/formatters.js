export const fmtDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

export const fmtPercent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;

export const truncate = (text, len = 90) => {
  if (!text) return '-';
  return text.length > len ? `${text.slice(0, len)}...` : text;
};

export const statusTone = (status) => {
  const v = String(status || '').toLowerCase();
  if (v === 'compliant' || v === 'pass') return 'success';
  if (v === 'gap' || v === 'error') return 'danger';
  return 'warning';
};

export const handleDownloadBlob = (blob, type, format) => {
  const url = window.URL.createObjectURL(new Blob([blob]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `lexisgraph-${type}-${Date.now()}.${format}`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
