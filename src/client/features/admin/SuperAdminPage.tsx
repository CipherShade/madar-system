import { useState, useEffect, useCallback } from 'react';
import { Building2, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search, ShieldOff, ShieldCheck, CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { Metric, Pill, notify } from '../../components/ui/kit';
import { api, money } from '../../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type PlatformStats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  mrrEgp: number;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  isTrialActive: boolean;
  maxDesks: number;
  maxBranches: number;
  createdAt: string;
  userCount: number;
  studentCount: number;
  sessionCount: number;
  monthlyVisitLimit?: number;
  usedVisits?: number;
  usagePercentage?: number;
  remainingVisits?: number;
  warningLevel?: 'NONE' | 'WARNING_80' | 'WARNING_90' | 'LIMIT_100';
  receptionistLimit?: number;
  receptionistCount?: number;
  branchLimit?: number;
  branchCount?: number;
  billingPeriod?: {
    start: string;
    end: string;
  };
};

type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  amount: string | null;
  createdAt: string;
  actor?: { username: string; fullName: string; role: string; tenant?: { id: string; name: string } | null } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, { ar: string; tone: 'primary' | 'accent' | 'success' | 'muted' | 'warning' | 'danger' }> = {
  BASIC: { ar: 'Basic (أساسية)', tone: 'muted' },
  GROWTH: { ar: 'Growth (نمو)', tone: 'primary' },
  PRO: { ar: 'Pro (متقدمة)', tone: 'accent' },
  MULTI_BRANCH: { ar: 'Multi-Branch (فروع)', tone: 'success' },
  BUSINESS: { ar: 'Business (فروع)', tone: 'success' },
  FREE_TRIAL: { ar: 'تجريبي', tone: 'warning' },
};

function planLabel(plan: string) {
  return PLAN_LABELS[plan] ?? { ar: plan, tone: 'muted' as const };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(iso));
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ExtendTrialModal({
  tenant,
  onConfirm,
  onClose,
}: {
  tenant: TenantRow;
  onConfirm: (days: number) => Promise<void>;
  onClose: () => void;
}) {
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onConfirm(days);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="تمديد الفترة التجريبية">
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 12 }}>
          تمديد الفترة التجريبية
        </h3>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          {tenant.name}
          {tenant.isTrialActive && (
            <span style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
              متبقٍ: <strong>{tenant.trialDaysRemaining}</strong> يوم
            </span>
          )}
        </p>
        <label className="form-label" htmlFor="sa-extend-days">عدد الأيام الإضافية</label>
        <input
          id="sa-extend-days"
          type="number"
          className="form-input"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value))))}
          style={{ marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>إلغاء</button>
          <button className="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'جاري...' : `تمديد ${days} يوم`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SuperAdminPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [total, setTotal] = useState(0);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [usageFilter, setUsageFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tenants' | 'audit'>('tenants');
  const [extendTarget, setExtendTarget] = useState<TenantRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const LIMIT = 20;
  const pages = Math.ceil(total / LIMIT);

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const data = await api<PlatformStats>('/admin/stats');
      setStats(data);
    } catch {
      notify('فشل تحميل إحصائيات المنصة', 'error');
    }
  }, []);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (search) params.set('search', search);
      if (planFilter !== 'ALL') params.set('planFilter', planFilter);
      if (usageFilter !== 'ALL') params.set('usageFilter', usageFilter);
      const data = await api<{ tenants: TenantRow[]; pagination: { total: number } }>(`/admin/tenants?${params}`);
      setTenants(data.tenants);
      setTotal(data.pagination.total);
    } catch {
      notify('فشل تحميل قائمة المراكز', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, planFilter, usageFilter]);

  const fetchAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const data = await api<{ logs: AuditLogEntry[] }>('/admin/audit-logs?limit=100');
      setAuditLogs(data.logs);
    } catch {
      notify('فشل تحميل سجل التدقيق', 'error');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

  useEffect(() => {
    if (activeTab === 'audit' && auditLogs.length === 0) void fetchAuditLogs();
  }, [activeTab, auditLogs.length, fetchAuditLogs]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleSuspend = async (tenant: TenantRow) => {
    const newState = !tenant.isActive;
    try {
      await api<unknown>(`/admin/tenants/${tenant.id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: newState }),
      });
      notify(newState ? `تم تفعيل "${tenant.name}"` : `تم تعليق "${tenant.name}"`, 'success');
      void fetchTenants();
      void fetchStats();
    } catch {
      notify('فشل تحديث حالة المركز', 'error');
    }
  };

  const handleExtendTrial = async (tenant: TenantRow, days: number) => {
    try {
      await api<unknown>(`/admin/tenants/${tenant.id}/extend-trial`, {
        method: 'PATCH',
        body: JSON.stringify({ days }),
      });
      notify(`تم تمديد الفترة التجريبية لـ "${tenant.name}" بمقدار ${days} أيام`, 'success');
      void fetchTenants();
    } catch {
      notify('فشل تمديد الفترة التجريبية', 'error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-container" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">لوحة إدارة المنصة</h1>
          <p className="page-sub">مراقبة وإدارة جميع المراكز التعليمية المسجلة وتتبع خطط الاشتراك والاستهلاك</p>
        </div>
        <button
          className="btn btn--ghost"
          onClick={() => { void fetchStats(); void fetchTenants(); }}
          aria-label="تحديث البيانات"
          title="تحديث"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="metrics-grid" style={{ marginBottom: 28 }}>
          <Metric
            label="إجمالي المراكز"
            value={stats.totalTenants.toLocaleString('ar-EG')}
            icon={Building2}
          />
          <Metric
            label="مراكز نشطة"
            value={stats.activeTenants.toLocaleString('ar-EG')}
            icon={CheckCircle2}
          />
          <Metric
            label="في فترة تجريبية"
            value={stats.trialTenants.toLocaleString('ar-EG')}
            icon={Clock}
          />
          <Metric
            label="موقوفة"
            value={stats.suspendedTenants.toLocaleString('ar-EG')}
            icon={AlertTriangle}
          />
          <Metric
            label="الإيرادات الشهرية (MRR)"
            value={money(stats.mrrEgp)}
            icon={TrendingUp}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20 }}>
        <button
          className={`tab-btn${activeTab === 'tenants' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('tenants')}
          id="tab-tenants"
          aria-selected={activeTab === 'tenants'}
        >
          <Building2 className="h-4 w-4" />
          المراكز ({total})
        </button>
        <button
          className={`tab-btn${activeTab === 'audit' ? ' tab-btn--active' : ''}`}
          onClick={() => setActiveTab('audit')}
          id="tab-audit"
          aria-selected={activeTab === 'audit'}
        >
          <Users className="h-4 w-4" />
          سجل التدقيق
        </button>
      </div>

      {/* ── Tenants Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'tenants' && (
        <>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
            <div className="search-bar" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
              <Search className="search-icon h-4 w-4" aria-hidden="true" />
              <input
                id="sa-search"
                type="search"
                className="search-input"
                placeholder="ابحث باسم المركز أو الـ slug..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                aria-label="بحث عن مركز"
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={planFilter}
                onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 'auto', padding: '8px 12px', fontSize: 13 }}
                aria-label="تصفية حسب الباقة"
              >
                <option value="ALL">جميع الباقات</option>
                <option value="BASIC">باقة Basic</option>
                <option value="GROWTH">باقة Growth</option>
                <option value="PRO">باقة Pro</option>
                <option value="MULTI_BRANCH">باقة Multi-Branch</option>
              </select>

              <select
                value={usageFilter}
                onChange={(e) => { setUsageFilter(e.target.value); setPage(1); }}
                className="form-input"
                style={{ width: 'auto', padding: '8px 12px', fontSize: 13 }}
                aria-label="تصفية حسب الاستهلاك"
              >
                <option value="ALL">كل مستويات الاستهلاك</option>
                <option value="80_PLUS">استهلاك 80% فأكثر ⚠️</option>
                <option value="90_PLUS">استهلاك 90% فأكثر 🚨</option>
                <option value="100_REACHED">وصل للحد (100%) ⛔</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="table-wrapper" role="region" aria-label="قائمة المراكز">
            <table className="data-table" aria-label="المراكز التعليمية">
              <thead>
                <tr>
                  <th scope="col">المركز</th>
                  <th scope="col">الخطة</th>
                  <th scope="col">استهلاك الزيارات الشهري</th>
                  <th scope="col">الاستقبال</th>
                  <th scope="col">الفروع</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>
                      <span className="page-sub">جاري التحميل...</span>
                    </td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32 }}>
                      <span className="page-sub">لا توجد مراكز مطابقة للشروط</span>
                    </td>
                  </tr>
                ) : (
                  tenants.map((tenant) => {
                    const isExpanded = expandedId === tenant.id;
                    const pl = planLabel(tenant.plan);
                    const usedVisits = tenant.usedVisits ?? 0;
                    const monthlyLimit = tenant.monthlyVisitLimit ?? 3000;
                    const pct = tenant.usagePercentage ?? Math.round((usedVisits / monthlyLimit) * 100);
                    const remaining = tenant.remainingVisits ?? Math.max(0, monthlyLimit - usedVisits);

                    let progressColor = '#10b981';
                    if (pct >= 100) progressColor = '#ef4444';
                    else if (pct >= 90) progressColor = '#f59e0b';
                    else if (pct >= 80) progressColor = '#eab308';

                    return (
                      <>
                        <tr key={tenant.id} style={{ opacity: tenant.isActive ? 1 : 0.55 }}>
                          <td>
                            <button
                              className="btn btn--ghost"
                              style={{ padding: '2px 6px', gap: 4 }}
                              onClick={() => setExpandedId(isExpanded ? null : tenant.id)}
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}
                            >
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>
                            <strong>{tenant.name}</strong>
                            <br />
                            <span className="page-sub" style={{ fontSize: 12 }}>{tenant.slug}</span>
                          </td>
                          <td>
                            <Pill tone={pl.tone}>{pl.ar}</Pill>
                            {tenant.isTrialActive && (
                              <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: 'var(--color-warning, #d97706)' }}>
                                {tenant.trialDaysRemaining} يوم متبقٍ
                              </span>
                            )}
                          </td>
                          <td style={{ minWidth: 180 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                              <span><strong>{usedVisits.toLocaleString('ar-EG')}</strong> / {monthlyLimit.toLocaleString('ar-EG')}</span>
                              <span style={{ fontWeight: 800, color: progressColor }}>{pct}%</span>
                            </div>
                            <div style={{ height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: progressColor, borderRadius: 99 }} />
                            </div>
                            {pct >= 80 && (
                              <span style={{ display: 'inline-block', fontSize: 10, marginTop: 4, fontWeight: 700, color: progressColor }}>
                                {pct >= 100 ? '⛔ وصل للحد الأقصى' : pct >= 90 ? '🚨 اقترب جداً من الحد' : '⚠️ استهلاك مرتفع'}
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>
                              {tenant.receptionistCount ?? tenant.userCount} / {tenant.receptionistLimit === 999999 ? 'غير محدود' : tenant.receptionistLimit ?? 1}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>
                              {tenant.branchCount ?? 1} / {tenant.branchLimit === 999999 ? 'متعدد' : tenant.branchLimit ?? 1}
                            </span>
                          </td>
                          <td>
                            <Pill tone={tenant.isActive ? 'success' : 'danger'}>
                              {tenant.isActive ? 'نشط' : 'موقوف'}
                            </Pill>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                className="btn btn--ghost"
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                onClick={() => setExtendTarget(tenant)}
                                title="تمديد الفترة التجريبية"
                                aria-label={`تمديد تجربة ${tenant.name}`}
                              >
                                <CalendarPlus className="h-3 w-3" />
                                تمديد
                              </button>
                              <button
                                className={`btn ${tenant.isActive ? 'btn--danger' : 'btn--primary'}`}
                                style={{ fontSize: 12, padding: '4px 10px' }}
                                onClick={() => handleSuspend(tenant)}
                                title={tenant.isActive ? 'تعليق المركز' : 'إعادة تفعيل المركز'}
                                aria-label={tenant.isActive ? `تعليق ${tenant.name}` : `تفعيل ${tenant.name}`}
                              >
                                {tenant.isActive
                                  ? <><ShieldOff className="h-3 w-3" /> تعليق</>
                                  : <><ShieldCheck className="h-3 w-3" /> تفعيل</>
                                }
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${tenant.id}-detail`} className="expanded-row">
                            <td colSpan={7} style={{ padding: '12px 24px 18px', background: 'var(--bg-surface-alt, rgba(0,0,0,0.04))' }}>
                              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 13 }}>
                                <span><strong>الطلاب:</strong> {tenant.studentCount.toLocaleString('ar-EG')}</span>
                                <span><strong>الحصص:</strong> {tenant.sessionCount.toLocaleString('ar-EG')}</span>
                                <span><strong>الزيارات المتبقية:</strong> {remaining.toLocaleString('ar-EG')} زيارة</span>
                                <span><strong>تاريخ التسجيل:</strong> {formatDate(tenant.createdAt)}</span>
                                {tenant.billingPeriod && (
                                  <span><strong>دورة الفوترة:</strong> {formatDate(tenant.billingPeriod.start)} ← {formatDate(tenant.billingPeriod.end)}</span>
                                )}
                                {tenant.trialEndsAt && (
                                  <span><strong>نهاية التجربة:</strong> {formatDate(tenant.trialEndsAt)}</span>
                                )}
                                <span><strong>Slug:</strong> <code>{tenant.slug}</code></span>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="pagination" style={{ marginTop: 16 }}>
              <button
                className="btn btn--ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="الصفحة السابقة"
              >
                السابق
              </button>
              <span className="page-sub" style={{ padding: '0 12px' }}>
                {page} / {pages}
              </span>
              <button
                className="btn btn--ghost"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="الصفحة التالية"
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Audit Log Tab ────────────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="table-wrapper" role="region" aria-label="سجل التدقيق">
          {auditLoading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <span className="page-sub">جاري تحميل سجل التدقيق...</span>
            </div>
          ) : (
            <table className="data-table" aria-label="سجل التدقيق">
              <thead>
                <tr>
                  <th scope="col">الإجراء</th>
                  <th scope="col">المستخدم</th>
                  <th scope="col">المركز</th>
                  <th scope="col">الكيان</th>
                  <th scope="col">المبلغ</th>
                  <th scope="col">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>
                      <span className="page-sub">لا توجد إدخالات في سجل التدقيق</span>
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <code style={{ fontSize: 12 }}>{log.action}</code>
                      </td>
                      <td>
                        {log.actor ? (
                          <>
                            <span>{log.actor.fullName}</span>
                            <span className="page-sub" style={{ display: 'block', fontSize: 11 }}>
                              @{log.actor.username} · {log.actor.role}
                            </span>
                          </>
                        ) : (
                          <span className="page-sub">—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {log.actor?.tenant?.name ?? <span className="page-sub">—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {log.entityType}
                        {log.entityId && (
                          <span className="page-sub" style={{ display: 'block' }}>
                            {log.entityId.substring(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {log.amount ? money(Number(log.amount)) : <span className="page-sub">—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {new Intl.DateTimeFormat('ar-EG', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        }).format(new Date(log.createdAt))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Extend Trial Modal */}
      {extendTarget && (
        <ExtendTrialModal
          tenant={extendTarget}
          onConfirm={(days) => handleExtendTrial(extendTarget, days)}
          onClose={() => setExtendTarget(null)}
        />
      )}
    </div>
  );
}
