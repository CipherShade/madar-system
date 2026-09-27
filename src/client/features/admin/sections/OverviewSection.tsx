import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Eye,
  FileWarning,
  LifeBuoy,
  Receipt,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { Metric, Pill } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, EmptyBlock } from './primitives';
import { formatDate, formatNumber } from './format';
import type { PlatformConsole } from './types';
import type { SectionId } from './registry';

export function OverviewSection({ onNavigate }: { onNavigate?: (section: SectionId) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<PlatformConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await api<PlatformConsole>('/admin/console-stats'));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const quickActions = [
    { id: 'centers' as SectionId, labelKey: 'superAdmin.overview.actionCenters', icon: Building2 },
    { id: 'users' as SectionId, labelKey: 'superAdmin.overview.actionUsers', icon: UserCog },
    { id: 'subscriptions' as SectionId, labelKey: 'superAdmin.overview.actionSubscriptions', icon: Receipt },
    { id: 'revenue' as SectionId, labelKey: 'superAdmin.overview.actionRevenue', icon: CreditCard },
    { id: 'usage' as SectionId, labelKey: 'superAdmin.overview.actionUsage', icon: Activity },
    { id: 'support' as SectionId, labelKey: 'superAdmin.overview.actionSupport', icon: LifeBuoy },
    { id: 'health' as SectionId, labelKey: 'superAdmin.overview.actionHealth', icon: FileWarning },
    { id: 'audit' as SectionId, labelKey: 'superAdmin.overview.actionAudit', icon: ClipboardList },
  ];

  return (
    <div>
      <SectionHeader titleKey="superAdmin.overview.title" subtitleKey="superAdmin.overview.subtitle" onRefresh={() => void load()} />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed || !data ? (
        <ErrorBlock labelKey="superAdmin.overview.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <div className="metrics-grid" style={{ marginBottom: 20 }}>
            <Metric label={t('superAdmin.overview.mrr')} value={money(data.mrrEgp)} icon={TrendingUp} hint={t('superAdmin.overview.mrrHint')} />
            <Metric label={t('superAdmin.overview.revenueThisMonth')} value={money(data.revenueThisMonth)} icon={Wallet} />
            <Metric label={t('superAdmin.overview.monthlyVisits')} value={formatNumber(data.monthlyVisits)} icon={Activity} />
            <Metric label={t('superAdmin.overview.activeCenters')} value={formatNumber(data.tenants.active)} icon={CheckCircle2} hint={`${t('superAdmin.overview.ofTotal', { total: formatNumber(data.tenants.total) })}`} />
            <Metric label={t('superAdmin.overview.trialCenters')} value={formatNumber(data.tenants.trial)} icon={Clock} />
            <Metric label={t('superAdmin.overview.freeCenters')} value={formatNumber(data.tenants.free)} icon={Building2} />
            <Metric label={t('superAdmin.overview.suspendedCenters')} value={formatNumber(data.tenants.suspended)} icon={FileWarning} />
            <Metric label={t('superAdmin.overview.newThisMonth')} value={formatNumber(data.tenants.newThisMonth)} icon={CalendarClock} />
            <Metric label={t('superAdmin.overview.totalUsers')} value={formatNumber(data.users.total)} icon={Users} hint={t('superAdmin.overview.inactiveUsers', { count: data.users.inactive })} />
            <Metric label={t('superAdmin.overview.pastDue')} value={formatNumber(data.billing.pastDue)} icon={Receipt} />
            <Metric label={t('superAdmin.overview.stalePending')} value={formatNumber(data.billing.stalePending)} icon={CalendarClock} />
            <Metric label={t('superAdmin.overview.openNotes')} value={formatNumber(data.support.openNotes)} icon={LifeBuoy} />
            <Metric label={t('superAdmin.overview.pendingNotifications')} value={formatNumber(data.notifications.total)} icon={Wallet} />
            <Metric label={t('superAdmin.overview.usageOverrides')} value={formatNumber(data.usageOverrides.active)} icon={Activity} />
            <Metric label={t('superAdmin.overview.openViewAsSessions')} value={formatNumber(data.viewAs.openSessions)} icon={Eye} />
          </div>

          {onNavigate && (
            <div style={{ marginBottom: 24 }}>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.overview.quickActions')}</h3>
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      className="btn btn--ghost"
                      style={{ fontSize: 12, padding: '10px 12px', gap: 6, justifyContent: 'flex-start' }}
                      onClick={() => onNavigate(action.id)}
                      aria-label={t(action.labelKey)}
                    >
                      <Icon className="h-3 w-3" />
                      {t(action.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {data.approachingLimits.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.overview.approachingLimits')}</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.approachingLimits.map((center) => (
                  <div
                    key={center.tenantId}
                    className="table-wrapper"
                    style={{ padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
                  >
                    <strong style={{ fontSize: 13 }}>{center.centerName}</strong>
                    <Pill tone={center.level === 'over' ? 'danger' : 'warning'}>
                      {t(`superAdmin.usage.level.${center.level}`, center.level)}
                    </Pill>
                    <span className="page-sub" style={{ fontSize: 12 }}>
                      {center.metrics
                        .map((metric) => t(`superAdmin.usage.metric.${metric.metric}`, metric.metric))
                        .join(' · ')}
                    </span>
                    {onNavigate && (
                      <button
                        className="btn btn--ghost"
                        style={{ fontSize: 12, padding: '3px 10px', marginInlineStart: 'auto' }}
                        onClick={() => onNavigate('centers')}
                        aria-label={t('superAdmin.overview.inspectCenter', { name: center.centerName })}
                      >
                        {t('superAdmin.overview.inspect')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.support.recentNotes.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.overview.recentNotes')}</h3>
              <SectionTable
                labelKey="superAdmin.overview.recentNotes"
                headers={['superAdmin.support.col.center', 'superAdmin.common.status', 'superAdmin.common.time']}
                colSpan={3}
                emptyKey="superAdmin.overview.notesEmpty"
              >
                {data.support.recentNotes.map((note) => (
                  <tr key={note.id}>
                    <td style={{ fontSize: 13 }}>{note.tenant?.name ?? '—'}</td>
                    <td>
                      <Pill tone={note.status === 'RESOLVED' ? 'success' : note.status === 'OPEN' ? 'warning' : 'muted'}>
                        {t(`superAdmin.support.short.${note.status}`, note.status)}
                      </Pill>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(note.createdAt)}</td>
                  </tr>
                ))}
              </SectionTable>
            </div>
          )}

          {data.recentActivity.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.overview.recentActivity')}</h3>
              <SectionTable
                labelKey="superAdmin.overview.recentActivity"
                headers={['superAdmin.common.action', 'superAdmin.centers.col.center', 'superAdmin.common.time']}
                colSpan={3}
                emptyKey="superAdmin.overview.activityEmpty"
              >
                {data.recentActivity.map((entry) => (
                  <tr key={entry.id}>
                    <td><code style={{ fontSize: 12 }}>{entry.action}</code></td>
                    <td style={{ fontSize: 13 }}>{entry.tenant?.name ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))}
              </SectionTable>
            </div>
          )}

          <h3 className="page-title" style={{ fontSize: 15, marginBottom: 10 }}>{t('superAdmin.overview.health')}</h3>
          {data.recentHealthEvents.length === 0 ? (
            <EmptyBlock labelKey="superAdmin.overview.healthEmpty" />
          ) : (
            <SectionTable
              labelKey="superAdmin.overview.health"
              headers={['superAdmin.common.level', 'superAdmin.common.category', 'superAdmin.common.time']}
              colSpan={3}
              emptyKey="superAdmin.overview.healthEmpty"
            >
              {data.recentHealthEvents.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Pill tone={event.level === 'CRITICAL' ? 'danger' : event.level === 'WARNING' ? 'warning' : 'muted'}>
                      {t(`superAdmin.common.level.${event.level}`, event.level)}
                    </Pill>
                  </td>
                  <td style={{ fontSize: 13 }}>{event.category}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(event.createdAt)}</td>
                </tr>
              ))}
            </SectionTable>
          )}
        </>
      )}
    </div>
  );
}
