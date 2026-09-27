import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquarePlus, Search } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, shortId } from './format';
import { planPill } from './plan';
import type { SupportNote, TenantRow } from './types';

type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
const STATUSES: Status[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const LIMIT = 50;

const TONES: Record<Status, 'danger' | 'warning' | 'success' | 'muted'> = {
  OPEN: 'danger',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'muted',
};

export function SupportSection() {
  const { t } = useTranslation();
  const [notes, setNotes] = useState<SupportNote[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [centers, setCenters] = useState<TenantRow[]>([]);
  const [centerId, setCenterId] = useState('');
  const [text, setText] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      const data = await api<{ notes: SupportNote[]; pagination: { openCount: number } }>(`/admin/support-notes?${params}`);
      setNotes(data.notes);
      setOpenCount(data.pagination.openCount);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;
    void api<{ tenants: TenantRow[]; pagination: { total: number } }>('/admin/tenants?page=1&limit=200')
      .then((data) => {
        if (!cancelled) setCenters(data.tenants);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const create = async () => {
    if (!centerId || text.trim().length < 2) {
      notify(t('superAdmin.support.formInvalid'), 'error');
      return;
    }
    setCreating(true);
    try {
      await api<unknown>('/admin/support-notes', {
        method: 'POST',
        body: JSON.stringify({ tenantId: centerId, text: text.trim() }),
      });
      notify(t('superAdmin.support.created'), 'success');
      setText('');
      setCenterId('');
      void load();
    } catch {
      notify(t('superAdmin.support.createError'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (note: SupportNote, next: Status) => {
    setBusyId(note.id);
    try {
      await api<unknown>(`/admin/support-notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      void load();
    } catch {
      notify(t('superAdmin.support.updateError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader titleKey="superAdmin.support.title" subtitleKey="superAdmin.support.subtitle" onRefresh={() => void load()} />

      <div className="table-wrapper" style={{ padding: 16, marginBottom: 20 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>
          {t('superAdmin.support.create')} — {t('superAdmin.support.openCount', { count: openCount })}
        </strong>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-note-center">{t('superAdmin.support.fieldCenter')}</label>
            <select id="sa-note-center" className="form-input" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
              <option value="">{t('superAdmin.support.chooseCenter')}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>{center.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-note-text">{t('superAdmin.support.fieldText')}</label>
            <input
              id="sa-note-text"
              className="form-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4000}
            />
          </div>
        </div>
        <button
          className="btn btn--primary"
          style={{ marginTop: 12, fontSize: 12 }}
          onClick={() => void create()}
          disabled={creating}
        >
          <MessageSquarePlus className="h-4 w-4" />
          {t(creating ? 'superAdmin.common.busy' : 'superAdmin.support.addNote')}
        </button>
      </div>

      <div className="search-bar" style={{ marginBottom: 16 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <select
          className="search-input"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as Status | '')}
          aria-label={t('superAdmin.support.filterLabel')}
        >
          <option value="">{t('superAdmin.support.allStatuses')}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>{t(`superAdmin.support.status.${status}`)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.support.loadError" onRetry={() => void load()} />
      ) : (
        <SectionTable
          labelKey="superAdmin.support.table"
          headers={[
            'superAdmin.support.col.center',
            'superAdmin.support.col.note',
            'superAdmin.support.col.status',
            'superAdmin.support.col.author',
            'superAdmin.support.col.updated',
          ]}
          colSpan={5}
          emptyKey="superAdmin.support.empty"
        >
          {notes.length === 0 ? undefined : (
            notes.map((note) => {
              const pill = planPill(note.tenant.plan);
              const busy = busyId === note.id;
              return (
                <tr key={note.id}>
                  <td>
                    <strong>{note.tenant.name}</strong>
                    <br />
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </td>
                  <td style={{ fontSize: 13 }}>{note.text}</td>
                  <td>
                    <Pill tone={TONES[note.status as Status] ?? 'muted'}>
                      {t(`superAdmin.support.status.${note.status}`, note.status)}
                    </Pill>
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {STATUSES.map((status) => (
                        <button
                          key={status}
                          className={`btn ${status === note.status ? 'btn--primary' : 'btn--ghost'}`}
                          style={{ fontSize: 11, padding: '2px 8px' }}
                          onClick={() => void setStatus(note, status)}
                          disabled={busy || status === note.status}
                          title={t('superAdmin.support.setStatus', { status: t(`superAdmin.support.status.${status}`) })}
                        >
                          {t(`superAdmin.support.short.${status}`)}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {note.author.fullName}
                    <span className="page-sub" style={{ display: 'block', fontSize: 11 }} dir="ltr">@{note.author.username}</span>
                    <span className="page-sub" style={{ display: 'block', fontSize: 11 }} dir="ltr">{shortId(note.id)}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(note.updatedAt)}</td>
                </tr>
              );
            })
          )}
        </SectionTable>
      )}
    </div>
  );
}
