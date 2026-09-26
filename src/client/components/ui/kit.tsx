import { useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Signal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ------------------------------ Toasts ------------------------------ */
export type ToastTone = 'success' | 'error';
type ToastItem = { id: number; message: string; tone: ToastTone };

const TOAST_EVENT = 'app:toast';

export function notify(message: string, tone: ToastTone = 'success') {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const { message, tone } = (event as CustomEvent).detail as { message: string; tone: ToastTone };
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, message, tone }]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          {toast.tone === 'success' ? <CheckCircle2 className="toast-icon h-4 w-4" /> : <AlertCircle className="toast-icon h-4 w-4" />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Shared pieces --------------------------- */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letter = (name || '؟').trim().charAt(0);
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{letter}</span>;
}

export function Pill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'primary' | 'accent' | 'danger' | 'muted' | 'success' | 'warning' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Metric({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="metric">
      <div className="metric-label">{Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="metric-hint">{hint}</div>}
      {Icon && <Icon className="metric-icon" strokeWidth={1.4} aria-hidden="true" />}
    </div>
  );
}

export function Progress({ now, max, className }: { now: number; max: number; className?: string }) {
  const ratio = max > 0 ? Math.min(1, now / max) : 0;
  return (
    <div className={`progress ${className ?? ''}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-track ${ratio >= 1 ? 'progress-track--full' : ''}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function PageHeader({ kicker, title, subtitle, actions }: { kicker: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <div className="page-kicker"><Signal className="h-3.5 w-3.5" aria-hidden="true" />{kicker}</div>
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex-gap">{actions}</div>}
    </div>
  );
}

export function EmptyState({ text, icon: Icon = Signal }: { text: string; icon?: LucideIcon }) {
  return <div className="empty"><Icon className="mx-auto mb-3 h-6 w-6 opacity-50" aria-hidden="true" />{text}</div>;
}

export type BannerTone = 'error' | 'success' | 'warning' | 'info';

export function Banner({ text, tone }: { text: string; tone: BannerTone }) {
  if (!text) return null;
  const isProblem = tone === 'error' || tone === 'warning';
  return (
    <div className={`banner banner--${tone}`} role={isProblem ? 'alert' : 'status'}>
      {tone === 'success' ? <CheckCircle2 className="h-4 w-4 flex-none" /> : <AlertCircle className="h-4 w-4 flex-none" />}
      <span>{text}</span>
    </div>
  );
}