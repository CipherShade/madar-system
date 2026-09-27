import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Send, Archive } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime } from './format';
import type { PlatformNotification } from './types';

type Audience = 'ALL_CENTERS' | 'PLAN' | 'CENTER' | 'USER';

export function NotificationsSection() {
  const { t } = useTranslation();
  const [items, setItems] = useState<PlatformNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [titleAr, setTitleAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [audience, setAudience] = useState<Audience>('ALL_CENTERS');
  const [audienceIds, setAudienceIds] = useState('');
  const [publishNow, setPublishNow] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = await api<{ notifications: PlatformNotification[]; pagination: { total: number } }>('/admin/notifications');
      setItems(data.notifications);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const ids = audienceIds.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);

  const submit = async () => {
    if (audience !== 'ALL_CENTERS' && ids.length === 0) {
      notify(t('superAdmin.notifications.audienceRequired'), 'error');
      return;
    }
    setCreating(true);
    try {
      await api<unknown>('/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({
          titleAr: titleAr.trim(),
          bodyAr: bodyAr.trim(),
          audience,
          ...(ids.length > 0 ? { audienceIds: ids } : {}),
          publishNow,
        }),
      });
      notify(t('superAdmin.notifications.created'), 'success');
      setTitleAr('');
      setBodyAr('');
      setAudienceIds('');
      setPublishNow(false);
      void load();
    } catch {
      notify(t('superAdmin.notifications.createError'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const act = async (item: PlatformNotification, action: 'send' | 'archive') => {
    setBusyId(item.id);
    try {
      await api<unknown>(`/admin/notifications/${item.id}/${action}`, { method: 'POST' });
      notify(t(`superAdmin.notifications.${action}ed`), 'success');
      void load();
    } catch {
      notify(t(`superAdmin.notifications.${action}Error`), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader titleKey="superAdmin.notifications.title" subtitleKey="superAdmin.notifications.subtitle" onRefresh={() => void load()} />

      <div className="table-wrapper" style={{ marginBottom: 20, padding: 16 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>{t('superAdmin.notifications.compose')}</strong>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-notif-title">{t('superAdmin.notifications.fieldTitle')}</label>
            <input
              id="sa-notif-title"
              className="form-input"
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
              maxLength={200}
            />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-notif-audience">{t('superAdmin.notifications.fieldAudience')}</label>
            <select
              id="sa-notif-audience"
              className="form-input"
              value={audience}
              onChange={(event) => setAudience(event.target.value as Audience)}
            >
              {(['ALL_CENTERS', 'PLAN', 'CENTER', 'USER'] as Audience[]).map((option) => (
                <option key={option} value={option}>{t(`superAdmin.notifications.audience.${option}`)}</option>
              ))}
            </select>
          </div>
          {audience !== 'ALL_CENTERS' && (
            <div>
              <label className="form-label" htmlFor="sa-notif-ids">{t('superAdmin.notifications.fieldTargets')}</label>
              <input
                id="sa-notif-ids"
                className="form-input"
                value={audienceIds}
                onChange={(event) => setAudienceIds(event.target.value)}
                placeholder={t('superAdmin.notifications.targetsPlaceholder')}
              />
            </div>
          )}
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="sa-notif-body">{t('superAdmin.notifications.fieldBody')}</label>
          <textarea
            id="sa-notif-body"
            className="form-input"
            rows={3}
            value={bodyAr}
            onChange={(event) => setBodyAr(event.target.value)}
            maxLength={2000}
          />
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={publishNow} onChange={(event) => setPublishNow(event.target.checked)} />
            {t('superAdmin.notifications.publishNow')}
          </label>
          <button className="btn btn--primary" onClick={() => void submit()} disabled={creating || titleAr.trim().length < 2 || bodyAr.trim().length < 2}>
            <Plus className="h-4 w-4" />
            {t(creating ? 'superAdmin.common.busy' : 'superAdmin.notifications.create')}
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.notifications.loadError" onRetry={() => void load()} />
      ) : (
        <SectionTable
          labelKey="superAdmin.notifications.table"
          headers={[
            'superAdmin.notifications.col.title',
            'superAdmin.notifications.col.audience',
            'superAdmin.notifications.col.status',
            'superAdmin.notifications.col.sentAt',
            'superAdmin.common.actions',
          ]}
          colSpan={5}
          emptyKey="superAdmin.notifications.empty"
        >
          {items.length === 0 ? undefined : (
            items.map((item) => {
              const busy = busyId === item.id;
              return (
                <tr key={item.id}>
                  <td>
                    <strong>{item.titleAr}</strong>
                    <br />
                    <span className="page-sub" style={{ fontSize: 12 }}>{item.bodyAr}</span>
                  </td>
                  <td>
                    {t(`superAdmin.notifications.audience.${item.audience}`, item.audience)}
                    {item.audienceIds.length > 0 && (
                      <span className="page-sub" style={{ display: 'block', fontSize: 11 }}>
                        {t('superAdmin.notifications.targetCount', { count: item.audienceIds.length })}
                      </span>
                    )}
                  </td>
                  <td>
                    <Pill tone={item.status === 'ACTIVE' ? 'success' : item.status === 'DRAFT' ? 'warning' : 'muted'}>
                      {t(`superAdmin.notifications.status.${item.status}`, item.status)}
                    </Pill>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(item.sentAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item.status !== 'ACTIVE' && (
                        <button
                          className="btn btn--primary"
                          style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
                          onClick={() => void act(item, 'send')}
                          disabled={busy}
                        >
                          <Send className="h-3 w-3" />
                          {t('superAdmin.notifications.send')}
                        </button>
                      )}
                      {item.status !== 'ARCHIVED' && (
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 12, padding: '4px 12px', gap: 4 }}
                          onClick={() => void act(item, 'archive')}
                          disabled={busy}
                        >
                          <Archive className="h-3 w-3" />
                          {t('superAdmin.notifications.archive')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </SectionTable>
      )}
    </div>
  );
}
