import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { Metric, Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, formatLatency } from './format';
import type { FullHealthEvent, HealthChecksResponse } from './types';

export function HealthSection() {
  const { t } = useTranslation();
  const [checks, setChecks] = useState<HealthChecksResponse | null>(null);
  const [events, setEvents] = useState<FullHealthEvent[]>([]);
  const [unresolved, setUnresolved] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [checkData, eventData] = await Promise.all([
        api<HealthChecksResponse>('/admin/system-health/checks'),
        api<{ events: FullHealthEvent[]; pagination: { unresolved: number } }>('/admin/system-health/events?limit=100'),
      ]);
      setChecks(checkData);
      setEvents(eventData.events);
      setUnresolved(eventData.pagination.unresolved);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runAndRecord = async () => {
    try {
      const data = await api<{ recordedEvents: number }>('/admin/system-health/checks', { method: 'POST' });
      notify(
        data.recordedEvents > 0
          ? t('superAdmin.health.recorded', { count: data.recordedEvents })
          : t('superAdmin.health.allHealthy'),
        data.recordedEvents > 0 ? 'error' : 'success',
      );
      void load();
    } catch {
      notify(t('superAdmin.health.runError'), 'error');
    }
  };

  const resolve = async (event: FullHealthEvent) => {
    setBusyId(event.id);
    try {
      await api<unknown>(`/admin/system-health/events/${event.id}/resolve`, { method: 'POST' });
      notify(t('superAdmin.health.resolved'), 'success');
      void load();
    } catch {
      notify(t('superAdmin.health.resolveError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.health.title"
        subtitleKey="superAdmin.health.subtitle"
        onRefresh={() => void load()}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12 }} onClick={() => void runAndRecord()}>
            <RefreshCw className="h-4 w-4" />
            {t('superAdmin.health.runChecks')}
          </button>
        }
      />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed || !checks ? (
        <ErrorBlock labelKey="superAdmin.health.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <div className="metrics-grid" style={{ marginBottom: 24 }}>
            <Metric label={t('superAdmin.health.totalChecks')} value={String(checks.summary.total)} icon={RefreshCw} />
            <Metric label={t('superAdmin.health.okChecks')} value={String(checks.summary.ok)} icon={CheckCircle2} />
            <Metric label={t('superAdmin.health.failedChecks')} value={String(checks.summary.failed)} icon={XCircle} />
            <Metric label={t('superAdmin.health.unresolved')} value={String(unresolved)} icon={XCircle} />
          </div>

          <h3 className="page-title" style={{ fontSize: 15, marginBottom: 12 }}>{t('superAdmin.health.liveChecks')}</h3>
          <SectionTable
            labelKey="superAdmin.health.liveChecks"
            headers={[
              'superAdmin.health.col.check',
              'superAdmin.health.col.state',
              'superAdmin.health.col.latency',
              'superAdmin.health.col.detail',
            ]}
            colSpan={4}
          >
            {checks.checks.map((check) => (
              <tr key={check.key}>
                <td>{check.labelAr}</td>
                <td>
                  <Pill tone={check.ok ? 'success' : check.level === 'CRITICAL' ? 'danger' : 'warning'}>
                    {t(check.ok ? 'superAdmin.common.healthy' : `superAdmin.common.level.${check.level}`, check.ok ? 'OK' : check.level)}
                  </Pill>
                </td>
                <td style={{ fontSize: 12 }}>{formatLatency(check.latencyMs)}</td>
                <td style={{ fontSize: 13 }}>{check.detailAr}</td>
              </tr>
            ))}
          </SectionTable>

          <h3 className="page-title" style={{ fontSize: 15, margin: '24px 0 12px' }}>{t('superAdmin.health.eventLog')}</h3>
          <SectionTable
            labelKey="superAdmin.health.eventLog"
            headers={[
              'superAdmin.common.level',
              'superAdmin.common.category',
              'superAdmin.health.col.message',
              'superAdmin.common.time',
              'superAdmin.common.actions',
            ]}
            colSpan={5}
            emptyKey="superAdmin.overview.healthEmpty"
          >
            {events.length === 0 ? undefined : (
              events.map((event) => (
                <tr key={event.id} style={{ opacity: event.resolvedAt ? 0.55 : 1 }}>
                  <td>
                    <Pill tone={event.level === 'CRITICAL' ? 'danger' : event.level === 'WARNING' ? 'warning' : 'muted'}>
                      {t(`superAdmin.common.level.${event.level}`, event.level)}
                    </Pill>
                  </td>
                  <td style={{ fontSize: 12 }}>{event.category}</td>
                  <td style={{ fontSize: 13 }}>{event.message}</td>
                  <td style={{ fontSize: 12 }}>{formatDateTime(event.createdAt)}</td>
                  <td>
                    {event.resolvedAt ? (
                      <span className="page-sub" style={{ fontSize: 12 }}>
                        {t('superAdmin.health.resolvedAt', { date: formatDateTime(event.resolvedAt) })}
                      </span>
                    ) : (
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => void resolve(event)}
                        disabled={busyId === event.id}
                      >
                        {t('superAdmin.health.resolve')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </SectionTable>
        </>
      )}
    </div>
  );
}
