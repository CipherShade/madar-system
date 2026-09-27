import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, Plus, Search, ShieldOff, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, FilterSelect, LoadingBlock, Pagination, SectionHeader, SectionTable, TemporaryPasswordNotice } from './primitives';
import { formatDate, formatDateTime, formatNumber } from './format';
import { planPill } from './plan';
import type { CenterOption, PlatformUser, PlatformUserDetail } from './types';

const LIMIT = 20;

type Filters = { search: string; role: string; status: string; centerId: string };

const EMPTY_FILTERS: Filters = { search: '', role: 'all', status: 'all', centerId: '' };

function ReasonModal({
  titleKey,
  hintKey,
  confirmKey,
  busy,
  onConfirm,
  onClose,
}: {
  titleKey: string;
  hintKey: string;
  confirmKey: string;
  busy: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t(titleKey)}>
      <div className="modal-box" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 8 }}>{t(titleKey)}</h3>
        <p className="page-sub" style={{ marginBottom: 16, fontSize: 13 }}>{t(hintKey)}</p>
        <label className="form-label" htmlFor="sa-user-reason">{t('superAdmin.common.reasonLabel')}</label>
        <input
          id="sa-user-reason"
          className="form-input"
          value={reason}
          onChange={(event) => { setReason(event.target.value); setError(null); }}
          maxLength={500}
        />
        {error && <p role="alert" style={{ color: 'var(--color-danger, #b91c1c)', fontSize: 13, marginTop: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button
            className="btn btn--danger"
            disabled={busy}
            onClick={() => {
              if (reason.trim().length < 2) { setError(t('superAdmin.common.reasonRequired')); return; }
              void onConfirm(reason.trim());
            }}
          >
            {t(busy ? 'superAdmin.common.busy' : confirmKey)}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({
  centers,
  roles,
  onClose,
  onCreated,
}: {
  centers: CenterOption[];
  roles: string[];
  onClose: () => void;
  onCreated: (result: { name: string; temporaryPassword: string | null }) => void;
}) {
  const { t } = useTranslation();
  const [centerId, setCenterId] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const data = await api<{ user: PlatformUser; temporaryPassword: string | null }>('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          centerId,
          username: username.trim(),
          fullName: fullName.trim(),
          role,
          ...(phoneNumber.trim() ? { phoneNumber: phoneNumber.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      });
      notify(t('superAdmin.users.created', { name: data.user.fullName }), 'success');
      onCreated({ name: data.user.username, temporaryPassword: data.temporaryPassword });
      onClose();
    } catch {
      notify(t('superAdmin.users.createError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.users.create')}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <h3 className="page-title" style={{ fontSize: 17, marginBottom: 16 }}>{t('superAdmin.users.create')}</h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor="sa-new-user-center">{t('superAdmin.users.fieldCenter')}</label>
            <select id="sa-new-user-center" className="form-input" value={centerId} onChange={(event) => setCenterId(event.target.value)}>
              <option value="">{t('superAdmin.users.chooseCenter')}</option>
              {centers.map((center) => (
                <option key={center.id} value={center.id}>{center.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-user-role">{t('superAdmin.users.fieldRole')}</label>
            <select id="sa-new-user-role" className="form-input" value={role} onChange={(event) => setRole(event.target.value)}>
              {roles.map((value) => (
                <option key={value} value={value}>{t(`superAdmin.users.role.${value}`, value)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-user-name">{t('superAdmin.users.fieldFullName')}</label>
            <input id="sa-new-user-name" className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-user-username">{t('superAdmin.users.fieldUsername')}</label>
            <input id="sa-new-user-username" className="form-input" dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={50} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-user-phone">{t('superAdmin.users.fieldPhone')}</label>
            <input id="sa-new-user-phone" className="form-input" type="tel" dir="ltr" placeholder="01xxxxxxxxx" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="sa-new-user-email">{t('superAdmin.users.fieldEmail')}</label>
            <input id="sa-new-user-email" className="form-input" type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={200} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="form-label" htmlFor="sa-new-user-reason">{t('superAdmin.users.fieldReason')}</label>
          <input id="sa-new-user-reason" className="form-input" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
        </div>
        <p className="page-sub" style={{ fontSize: 12, marginTop: 12 }}>{t('superAdmin.users.passwordAutoNotice')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>{t('actions.cancel')}</button>
          <button
            className="btn btn--primary"
            style={{ gap: 6 }}
            disabled={busy}
            onClick={() => {
              if (!centerId || username.trim().length < 3 || fullName.trim().length < 2) {
                notify(t('superAdmin.users.createFormInvalid'), 'error');
                return;
              }
              void submit();
            }}
          >
            <UserPlus className="h-4 w-4" />
            {t(busy ? 'superAdmin.common.busy' : 'superAdmin.users.create')}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<PlatformUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api<{ user: PlatformUserDetail }>(`/admin/users/${id}`)
      .then((data) => {
        if (!cancelled) setDetail(data.user);
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
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={t('superAdmin.users.detailTitle')}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <h3 className="page-title" style={{ fontSize: 17, flex: 1 }}>{t('superAdmin.users.detailTitle')}</h3>
          <button className="btn btn--ghost" onClick={onClose} aria-label={t('actions.close')} style={{ padding: '4px 8px' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <LoadingBlock labelKey="superAdmin.common.loading" />
        ) : failed || !detail ? (
          <ErrorBlock labelKey="superAdmin.users.loadError" />
        ) : (
          <>
            <div style={{ display: 'grid', gap: 6, fontSize: 13, marginBottom: 16 }}>
              <div>
                <strong>{detail.fullName}</strong>{' '}
                <Pill tone="accent">{t(`superAdmin.users.role.${detail.role}`, detail.role)}</Pill>{' '}
                <Pill tone={detail.isActive ? 'success' : 'danger'}>
                  {t(detail.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive')}
                </Pill>
              </div>
              <div className="page-sub" dir="ltr" style={{ fontSize: 12 }}>@{detail.username}</div>
              <div className="page-sub" style={{ fontSize: 12 }}>
                {t('superAdmin.users.centerLabel')}: {detail.tenant?.name ?? t('superAdmin.users.noCenter')}
                {' · '}
                {t('superAdmin.users.centerUsersActive', { count: detail.centerUsersActive })} / {detail.tenant?.maxUsers ?? '—'}
              </div>
              <div className="page-sub" style={{ fontSize: 12 }}>
                {t('superAdmin.users.lastLogin')}: {formatDateTime(detail.lastLoginAt)} · {t('superAdmin.users.createdAt')}: {formatDate(detail.createdAt)}
              </div>
              <div className="page-sub" style={{ fontSize: 12 }}>
                {t('superAdmin.users.activityCounts')}: {formatNumber(detail._count.auditLogs)} / {formatNumber(detail._count.shiftRegisters)} / {formatNumber(detail._count.attendances)}
              </div>
            </div>

            {detail.recentActivity.length === 0 ? (
              <EmptyBlock labelKey="superAdmin.users.noActivity" />
            ) : (
              <SectionTable
                labelKey="superAdmin.users.activityTable"
                headers={['superAdmin.users.col.action', 'superAdmin.users.col.entity', 'superAdmin.common.time']}
                colSpan={3}
              >
                {detail.recentActivity.map((entry) => (
                  <tr key={entry.id}>
                    <td style={{ fontSize: 12 }}><code>{entry.action}</code></td>
                    <td style={{ fontSize: 12 }}>{entry.entityType ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </SectionTable>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function UsersSection() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [centers, setCenters] = useState<CenterOption[]>([]);
  const [roles, setRoles] = useState<string[]>(['ADMIN', 'RECEPTIONIST']);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ user: PlatformUser; kind: 'reset' | 'revoke' } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ username: string; password: string; notice: string } | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.role !== 'all') params.set('role', filters.role);
      if (filters.status !== 'all') params.set('status', filters.status);
      if (filters.centerId) params.set('centerId', filters.centerId);
      const data = await api<{
        users: PlatformUser[];
        centers: CenterOption[];
        roles: string[];
        pagination: { total: number; pages: number };
      }>(`/admin/users?${params}`);
      setUsers(data.users);
      setCenters(data.centers);
      setRoles(data.roles);
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

  const toggleActive = async (user: PlatformUser) => {
    setBusyId(user.id);
    try {
      await api<unknown>(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      notify(t(user.isActive ? 'superAdmin.users.disabled' : 'superAdmin.users.enabled', { name: user.fullName }), 'success');
      void load();
    } catch {
      notify(t('superAdmin.users.updateError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runPendingAction = async (reason: string) => {
    if (!pendingAction) return;
    setActionBusy(true);
    try {
      if (pendingAction.kind === 'reset') {
        const data = await api<{ temporaryPassword: string; noticeAr: string; noticeEn: string }>(
          `/admin/users/${pendingAction.user.id}/reset-password`,
          { method: 'POST', body: JSON.stringify({ reason }) },
        );
        const notice = t('superAdmin.users.passwordHandOver');
        setTempPassword({ username: pendingAction.user.username, password: data.temporaryPassword, notice });
        notify(t('superAdmin.users.passwordReset'), 'success');
      } else {
        await api<unknown>(`/admin/users/${pendingAction.user.id}/revoke-sessions`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
        notify(t('superAdmin.users.sessionsRevoked', { name: pendingAction.user.fullName }), 'success');
      }
      setPendingAction(null);
      void load();
    } catch {
      notify(t('superAdmin.users.actionError'), 'error');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div>
      <SectionHeader
        titleKey="superAdmin.users.title"
        subtitleKey="superAdmin.users.subtitle"
        onRefresh={() => void load()}
        actions={
          <button className="btn btn--primary" style={{ fontSize: 12, gap: 6 }} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('superAdmin.users.create')}
          </button>
        }
      />

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Search className="search-icon h-4 w-4" aria-hidden="true" />
        <input
          id="sa-user-search"
          type="search"
          className="search-input"
          placeholder={t('superAdmin.users.searchPlaceholder')}
          value={filters.search}
          onChange={(event) => updateFilter({ search: event.target.value })}
          aria-label={t('superAdmin.users.searchLabel')}
        />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <FilterSelect
          id="sa-user-filter-center"
          labelKey="superAdmin.users.filterCenter"
          value={filters.centerId}
          onChange={(value) => updateFilter({ centerId: value })}
          options={[
            { value: '', label: t('superAdmin.users.allCenters') },
            ...centers.map((center) => ({ value: center.id, label: center.name })),
          ]}
        />
        <FilterSelect
          id="sa-user-filter-role"
          labelKey="superAdmin.users.filterRole"
          value={filters.role}
          onChange={(value) => updateFilter({ role: value })}
          options={[
            { value: 'all', label: t('superAdmin.users.allRoles') },
            { value: 'ADMIN', label: t('superAdmin.users.role.ADMIN') },
            { value: 'RECEPTIONIST', label: t('superAdmin.users.role.RECEPTIONIST') },
            { value: 'SUPER_ADMIN', label: t('superAdmin.users.role.SUPER_ADMIN') },
          ]}
        />
        <FilterSelect
          id="sa-user-filter-status"
          labelKey="superAdmin.users.filterStatus"
          value={filters.status}
          onChange={(value) => updateFilter({ status: value })}
          options={[
            { value: 'all', label: t('superAdmin.users.allStatuses') },
            { value: 'active', label: t('superAdmin.common.active') },
            { value: 'inactive', label: t('superAdmin.common.inactive') },
          ]}
        />
      </div>

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed ? (
        <ErrorBlock labelKey="superAdmin.users.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <SectionTable
            labelKey="superAdmin.users.table"
            headers={[
              'superAdmin.users.col.user',
              'superAdmin.users.col.center',
              'superAdmin.users.col.role',
              'superAdmin.users.col.status',
              'superAdmin.users.col.lastLogin',
              'superAdmin.common.actions',
            ]}
            colSpan={6}
            emptyKey="superAdmin.users.empty"
          >
            {users.length === 0 ? undefined : (
              users.map((user) => {
                const pill = user.centerPlan ? planPill(user.centerPlan) : null;
                const busy = busyId === user.id;
                return (
                  <tr key={user.id} style={{ opacity: user.isActive ? 1 : 0.6 }}>
                    <td>
                      <strong>{user.fullName}</strong>
                      <br />
                      <span className="page-sub" style={{ fontSize: 12 }} dir="ltr">@{user.username}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {user.centerName ?? t('superAdmin.users.noCenter')}
                      {pill && (
                        <>
                          <br />
                          <Pill tone={pill.tone}>{pill.label}</Pill>
                        </>
                      )}
                    </td>
                    <td><Pill tone="accent">{t(`superAdmin.users.role.${user.role}`, user.role)}</Pill></td>
                    <td>
                      <Pill tone={user.isActive ? 'success' : 'danger'}>
                        {t(user.isActive ? 'superAdmin.common.active' : 'superAdmin.common.inactive')}
                      </Pill>
                    </td>
                    <td style={{ fontSize: 12 }}>{formatDateTime(user.lastLoginAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => setDetailId(user.id)}
                          aria-label={t('superAdmin.users.viewFor', { name: user.fullName })}
                        >
                          {t('superAdmin.users.view')}
                        </button>
                        <button
                          className="btn btn--ghost"
                          style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                          onClick={() => setPendingAction({ user, kind: 'reset' })}
                          disabled={busy}
                          aria-label={t('superAdmin.users.resetFor', { name: user.fullName })}
                        >
                          <KeyRound className="h-3 w-3" />
                          {t('superAdmin.users.resetAccess')}
                        </button>
                        <button
                          className={`btn ${user.isActive ? 'btn--danger' : 'btn--primary'}`}
                          style={{ fontSize: 12, padding: '4px 10px', gap: 4 }}
                          onClick={() => void toggleActive(user)}
                          disabled={busy}
                        >
                          {user.isActive ? <><ShieldOff className="h-3 w-3" /> {t('superAdmin.users.disable')}</> : <><ShieldCheck className="h-3 w-3" /> {t('superAdmin.users.enable')}</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </SectionTable>

          <Pagination page={page} pages={pages} total={total} onChange={setPage} />
        </>
      )}

      {creating && (
        <CreateUserModal
          centers={centers}
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            if (result.temporaryPassword) {
              setTempPassword({
                username: result.name,
                password: result.temporaryPassword,
                notice: t('superAdmin.users.passwordHandOver'),
              });
            }
            void load();
          }}
        />
      )}

      {detailId && <UserDetailModal id={detailId} onClose={() => setDetailId(null)} />}

      {pendingAction && (
        <ReasonModal
          titleKey={pendingAction.kind === 'reset' ? 'superAdmin.users.resetTitle' : 'superAdmin.users.revokeTitle'}
          hintKey={pendingAction.kind === 'reset' ? 'superAdmin.users.resetHint' : 'superAdmin.users.revokeHint'}
          confirmKey={pendingAction.kind === 'reset' ? 'superAdmin.users.resetAccess' : 'superAdmin.users.revokeSessions'}
          busy={actionBusy}
          onConfirm={runPendingAction}
          onClose={() => setPendingAction(null)}
        />
      )}

      {tempPassword && (
        <div className="modal-backdrop" onClick={() => setTempPassword(null)} role="dialog" aria-modal="true" aria-label={t('superAdmin.users.passwordShownOnce')}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={(event) => event.stopPropagation()}>
            <h3 className="page-title" style={{ fontSize: 17, marginBottom: 12 }} dir="ltr">@{tempPassword.username}</h3>
            <TemporaryPasswordNotice value={tempPassword.password} />
            <p className="page-sub" style={{ fontSize: 12, marginTop: 12 }}>{tempPassword.notice}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button className="btn btn--primary" onClick={() => setTempPassword(null)}>{t('actions.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
