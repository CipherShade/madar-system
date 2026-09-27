import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Pill } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, NoticeBlock } from './primitives';
import { formatDateTime, shortId } from './format';
import type { SuperAdminSessionRow, SuperAuditEntry } from './types';

function useSecurityData() {
  const [logs, setLogs] = useState<SuperAuditEntry[]>([]);
  const [sessions, setSessions] = useState<SuperAdminSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [history, active] = await Promise.all([
        api<{ logs: SuperAuditEntry[] }>('/admin/security/history?limit=100'),
        api<{ sessions: SuperAdminSessionRow[] }>('/admin/security/sessions'),
      ]);
      setLogs(history.logs);
      setSessions(active.sessions);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return { logs, sessions, loading, failed, load };
}

export function SecuritySection() {
  const { t } = useTranslation();
  const { logs, sessions, loading, failed, load } = useSecurityData();
  const [busyId, setBusyId] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await api<unknown>(`/admin/security/sessions/${id}/revoke`, { method: 'POST' });
      void load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader titleKey="superAdmin.security.title" subtitleKey="superAdmin.security.subtitle" onRefresh={() => void load()} />
      <NoticeBlock labelKey="superAdmin.security.notice" tone="info" />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.security.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.sessions.title')}</h3>
          <NoticeBlock labelKey="superAdmin.sessions.notice" tone="info" />
          <SectionTable
            labelKey="superAdmin.sessions.table"
            headers={[
              'superAdmin.sessions.col.center',
              'superAdmin.sessions.col.reason',
              'superAdmin.sessions.col.started',
              'superAdmin.sessions.col.state',
              'superAdmin.common.actions',
            ]}
            colSpan={5}
            emptyKey="superAdmin.sessions.empty"
          >
            {sessions.length === 0 ? undefined : (
              sessions.map((session) => {
                const active = !session.endedAt;
                return (
                  <tr key={session.id}>
                    <td style={{ fontSize: 13 }}>{session.impersonatingTenant?.name ?? <span className="page-sub">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{session.reason ?? <span className="page-sub">—</span>}</td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(session.startedAt)}</td>
                    <td>
                      <Pill tone={active ? 'warning' : 'muted'}>
                        {t(active ? 'superAdmin.sessions.active' : 'superAdmin.sessions.ended')}
                      </Pill>
                    </td>
                    <td>
                      {active && (
                        <button
                          className="btn btn--danger"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => void revoke(session.id)}
                          disabled={busyId === session.id}
                        >
                          {t('superAdmin.sessions.revoke')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </SectionTable>

          <h3 className="page-title" style={{ fontSize: 15, margin: '28px 0 10px' }}>{t('superAdmin.security.historyTitle')}</h3>
          <SectionTable
            labelKey="superAdmin.security.table"
            headers={[
              'superAdmin.audit.col.action',
              'superAdmin.audit.col.tenant',
              'superAdmin.audit.col.reason',
              'superAdmin.audit.col.entity',
              'superAdmin.common.time',
            ]}
            colSpan={5}
            emptyKey="superAdmin.security.empty"
          >
            {logs.length === 0 ? undefined : (
              logs.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                      <code style={{ fontSize: 12 }}>{entry.action}</code>
                    </div>
                  </td>
                  <td style={{ fontSize: 13 }}>{entry.tenant?.name ?? <span className="page-sub">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{entry.reason ?? <span className="page-sub">—</span>}</td>
                  <td style={{ fontSize: 12 }}>
                    {entry.entityType ?? '—'}
                    {entry.entityId && <span className="page-sub" style={{ display: 'block' }} dir="ltr">{shortId(entry.entityId)}</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(entry.createdAt)}</td>
                </tr>
              ))
            )}
          </SectionTable>
        </>
      )}
    </div>
  );
}
