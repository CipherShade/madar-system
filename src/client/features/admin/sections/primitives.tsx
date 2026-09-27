import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function Pagination({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total?: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (pages <= 1) return null;
  return (
    <div className="pagination" style={{ marginTop: 16 }}>
      <button className="btn btn--ghost" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.previous')}>
        {t('common.previous')}
      </button>
      <span className="page-sub" style={{ padding: '0 12px' }}>
        {t('common.pageOf', { page, pages })}
        {typeof total === 'number' && ` · ${total.toLocaleString('ar-EG')}`}
      </span>
      <button className="btn btn--ghost" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.next')}>
        {t('common.next')}
      </button>
    </div>
  );
}

export function FilterSelect({
  id,
  labelKey,
  value,
  options,
  onChange,
}: {
  id: string;
  labelKey: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="form-label" htmlFor={id}>{t(labelKey)}</label>
      <select id={id} className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

export function TemporaryPasswordNotice({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      style={{
        background: '#fffbeb',
        border: '1px solid #fde68a',
        borderRadius: 12,
        padding: '12px 16px',
        color: '#78350f',
        fontSize: 13,
        display: 'grid',
        gap: 6,
      }}
    >
      <strong>{t('superAdmin.users.passwordShownOnce')}</strong>
      <code dir="ltr" style={{ fontSize: 15, fontWeight: 700, userSelect: 'all' }}>{value}</code>
      <span style={{ fontSize: 12 }}>{t('superAdmin.users.passwordHandOver')}</span>
    </div>
  );
}

export function SectionHeader({
  titleKey,
  subtitleKey,
  onRefresh,
  actions,
}: {
  titleKey: string;
  subtitleKey?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="page-header" style={{ marginBottom: 20 }}>
      <div>
        <h2 className="page-title" style={{ fontSize: 20 }}>{t(titleKey)}</h2>
        {subtitleKey && <p className="page-sub">{t(subtitleKey)}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {actions}
        {onRefresh && (
          <button className="btn btn--ghost" onClick={onRefresh} aria-label={t('common.refresh')} title={t('common.refresh')}>
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function LoadingBlock({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <span className="page-sub">{t(labelKey)}</span>
    </div>
  );
}

export function EmptyBlock({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <span className="page-sub">{t(labelKey)}</span>
    </div>
  );
}

export function ErrorBlock({ labelKey, onRetry }: { labelKey: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      style={{
        background: 'var(--color-danger-bg, #fef2f2)',
        border: '1px solid var(--color-danger-border, #fecaca)',
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        color: 'var(--color-danger-text, #991b1b)',
        fontSize: 13,
      }}
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span style={{ flex: 1 }}>{t(labelKey)}</span>
      {onRetry && (
        <button className="btn btn--ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function NoticeBlock({ labelKey, tone = 'warning' }: { labelKey: string; tone?: 'warning' | 'info' }) {
  const { t } = useTranslation();
  const styles =
    tone === 'warning'
      ? { background: '#fffbeb', border: '1px solid #fde68a', color: '#78350f' }
      : { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' };
  return (
    <div
      style={{ ...styles, borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <span>{t(labelKey)}</span>
    </div>
  );
}

export function SectionTable({
  labelKey,
  headers,
  children,
  colSpan,
  emptyKey = 'common.empty',
}: {
  labelKey: string;
  headers: string[];
  children?: ReactNode;
  colSpan: number;
  emptyKey?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="table-wrapper" role="region" aria-label={t(labelKey)}>
      <table className="data-table" aria-label={t(labelKey)}>
        <thead>
          <tr>
            {headers.map((headerKey) => (
              <th scope="col" key={headerKey}>{t(headerKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children ?? (
            <tr>
              <td colSpan={colSpan} style={{ textAlign: 'center', padding: 24 }}>
                <span className="page-sub">{t(emptyKey)}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
