import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Ban, CircleSlash, CreditCard, Percent, Plus, RefreshCw, Search, Undo2, Wallet } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable } from './primitives';
import { formatDate, formatDateTime } from './format';
import { useCenterOptions } from './hooks';
import { planPill } from './plan';
import type { BillingAdjustment, CenterOption, SubscriptionRow } from './types';

const LIMIT = 20;

const VIEW_STATUS_KEY: Record<string, string> = {
  active: 'ACTIVE',
  trials: 'TRIALING',
  pending: 'PENDING',
  pastDue: 'PAST_DUE',
  expired: 'EXPIRED',
  cancelled: 'CANCELED',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'primary'> = {
  ACTIVE: 'success',
  TRIALING: 'primary',
  PENDING: 'warning',
  PAST_DUE: 'danger',
  CANCELED: 'muted',
  EXPIRED: 'muted',
};

type SubscriptionAction = 'cancel' | 'reactivate' | 'discount' | 'credit' | 'refund';

function ActionModal({
  action,
  subscription,
  busy,
  onConfirm,
  onClose,
}: {
  action: SubscriptionAction;
  subscription: SubscriptionRow;
  busy: boolean;
  onConfirm: (body: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [immediate, setImmediate] = useState(false);

  const titles: Record<SubscriptionAction, string> = {
    cancel: 'superAdmin.subscriptions.action.cancel',
    reactivate: 'superAdmin.subscriptions.action.reactivate',
    discount: 'superAdmin.subscriptions.action.discount',
    credit: 'superAdmin.subscriptions.action.credit',
    refund: 'superAdmin.subscriptions.action.refund',
  };

  const buildBody = (): Record<string, unknown> => {
    if (action === 'cancel') return { reason: reason.trim(), immediate };
    if (action === 'discount') return { kind, value: Number(value), reason: reason.trim() };
    if (action === 'refund') return { reason: reason.trim(), ...(value.trim() ? { amount: Number(value) } : {}) };
    if (action === 'credit') return { amount: Number(value), reason: reason.trim() };
    return { reason: reason.trim() };
  };

  const isValid = () => {
    if (reason.trim().length < 2) return false;
    if (action === 'discount' || action === 'credit' || action === 'refund') {
      if (action === 'refund' && !value.trim()) return true;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }
    return true;
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t(titles[action])}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 6 }}>{t(titles[action])}</h3>
        <p className="page-sub" style={{ marginBottom: 16, fontSize: 13 }}>
          {subscription.tenant?.name} — {money(Number(subscription.amount))}
        </p>

        {action === 'discount' && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '150px 1fr', marginBottom: 12 }}>
            <div>
              <label className="form-label" htmlFor="sa-sub-discount-kind">{t('superAdmin.subscriptions.discountKind')}</label>
              <select id="sa-sub-discount-kind" className="form-input" value={kind} onChange={(event) => setKind(event.target.value as 'PERCENT' | 'FIXED')}>
                <option value="PERCENT">{t('superAdmin.subscriptions.discountPercent')}</option>
                <option value="FIXED">{t('superAdmin.subscriptions.discountFixed')}</option>
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="sa-sub-discount-value">{t('superAdmin.subscriptions.discountValue')}</label>
              <input id="sa-sub-discount-value" className="form-input" type="number" min={0} step={kind === 'PERCENT' ? 1 : 0.01} value={value} onChange={(event) => setValue(event.target.value)} />
            </div>
          </div>
        )}

        {action === 'credit' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="sa-sub-credit-amount">{t('superAdmin.subscriptions.creditAmount')}</label>
            <input id="sa-sub-credit-amount" className="form-input" type="number" min={0} step={0.01} value={value} onChange={(event) => setValue(event.target.value)} />
          </div>
        )}

        {action === 'refund' && (
          <div style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="sa-sub-refund-amount">{t('superAdmin.subscriptions.refundAmount')}</label>
            <input id="sa-sub-refund-amount" className="form-input" type="number" min={0} step={0.01} placeholder={money(Number(subscription.amount))} value={value} onChange={(event) => setValue(event.target.value)} />
            <p className="page-sub" style={{ fontSize: 11, marginTop: 6 }}>{t('superAdmin.subscriptions.refundHint')}</p>
          </div>
        )}

        {action === 'cancel' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
            <input type="checkbox" checked={immediate} onChange={(event) => setImmediate(event.target.checked)} />
            {t('superAdmin.subscriptions.cancelImmediate')}
          </label>
        )}

        {action === 'discount' && (
          <p className="page-sub" style={{ fontSize: 12, marginBottom: 12 }}>{t('superAdmin.subscriptions.discountHint')}</p>
        )}
        {action === 'credit' && (
          <p className="page-sub" style={{ fontSize: 12, marginBottom: 12 }}>{t('superAdmin.subscriptions.creditHint')}</p>
        )}

        <label className="form-label" htmlFor="sa-sub-action-reason">{t('superAdmin.common.reasonLabel')}</label>
        <input id="sa-sub-action-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button
            className="btn btn--primary"
            disabled={busy || !isValid()}
            onClick={() => {
              if (!isValid()) {
                notify(t('superAdmin.subscriptions.actionFormInvalid'), 'error');
                return;
              }
              void onConfirm(buildBody());
            }}
          >
            {t(busy ? 'superAdmin.common.busy' : titles[action])}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewSubscriptionModal({ centers, onClose, onCreated }: { centers: CenterOption[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [centerId, setCenterId] = useState('');
  const [plan, setPlan] = useState('ESSENTIAL');
  const [paymentMethod, setPaymentMethod] = useState('INSTAPAY');
  const [paymentReference, setPaymentReference] = useState('');
  const [startImmediately, setStartImmediately] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!centerId) {
      notify(t('superAdmin.subscriptions.createFormInvalid'), 'error');
      return;
    }
    setBusy(true);
    try {
      await api<unknown>('/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: centerId,
          plan,
          paymentMethod,
          ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
          startImmediately,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      notify(t('superAdmin.subscriptions.created'), 'success');
      onCreated();
      onClose();
    } catch {
      notify(t('superAdmin.subscriptions.createError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.subscriptions.create')}>
      <div className="modal-box" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 16 }}>{t('superAdmin.subscriptions.create')}</h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-new-sub-center">{t('superAdmin.subscriptions.fieldCenter')}</label>
            <select id="sa-new-sub-center" className="form-input" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
              <option value="">{t('superAdmin.subscriptions.chooseCenter')}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>{center.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-sub-plan">{t('superAdmin.subscriptions.fieldPlan')}</label>
            <select id="sa-new-sub-plan" className="form-input" value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="ESSENTIAL">{t('superAdmin.usage.plan.ESSENTIAL')}</option>
              <option value="CONTROL">{t('superAdmin.usage.plan.CONTROL')}</option>
              <option value="FREE_TRIAL">{t('superAdmin.usage.plan.FREE_TRIAL')}</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-sub-method">{t('superAdmin.subscriptions.fieldMethod')}</label>
            <select id="sa-new-sub-method" className="form-input" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              <option value="CASH">{t('superAdmin.subscriptions.method.CASH')}</option>
              <option value="VODAFONE_CASH">{t('superAdmin.subscriptions.method.VODAFONE_CASH')}</option>
              <option value="INSTAPAY">{t('superAdmin.subscriptions.method.INSTAPAY')}</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-sub-reference">{t('superAdmin.subscriptions.fieldReference')}</label>
            <input id="sa-new-sub-reference" className="form-input" dir="ltr" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={200} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 12 }}>
          <input type="checkbox" checked={startImmediately} onChange={(event) => setStartImmediately(event.target.checked)} />
          {t('superAdmin.subscriptions.startImmediately')}
        </label>
        <div style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="sa-new-sub-reason">{t('superAdmin.subscriptions.fieldReason')}</label>
          <input id="sa-new-sub-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button className="btn btn--primary" style={{ gap: 6 }} onClick={() => void submit()} disabled={busy}>
            <Plus className="h-4 w-4" />
            {t(busy ? 'superAdmin.common.busy' : 'superAdmin.subscriptions.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionsSection() {
  const { t } = useTranslation();
  const centers = useCenterOptions();
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [views, setViews] = useState<string[]>(['active']);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState('all');
  const [plan, setPlan] = useState('all');
  const [centerId, setCenterId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: SubscriptionAction; subscription: SubscriptionRow } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [adjustments, setAdjustments] = useState<BillingAdjustment[]>([]);
  const [adjustmentTotals, setAdjustmentTotals] = useState<Record<string, number>>({});
  const [adjustmentType, setAdjustmentType] = useState('all');
  const [staleDays, setStaleDays] = useState(3);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), view });
      if (plan !== 'all') params.set('plan', plan);
      if (centerId) params.set('centerId', centerId);
      if (search.trim()) params.set('search', search.trim());
      const data = await api<{
        subscriptions: SubscriptionRow[];
        views: string[];
        statusCounts: Record<string, number>;
        stalePendingAfterDays: number;
        pagination: { total: number; pages: number };
      }>(`/admin/subscriptions?${params}`);
      setSubscriptions(data.subscriptions);
      setViews(data.views);
      setStatusCounts(data.statusCounts);
      setStaleDays(data.stalePendingAfterDays);
      setTotal(data.pagination.total);
      setPages(data.pagination.pages);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const loadAdjustments = async () => {
    try {
      const params = new URLSearchParams({ limit: '25' });
      if (adjustmentType !== 'all') params.set('type', adjustmentType);
      const data = await api<{ adjustments: BillingAdjustment[]; totals: Record<string, number> }>(`/admin/billing/adjustments?${params}`);
      setAdjustments(data.adjustments);
      setAdjustmentTotals(data.totals);
    } catch {
      setAdjustments([]);
    }
  };

  useEffect(() => {
    void load();
  }, [page, view, plan, centerId, search]);

  useEffect(() => {
    void loadAdjustments();
  }, [adjustmentType]);

  const verifyPayment = async (subscription: SubscriptionRow, action: 'verify' | 'reject') => {
    setBusyId(subscription.id);
    try {
      await api<unknown>(`/subscriptions/${subscription.id}/${action}`, { method: 'POST' });
      notify(t(`superAdmin.payments.${action}ed`, { name: subscription.tenant?.name ?? '' }), 'success');
      void load();
    } catch {
      notify(t(`superAdmin.payments.${action}Error`), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (body: Record<string, unknown>) => {
    if (!pendingAction) return;
    setActionBusy(true);
    try {
      await api<unknown>(`/admin/subscriptions/${pendingAction.subscription.id}/${pendingAction.action}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      notify(t(`superAdmin.subscriptions.actionDone.${pendingAction.action}`), 'success');
      setPendingAction(null);
      void load();
      void loadAdjustments();
    } catch {
      notify(t('superAdmin.subscriptions.actionError'), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  const viewOptions = [
    { value: 'all', label: t('superAdmin.subscriptions.view.all') },
    ...views.map((value) => {
      const statusKey = VIEW_STATUS_KEY[value];
      const count = statusKey ? statusCounts[statusKey] : undefined;
      return {
        value,
        label: `${t(`superAdmin.subscriptions.view.${value}`, value)}${count !== undefined ? ` (${count})` : ''}`,
      };
    }),
  ];

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.subscriptions.title"
        subtitleKey="superAdmin.subscriptions.subtitle"
        onRefresh={() => { void load(); void loadAdjustments(); }}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12, gap: 6 }} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('superAdmin.subscriptions.create')}
          </button>
        }
      />

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <input
          id="sa-sub-search"
          type="search"
          className="search-input"
          placeholder={t('superAdmin.subscriptions.searchPlaceholder')}
          value={search}
          onChange={(event) => { setPage(1); setSearch(event.target.value); }}
          aria-label={t('superAdmin.subscriptions.searchLabel')}
        />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <FilterSelect
          id="sa-sub-filter-view"
          labelKey="superAdmin.subscriptions.filterView"
          value={view}
          onChange={(value) => { setPage(1); setView(value); }}
          options={viewOptions}
        />
        <FilterSelect
          id="sa-sub-filter-center"
          labelKey="superAdmin.subscriptions.filterCenter"
          value={centerId}
          onChange={(value) => { setPage(1); setCenterId(value); }}
          options={[
            { value: '', label: t('superAdmin.users.allCenters') },
            ...centers.map((center) => ({ value: center.id, label: center.name })),
          ]}
        />
        <FilterSelect
          id="sa-sub-filter-plan"
          labelKey="superAdmin.subscriptions.filterPlan"
          value={plan}
          onChange={(value) => { setPage(1); setPlan(value); }}
          options={[
            { value: 'all', label: t('superAdmin.usage.allPlans') },
            { value: 'FREE_TRIAL', label: t('superAdmin.usage.plan.FREE_TRIAL') },
            { value: 'ESSENTIAL', label: t('superAdmin.usage.plan.ESSENTIAL') },
            { value: 'CONTROL', label: t('superAdmin.usage.plan.CONTROL') },
            { value: 'MULTI_BRANCH', label: t('superAdmin.usage.plan.MULTI_BRANCH') },
          ]}
        />
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.subscriptions.loadError" onRetry={() => void load()} />
      ) : subscriptions.length === 0 ? (
        <EmptyBlock labelKey="superAdmin.subscriptions.empty" />
      ) : (
        <>
          <SectionTable
            labelKey="superAdmin.subscriptions.table"
            headers={[
              'superAdmin.subscriptions.col.center',
              'superAdmin.subscriptions.col.plan',
              'superAdmin.subscriptions.col.amount',
              'superAdmin.subscriptions.col.status',
              'superAdmin.subscriptions.col.period',
              'superAdmin.common.actions',
            ]}
            colSpan={6}
            emptyKey="superAdmin.subscriptions.empty"
          >
            {subscriptions.map((subscription) => {
              const pill = planPill(subscription.plan);
              const busy = busyId === subscription.id;
              return (
                <tr key={subscription.id}>
                  <td>
                    <strong>{subscription.tenant?.name ?? '—'}</strong>
                    <br />
                    <span className="page-sub" style={{ fontSize: 12 }} dir="ltr">{subscription.paymentReference ?? subscription.tenant?.slug ?? ''}</span>
                  </td>
                  <td><Pill tone={pill.tone}>{pill.label}</Pill></td>
                  <td><strong>{money(Number(subscription.amount))}</strong></td>
                  <td>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <Pill tone={STATUS_TONE[subscription.status] ?? 'muted'}>
                        {t(`superAdmin.subscriptions.status.${subscription.status}`, subscription.status)}
                      </Pill>
                      {subscription.isStale && (
                        <span style={{ fontSize: 11, color: 'var(--color-warning, #d97706)' }}>
                          {t('superAdmin.subscriptions.stale', { days: staleDays })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(subscription.periodStart)} → {formatDate(subscription.periodEnd)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {subscription.status === 'PENDING' && (
                        <>
                          <button className="btn btn--primary" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => void verifyPayment(subscription, 'verify')} disabled={busy}>
                            <BadgeCheck className="h-3 w-3" />
                            {t('superAdmin.payments.verify')}
                          </button>
                          <button className="btn btn--danger" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => void verifyPayment(subscription, 'reject')} disabled={busy}>
                            <Ban className="h-3 w-3" />
                            {t('superAdmin.payments.reject')}
                          </button>
                        </>
                      )}
                      {subscription.status === 'CANCELED' && (
                        <button className="btn btn--primary" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => setPendingAction({ action: 'reactivate', subscription })} disabled={busy}>
                          <RefreshCw className="h-3 w-3" />
                          {t('superAdmin.subscriptions.action.reactivate')}
                        </button>
                      )}
                      {subscription.status !== 'CANCELED' && subscription.status !== 'PENDING' && (
                        <button className="btn btn--danger" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => setPendingAction({ action: 'cancel', subscription })} disabled={busy}>
                          <CircleSlash className="h-3 w-3" />
                          {t('superAdmin.subscriptions.action.cancel')}
                        </button>
                      )}
                      {subscription.status !== 'ACTIVE' && subscription.status !== 'CANCELED' && (
                        <button className="btn btn--ghost" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => setPendingAction({ action: 'discount', subscription })} disabled={busy}>
                          <Percent className="h-3 w-3" />
                          {t('superAdmin.subscriptions.action.discount')}
                        </button>
                      )}
                      <button className="btn btn--ghost" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => setPendingAction({ action: 'credit', subscription })} disabled={busy}>
                        <Wallet className="h-3 w-3" />
                        {t('superAdmin.subscriptions.action.credit')}
                      </button>
                      <button className="btn btn--ghost" style={{ fontSize: 12, padding: '4px 10px', gap: 4 }} onClick={() => setPendingAction({ action: 'refund', subscription })} disabled={busy}>
                        <Undo2 className="h-3 w-3" />
                        {t('superAdmin.subscriptions.action.refund')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </SectionTable>

          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </>
      )}

      <div style={{ marginTop: 32 }}>
        <SectionHeader titleKey="superAdmin.subscriptions.ledgerTitle" subtitleKey="superAdmin.subscriptions.ledgerSubtitle" onRefresh={() => void loadAdjustments()} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
          <FilterSelect
            id="sa-adjustment-filter-type"
            labelKey="superAdmin.subscriptions.filterAdjustment"
            value={adjustmentType}
            onChange={setAdjustmentType}
            options={[
              { value: 'all', label: t('superAdmin.subscriptions.allAdjustments') },
              { value: 'DISCOUNT', label: t('superAdmin.subscriptions.adjustment.DISCOUNT') },
              { value: 'CREDIT', label: t('superAdmin.subscriptions.adjustment.CREDIT') },
              { value: 'REFUND', label: t('superAdmin.subscriptions.adjustment.REFUND') },
            ]}
          />
        </div>

        {adjustments.length === 0 ? (
          <EmptyBlock labelKey="superAdmin.subscriptions.ledgerEmpty" />
        ) : (
          <SectionTable
            labelKey="superAdmin.subscriptions.ledgerTable"
            headers={[
              'superAdmin.subscriptions.col.center',
              'superAdmin.subscriptions.col.adjustment',
              'superAdmin.subscriptions.col.amount',
              'superAdmin.subscriptions.col.reason',
              'superAdmin.subscriptions.col.by',
              'superAdmin.common.time',
            ]}
            colSpan={6}
          >
            {adjustments.map((adjustment) => (
              <tr key={adjustment.id}>
                <td style={{ fontSize: 13 }}>{adjustment.tenant?.name ?? '—'}</td>
                <td>
                  <Pill tone={adjustment.type === 'REFUND' ? 'warning' : adjustment.type === 'DISCOUNT' ? 'accent' : 'primary'}>
                    {t(`superAdmin.subscriptions.adjustment.${adjustment.type}`, adjustment.type)}
                  </Pill>
                </td>
                <td><strong>{money(Number(adjustment.amount))}</strong></td>
                <td style={{ fontSize: 12 }}>{adjustment.reason ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{adjustment.createdBy?.fullName ?? '—'}</td>
                <td style={{ fontSize: 12 }}>{formatDateTime(adjustment.createdAt)}</td>
              </tr>
            ))}
          </SectionTable>
        )}

        <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 12 }}>
          <CreditCard className="h-3 w-3" aria-hidden="true" />
          {t('superAdmin.subscriptions.ledgerTotals', {
            discount: money(adjustmentTotals.DISCOUNT ?? 0),
            credit: money(adjustmentTotals.CREDIT ?? 0),
            refund: money(adjustmentTotals.REFUND ?? 0),
          })}
        </p>
      </div>

      {creating && (
        <NewSubscriptionModal
          centers={centers}
          onClose={() => setCreating(false)}
          onCreated={() => { void load(); void loadAdjustments(); }}
        />
      )}

      {pendingAction && (
        <ActionModal
          action={pendingAction.action}
          subscription={pendingAction.subscription}
          busy={actionBusy}
          onConfirm={runAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
