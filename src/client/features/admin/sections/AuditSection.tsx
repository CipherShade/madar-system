import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, shortId } from './format';
import type { SuperAuditEntry } from './types';

const LIMIT = 50;

export function AuditSection() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SuperAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (action.trim()) params.set('action', action.trim());
      const data = await api<{ logs: SuperAuditEntry[]; pagination: { total: number } }>(`/admin/super-audit?${params}`);
      setEntries(data.logs);
      setTotal(data.pagination.total);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, action]);

  return (
    <div>
      <SectionHeader titleKey="superAdmin.audit.title" subtitleKey="superAdmin.audit.subtitle" onRefresh={() => void load()} />

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <input
          id="sa-audit-action"
          type="search"
          className="search-input"
          placeholder={t('superAdmin.audit.filterPlaceholder')}
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          aria-label={t('superAdmin.audit.filterLabel')}
        />
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.audit.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <SectionTable
            labelKey="superAdmin.audit.table"
            headers={[
              'superAdmin.audit.col.action',
              'superAdmin.audit.col.actor',
              'superAdmin.audit.col.tenant',
              'superAdmin.audit.col.entity',
              'superAdmin.audit.col.reason',
              'superAdmin.common.time',
            ]}
            colSpan={6}
            emptyKey="superAdmin.audit.empty"
          >
            {entries.length === 0 ? undefined : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td><code style={{ fontSize: 12 }}>{entry.action}</code></td>
                  <td>
                    {entry.actor ? (
                      <>
                        <span>{entry.actor.fullName}</span>
                        <span className="page-sub" style={{ display: 'block', fontSize: 11 }}>@{entry.actor.username}</span>
                      </>
                    ) : (
                      <span className="page-sub">—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 13 }}>{entry.tenant?.name ?? <span className="page-sub">—</span>}</td>
                  <td style={{ fontSize: 12 }}>
                    {entry.entityType ?? '—'}
                    {entry.entityId && (
                      <span className="page-sub" style={{ display: 'block' }} dir="ltr">{shortId(entry.entityId)}</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>{entry.reason ?? <span className="page-sub">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(entry.createdAt)}</td>
                </tr>
              ))
            )}
          </SectionTable>

          {pages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('common.previous')}>
                {t('common.previous')}
              </button>
              <span className="page-sub" style={{ padding: '0 12px' }}>{t('common.pageOf', { page, pages })}</span>
              <button className="btn btn--ghost" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('common.next')}>
                {t('common.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
