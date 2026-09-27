const AR = 'ar-EG';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(AR, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(AR, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatNumber(value: number): string {
  return value.toLocaleString(AR);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${value.toLocaleString(AR, { maximumFractionDigits: exponent === 0 ? 0 : 1 })} ${units[exponent]}`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toLocaleString(AR, { maximumFractionDigits: 2 })} s` : `${Math.round(ms).toLocaleString(AR)} ms`;
}

export function shortId(value: string | null | undefined): string {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

export function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
