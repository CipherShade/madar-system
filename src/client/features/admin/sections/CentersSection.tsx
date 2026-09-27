import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronDown, ChevronUp, Eye, Plus, Search, ShieldCheck, ShieldOff, SlidersHorizontal, X } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable, TemporaryPasswordNotice } from './primitives';
import { formatDate, formatDateTime, formatNumber } from './format';
import { planPill } from './plan';
import type { CenterDetail, TenantRow } from './types';

const LIMIT = 20;

type CentersSectionProps = {
  onExtendTrial?: (tenant: TenantRow) => void;
  onViewAs?: (tenant: TenantRow) => void;
};

type Filters = {
  search: string;
  status: string;
  plan: string;
  paymentStatus: string;
  usageStatus: string;
  sort: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  status: 'all',
  plan: 'all',
  paymentStatus: 'all',
  usageStatus: 'all',
  sort: 'newest',
};

const USAGE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  none: 'muted',
  ok: 'success',
  warning: 'warning',
  strong: 'warning',
  over: 'danger',
};

function NewCenterModal({ onClose, onCreated }: { onClose: () => void; onCreated: (temporaryPassword: string | null) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [username, setUsername] = useState('');
  const [plan, setPlan] = useState('FREE_TRIAL');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2 || ownerName.trim().length < 2 || username.trim().length < 3 || !/^(010|011|012|015)[0-9]{8}$/.test(ownerPhone.trim())) {
      notify(t('superAdmin.centers.createFormInvalid'), 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await api<{ temporaryPassword: string | null }>('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          ownerName: ownerName.trim(),
          ownerPhone: ownerPhone.trim(),
          username: username.trim(),
          plan,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      notify(t('superAdmin.centers.created', { name: name.trim() }), 'success');
      onCreated(data.temporaryPassword);
      onClose();
    } catch {
      notify(t('superAdmin.centers.createError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.centers.create')}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 16 }}>{t('superAdmin.centers.create')}</h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-center-name">{t('superAdmin.centers.fieldName')}</label>
            <input id="sa-center-name" className="form-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-center-plan">{t('superAdmin.centers.fieldPlan')}</label>
            <select id="sa-center-plan" className="form-input" value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="FREE_TRIAL">{t('superAdmin.usage.plan.FREE_TRIAL')}</option>
              <option value="ESSENTIAL">{t('superAdmin.usage.plan.ESSENTIAL')}</option>
              <option value="CONTROL">{t('superAdmin.usage.plan.CONTROL')}</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-center-owner-name">{t('superAdmin.centers.fieldOwnerName')}</label>
            <input id="sa-center-owner-name" className="form-input" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-center-owner-phone">{t('superAdmin.centers.fieldOwnerPhone')}</label>
            <input id="sa-center-owner-phone" className="form-input" type="tel" dir="ltr" placeholder="01xxxxxxxxx" value={ownerPhone} onChange={(event) => setOwnerPhone(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-center-username">{t('superAdmin.centers.fieldUsername')}</label>
            <input id="sa-center-username" className="form-input" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={50} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-center-reason">{t('superAdmin.centers.fieldReason')}</label>
            <input id="sa-center-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
          </div>
        </div>
        <p className="page-sub" style={{ fontSize: 12, marginTop: 12 }}>{t('superAdmin.centers.createNotice')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button className="btn btn--primary" style={{ gap: 6 }} onClick={() => void submit()} disabled={busy}>
            <Plus className="h-4 w-4" />
            {t(busy ? 'superAdmin.common.busy' : 'superAdmin.centers.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

function LimitsModal({ tenant, onClose, onSaved }: { tenant: TenantRow; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [maxUsers, setMaxUsers] = useState(String(tenant.maxUsers));
  const [maxDesks, setMaxDesks] = useState(String(tenant.maxDesks));
  const [maxBranches, setMaxBranches] = useState(String(tenant.maxBranches));
  const [visitLimit, setVisitLimit] = useState(tenant.visitLimit === null ? '' : String(tenant.visitLimit));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const users = Number.parseInt(maxUsers, 10);
    const desks = Number.parseInt(maxDesks, 10);
    const branches = Number.parseInt(maxBranches, 10);
    const visits = visitLimit.trim() === '' ? null : Number.parseInt(visitLimit, 10);
    if (!Number.isFinite(users) || !Number.isFinite(desks) || !Number.isFinite(branches) || (visitLimit.trim() !== '' && !Number.isFinite(visits))) {
      notify(t('superAdmin.centers.limitsInvalid'), 'error');
      return;
    }
    if (reason.trim().length < 2) {
      notify(t('superAdmin.common.reasonRequired'), 'error');
      return;
    }
    setBusy(true);
    try {
      await api<unknown>(`/admin/tenants/${tenant.id}/limits`, {
        method: 'PATCH',
        body: JSON.stringify({ maxUsers: users, maxDesks: desks, maxBranches: branches, visitLimit: visits, reason: reason.trim() }),
      });
      notify(t('superAdmin.centers.limitsSaved', { name: tenant.name }), 'success');
      onSaved();
      onClose();
    } catch {
      notify(t('superAdmin.centers.limitsError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.centers.limitsTitle')}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 6 }}>{t('superAdmin.centers.limitsTitle')}</h3>
        <p className="page-sub" style={{ fontSize: 13, marginBottom: 16 }}>{tenant.name}</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-limit-users">{t('superAdmin.plans.limitUsers')}</label>
            <input id="sa-limit-users" className="form-input" type="number" min={1} value={maxUsers} onChange={(event) => setMaxUsers(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-limit-desks">{t('superAdmin.plans.limitDesks')}</label>
            <input id="sa-limit-desks" className="form-input" type="number" min={1} value={maxDesks} onChange={(event) => setMaxDesks(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-limit-branches">{t('superAdmin.plans.limitBranches')}</label>
            <input id="sa-limit-branches" className="form-input" type="number" min={1} value={maxBranches} onChange={(event) => setMaxBranches(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-limit-visits">{t('superAdmin.plans.limitVisits')}</label>
            <input id="sa-limit-visits" className="form-input" type="number" min={0} placeholder={t('superAdmin.usage.unlimited')} value={visitLimit} onChange={(event) => setVisitLimit(event.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="sa-limit-reason">{t('superAdmin.common.reasonLabel')}</label>
          <input id="sa-limit-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button className="btn btn--primary" onClick={() => void save()} disabled={busy}>
            {t(busy ? 'superAdmin.common.busy' : 'superAdmin.centers.limitsSave')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CenterDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<CenterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<CenterDetail>(`/admin/tenants/${id}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.centers.detailTitle')}>
      <div className="modal-box" style={{ maxWidth: 780, maxHeight: '88vh', overflowY: 'auto' }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <h3 className="page-title" style={{ fontSize: 17, flex: 1 }}>{t('superAdmin.centers.detailTitle')}</h3>
          <button className="btn btn--ghost" onClick={onClose} aria-label={t('actions.close')} style={{ padding: '4px 8px' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <LoadingBlock labelKey="superAdmin.common.loading" />
        ) : failed || !detail ? (
          <ErrorBlock labelKey="superAdmin.centers.detailLoadError" />
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            <div>
              <strong style={{ fontSize: 16 }}>{detail.tenant.name}</strong>
              <span className="page-sub" style={{ display: 'block', fontSize: 12, marginTop: 2 }} dir="ltr">{detail.tenant.slug}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                <Pill tone={planPill(detail.tenant.plan).tone}>{planPill(detail.tenant.plan).label}</Pill>
                <Pill tone={detail.tenant.isActive ? 'success' : 'danger'}>
                  {t(detail.tenant.isActive ? 'superAdmin.common.active' : 'superAdmin.common.suspended')}
                </Pill>
                <Pill tone="muted">{t(`superAdmin.subscriptions.status.${detail.subscriptions[0]?.status ?? 'none'}`, detail.subscriptions[0]?.status ?? '—')}</Pill>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 4, fontSize: 13 }}>
              <div>{t('superAdmin.centers.detail.owner')}: {detail.tenant.ownerName ?? '—'} {detail.tenant.ownerPhone ? <span dir="ltr">{detail.tenant.ownerPhone}</span> : null}</div>
              <div>{t('superAdmin.centers.detail.renewal')}: {formatDate(detail.tenant.renewalDate)} · {t('superAdmin.centers.detail.price')}: {money(detail.tenant.priceMonthly)}</div>
              <div>{t('superAdmin.centers.detail.counts')}: {t('superAdmin.centers.col.users')} {formatNumber(detail.tenant.userCount)} · {t('superAdmin.centers.col.students')} {formatNumber(detail.tenant.studentCount)} · {t('superAdmin.centers.detail.teachers')} {formatNumber(detail.tenant.teacherCount)} · {t('superAdmin.centers.detail.sessions')} {formatNumber(detail.tenant.sessionCount)} · {t('superAdmin.centers.detail.rooms')} {formatNumber(detail.tenant.roomCount)}</div>
              <div>{t('superAdmin.centers.detail.balances')}: {t('superAdmin.subscriptions.adjustment.DISCOUNT')} {money(Number(detail.tenant.discountBalance))} · {t('superAdmin.subscriptions.adjustment.CREDIT')} {money(Number(detail.tenant.creditBalance))}</div>
            </div>

            {detail.usage && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.usage')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.usage.metrics.map((metric) => (
                    <div key={metric.metric} style={{ display: 'flex', gap: 8 }}>
                      <span style={{ minWidth: 110, color: 'var(--color-muted, #64748b)' }}>{t(`superAdmin.usage.metric.${metric.metric}`)}</span>
                      <span>{formatNumber(metric.used)} / {metric.limit === null ? t('superAdmin.usage.unlimited') : formatNumber(metric.limit)}</span>
                      <Pill tone={USAGE_TONE[metric.level] ?? 'muted'}>{t(`superAdmin.usage.level.${metric.level}`, metric.level)}</Pill>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.users')}</h4>
              {detail.users.length === 0 ? (
                <span className="page-sub" style={{ fontSize: 12 }}>{t('superAdmin.users.empty')}</span>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {detail.users.map((user) => (
                    <div key={user.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, flexWrap: 'wrap' }}>
                      <strong>{user.fullName}</strong>
                      <span className="page-sub" dir="ltr">@{user.username}</span>
                      <Pill tone="accent">{t(`superAdmin.users.role.${user.role}`, user.role)}</Pill>
                      <Pill tone={user.isActive ? 'success' : 'danger'}>
                        {t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive')}
                      </Pill>
                      <span className="page-sub">{t('superAdmin.users.lastLogin')}: {formatDateTime(user.lastLoginAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detail.subscriptions.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.subscriptions')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.subscriptions.slice(0, 6).map((subscription) => (
                    <div key={subscription.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone="muted">{t(`superAdmin.subscriptions.status.${subscription.status}`, subscription.status)}</Pill>
                      <strong>{money(Number(subscription.amount))}</strong>
                      <span className="page-sub">{formatDate(subscription.periodStart)} → {formatDate(subscription.periodEnd)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.adjustments.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.adjustments')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.adjustments.slice(0, 6).map((adjustment) => (
                    <div key={adjustment.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone="accent">{t(`superAdmin.subscriptions.adjustment.${adjustment.type}`, adjustment.type)}</Pill>
                      <strong>{money(Number(adjustment.amount))}</strong>
                      <span className="page-sub">{adjustment.reason ?? '—'}</span>
                      <span className="page-sub">{formatDate(adjustment.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.overrides.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.overrides')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.overrides.map((override) => (
                    <div key={override.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code>{override.metric}</code>
                      <strong>+{formatNumber(override.extraAmount)}</strong>
                      <span className="page-sub">{override.expiresAt ? formatDate(override.expiresAt) : t('superAdmin.usage.noExpiry')}</span>
                      <span className="page-sub">{override.reason ?? '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.healthAlerts.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.alerts')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.healthAlerts.map((alert) => (
                    <div key={alert.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone={alert.level === 'CRITICAL' ? 'danger' : 'warning'}>{t(`superAdmin.common.level.${alert.level}`, alert.level)}</Pill>
                      <span>{alert.message}</span>
                      <span className="page-sub">{formatDate(alert.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.supportNotes.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.supportNotes')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.supportNotes.slice(0, 5).map((note) => (
                    <div key={note.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone="muted">{t(`superAdmin.support.short.${note.status}`, note.status)}</Pill>
                      <span>{note.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.recentAudit.length > 0 && (
              <div>
                <h4 className="page-title" style={{ fontSize: 14, marginBottom: 8 }}>{t('superAdmin.centers.detail.audit')}</h4>
                <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
                  {detail.recentAudit.slice(0, 8).map((entry) => (
                    <div key={entry.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <code>{entry.action}</code>
                      <span className="page-sub">{entry.actor?.fullName ?? '—'}</span>
                      <span className="page-sub">{formatDateTime(entry.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CentersSection({ onExtendTrial, onViewAs }: CentersSectionProps) {
  const { t } = useTranslation();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [plans, setPlans] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [limitsTarget, setLimitsTarget] = useState<TenantRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.plan !== 'all') params.set('plan', filters.plan);
      if (filters.paymentStatus !== 'all') params.set('paymentStatus', filters.paymentStatus);
      if (filters.usageStatus !== 'all') params.set('usageStatus', filters.usageStatus);
      if (filters.sort !== 'newest') params.set('sort', filters.sort);
      const data = await api<{ tenants: TenantRow[]; plans: string[]; pagination: { total: number; pages: number } }>(`/admin/tenants?${params}`);
      setTenants(data.tenants);
      setPlans(data.plans);
      setTotal(data.pagination.total);
      setPages(data.pagination.pages);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, filters]);

  const updateFilter = (patch: Partial<Filters>) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleSuspend = async (tenant: TenantRow) => {
    const nextActive = !tenant.isActive;
    setBusyId(tenant.id);
    try {
      await api<unknown>(`/admin/tenants/${tenant.id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      notify(t(nextActive ? 'superAdmin.centers.reactivated' : 'superAdmin.centers.suspended', { name: tenant.name }), 'success');
      void load();
    } catch {
      notify(t('superAdmin.centers.suspendError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.centers.title"
        subtitleKey="superAdmin.centers.subtitle"
        onRefresh={() => void load()}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12, gap: 6 }} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('superAdmin.centers.create')}
          </button>
        }
      />

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <input
          id="sa-center-search"
          type="search"
          className="search-input"
          placeholder={t('superAdmin.centers.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => updateFilter({ search: event.target.value })}
          aria-label={t('superAdmin.centers.searchLabel')}
        />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 16 }}>
        <FilterSelect
          id="sa-center-filter-status"
          labelKey="superAdmin.centers.filterStatus"
          value={filters.status}
          onChange={(value) => updateFilter({ status: value })}
          options={[
            { value: 'all', label: t('superAdmin.users.allStatuses') },
            { value: 'active', label: t('superAdmin.common.active') },
            { value: 'suspended', label: t('superAdmin.common.suspended') },
            { value: 'trial', label: t('superAdmin.centers.filterTrial') },
          ]}
        />
        <FilterSelect
          id="sa-center-filter-plan"
          labelKey="superAdmin.centers.filterPlan"
          value={filters.plan}
          onChange={(value) => updateFilter({ plan: value })}
          options={[
            { value: 'all', label: t('superAdmin.usage.allPlans') },
            ...plans.map((value) => ({ value, label: t(`superAdmin.usage.plan.${value}`, value) })),
          ]}
        />
        <FilterSelect
          id="sa-center-filter-payment"
          labelKey="superAdmin.centers.filterPayment"
          value={filters.paymentStatus}
          onChange={(value) => updateFilter({ paymentStatus: value })}
          options={[
            { value: 'all', label: t('superAdmin.centers.allPayments') },
            { value: 'paid', label: t('superAdmin.centers.paymentPaid') },
            { value: 'due', label: t('superAdmin.centers.paymentDue') },
            { value: 'none', label: t('superAdmin.centers.paymentNone') },
          ]}
        />
        <FilterSelect
          id="sa-center-filter-usage"
          labelKey="superAdmin.centers.filterUsage"
          value={filters.usageStatus}
          onChange={(value) => updateFilter({ usageStatus: value })}
          options={[
            { value: 'all', label: t('superAdmin.usage.allLevels') },
            { value: 'approaching', label: t('superAdmin.centers.usageApproaching') },
            { value: 'over', label: t('superAdmin.centers.usageOver') },
          ]}
        />
        <FilterSelect
          id="sa-center-filter-sort"
          labelKey="superAdmin.centers.filterSort"
          value={filters.sort}
          onChange={(value) => updateFilter({ sort: value })}
          options={[
            { value: 'newest', label: t('superAdmin.centers.sortNewest') },
            { value: 'oldest', label: t('superAdmin.centers.sortOldest') },
            { value: 'name', label: t('superAdmin.centers.sortName') },
            { value: 'plan', label: t('superAdmin.centers.sortPlan') },
          ]}
        />
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.centers.loadError" onRetry={() => void load()} />
      ) : tenants.length === 0 ? (
        <span className="page-sub">{t('superAdmin.centers.empty')}</span>
      ) : (
        <>
          <SectionTable
            labelKey="superAdmin.centers.table"
            headers={[
              'superAdmin.centers.col.center',
              'superAdmin.centers.col.plan',
              'superAdmin.centers.col.status',
              'superAdmin.centers.col.renewal',
              'superAdmin.centers.col.usage',
              'superAdmin.centers.col.size',
              'superAdmin.common.actions',
            ]}
            colSpan={7}
            emptyKey="superAdmin.centers.empty"
          >
            <>{tenants.map((tenant) => {
              const isExpanded = expandedId === tenant.id;
              const pill = planPill(tenant.plan);
              return (
                <Fragment key={tenant.id}>
                  <tr style={{ opacity: tenant.isActive ? 1 : 0.55 }}>
                    <td>
                      <button
                        className="btn btn--ghost"
                        style={{ padding: '2px 6px', gap: 4 }}
                        onClick={() => setExpandedId(isExpanded ? null : tenant.id)}
                        aria-label={t(isExpanded ? 'superAdmin.centers.hideDetails' : 'superAdmin.centers.showDetails')}
                        title={t(isExpanded ? 'superAdmin.centers.hideDetails' : 'superAdmin.centers.showDetails')}
                      >
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <strong>{tenant.name}</strong>
                      <br />
                      <span className="page-sub" style={{ fontSize: 12 }}>{tenant.slug}</span>
                      {tenant.owner && (
                        <>
                          <br />
                          <span className="page-sub" style={{ fontSize: 11 }}>{tenant.owner.name}</span>
                        </>
                      )}
                    </td>
                    <td>
                      <Pill tone={pill.tone}>{pill.label}</Pill>
                      <br />
                      <span className="page-sub" style={{ fontSize: 11 }}>{money(tenant.priceMonthly)}</span>
                      {tenant.isTrialActive && (
                        <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: 'var(--color-warning, #d97706)' }}>
                          {t('superAdmin.centers.trialDaysRemaining', { days: tenant.trialDaysRemaining })}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <Pill tone={tenant.isActive ? 'success' : 'danger'}>
                          {t(tenant.isActive ? 'superAdmin.common.active' : 'superAdmin.common.suspended')}
                        </Pill>
                        <Pill tone={tenant.paymentStatus === 'paid' ? 'success' : tenant.paymentStatus === 'due' ? 'warning' : 'muted'}>
                          {t(`superAdmin.centers.paymentState.${tenant.paymentStatus}`, tenant.paymentStatus)}
                        </Pill>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDate(tenant.renewalDate)}</td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <Pill tone={USAGE_TONE[tenant.usageLevel] ?? 'muted'}>
                          {t(`superAdmin.usage.level.${tenant.usageLevel}`, tenant.usageLevel)}
                        </Pill>
                        <span style={{ fontSize: 11 }}>
                          {t('superAdmin.centers.visitsUsage', {
                            visits: formatNumber(tenant.visitsThisPeriod),
                            percent: tenant.visitUsagePercent === null ? '—' : `${tenant.visitUsagePercent}%`,
                          })}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {t('superAdmin.centers.sizeLine', {
                        users: formatNumber(tenant.userCount),
                        students: formatNumber(tenant.studentCount),
                      })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                          onClick={() => setDetailId(tenant.id)}
                          aria-label={t('superAdmin.centers.viewDetails', { name: tenant.name })}
                        >
                          {t('superAdmin.centers.details')}
                        </button>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                          onClick={() => setLimitsTarget(tenant)}
                          aria-label={t('superAdmin.centers.limitsFor', { name: tenant.name })}
                        >
                          <SlidersHorizontal className="h-3 w-3" />
                          {t('superAdmin.centers.limits')}
                        </button>
                        {onExtendTrial && (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                            onClick={() => onExtendTrial(tenant)}
                            title={t('superAdmin.centers.extendTrial')}
                            aria-label={t('superAdmin.centers.extendTrialFor', { name: tenant.name })}
                          >
                            <CalendarPlus className="h-3 w-3" />
                            {t('superAdmin.centers.extend')}
                          </button>
                        )}
                        {onViewAs && (
                          <button
                            className="btn btn--ghost"
                            style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                            onClick={() => onViewAs(tenant)}
                            title={t('superAdmin.viewAs.action')}
                            aria-label={t('superAdmin.viewAs.actionFor', { name: tenant.name })}
                          >
                            <Eye className="h-3 w-3" />
                            {t('superAdmin.viewAs.action')}
                          </button>
                        )}
                        <button
                          className={`btn ${tenant.isActive ? 'btn--danger' : 'btn--primary'}`}
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => void handleSuspend(tenant)}
                          disabled={busyId === tenant.id}
                          title={t(tenant.isActive ? 'superAdmin.centers.suspendAction' : 'superAdmin.centers.reactivateAction')}
                        >
                          {tenant.isActive ? <><ShieldOff className="h-3 w-3" /> {t('superAdmin.centers.suspend')}</> : <><ShieldCheck className="h-3 w-3" /> {t('superAdmin.centers.reactivate')}</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="expanded-row">
                      <td colSpan={7} style={{ padding: '8px 24px 16px', background: 'var(--bg-surface-alt, rgba(0,0,0,0.04))' }}>
                        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
                          <span><strong>{t('superAdmin.centers.detail.sessions')}:</strong> {formatNumber(tenant.sessionCount)}</span>
                          <span><strong>{t('superAdmin.centers.detail.maxDesks')}:</strong> {formatNumber(tenant.maxDesks)}</span>
                          <span><strong>{t('superAdmin.centers.detail.maxBranches')}:</strong> {formatNumber(tenant.maxBranches)}</span>
                          <span><strong>{t('superAdmin.plans.limitUsers')}:</strong> {formatNumber(tenant.maxUsers)}</span>
                          {tenant.trialEndsAt && (
                            <span><strong>{t('superAdmin.centers.detail.trialEnds')}:</strong> {formatDate(tenant.trialEndsAt)}</span>
                          )}
                          <span><strong>Slug:</strong> <code>{tenant.slug}</code></span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}</>
          </SectionTable>

          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </>
      )}

      {creating && (
        <NewCenterModal
          onClose={() => setCreating(false)}
          onCreated={(password) => {
            if (password) setTempPassword(password);
            void load();
          }}
        />
      )}

      {limitsTarget && (
        <LimitsModal tenant={limitsTarget} onClose={() => setLimitsTarget(null)} onSaved={() => void load()} />
      )}

      {detailId && <CenterDetailModal id={detailId} onClose={() => setDetailId(null)} />}

      {tempPassword && (
        <div className="modal-backdrop" onClick={() => setTempPassword(null)} role="dialog" aria-modal="true" aria-label={t('superAdmin.users.passwordShownOnce')}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
            <h3 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>{t('superAdmin.users.passwordShownOnce')}</h3>
            <TemporaryPasswordNotice value={tempPassword} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn--primary" onClick={() => setTempPassword(null)}>{t('actions.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
