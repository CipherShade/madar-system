import { KeyRound, Plus, Save, UserCog, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { apiUrl } from '../../lib/config';
import { EGYPTIAN_MOBILE, formatDate } from '../../lib/format';
import { EmptyState, ErrorState, LoadingState, PermissionState } from '../../components/ui/AsyncState';
import type { Role } from '../../../shared/constants/index';

type UserRow = { id: string; username: string; fullName: string; role: Role; phoneNumber: string | null; preferredLanguage: string; isActive: boolean; createdAt: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(`/api${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new Error(body?.error?.code || body?.error?.message || 'REQUEST_FAILED');
  }
  return (await response.json() as { data: T }).data;
}

export function UsersPage() {
  const { t } = useTranslation();
  const { user: currentUser, hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const usersRes = await request<{ users: UserRow[] }>('/users');
      setUsers(usersRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
  }, [isAdmin]);

  async function patch(id: string, body: object, successKey: string) {
    setError('');
    setSuccess('');
    try {
      await request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setSuccess(t(successKey));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.saveError'));
    }
  }

  async function deactivate(id: string) {
    if (typeof window === 'undefined' || !window.confirm(t('users.confirmDelete'))) return;
    setError('');
    setSuccess('');
    try {
      await request(`/users/${id}`, { method: 'DELETE' });
      setSuccess(t('users.deleteSuccess'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.saveError'));
    }
  }

  if (!isAdmin) return <PermissionState />;

  const receptionistCount = users.filter((item) => item.role === 'RECEPTIONIST').length;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{t('users.title')}</h2>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-300">
              {t('usage.receptionistsLabel')}: {receptionistCount}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">{t('users.sectionLabel')}</p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? t('actions.cancel') : t('users.add')}
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {success && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{success}</p>}
      {adding && (
        <AddUserForm
          onDone={() => {
            setAdding(false);
            setSuccess(t('users.saveSuccess'));
            void load();
          }}
          onError={(message) => setError(message)}
        />
      )}
      {loading ? (
        <LoadingState />
      ) : users.length === 0 ? (
        <EmptyState message={t('users.empty')} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 text-start">{t('users.fullName')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('users.username')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('users.role')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('users.phone')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('users.language')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('users.active')}</th>
                <th scope="col" className="px-4 py-3 text-start">{t('management.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => {
                const isSelf = item.id === currentUser?.id;
                return (
                  <UserRowView key={item.id} user={item} isSelf={isSelf} onRole={(role) => void patch(item.id, { role }, 'users.saveSuccess')} onActive={(active) => (active ? void patch(item.id, { isActive: true }, 'users.saveSuccess') : void deactivate(item.id))} onReset={(password) => void patch(item.id, { password }, 'users.saveSuccess')} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AddUserForm({ onDone, onError }: { onDone: () => void; onError: (message: string) => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ username: '', password: '', fullName: '', role: 'RECEPTIONIST', phoneNumber: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (values.password.length < 8) {
      setError(t('changePassword.minLength'));
      return;
    }
    if (values.phoneNumber && !EGYPTIAN_MOBILE.test(values.phoneNumber)) {
      setError(t('errors.INVALID_PHONE', { defaultValue: t('students.phoneError') }));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await request('/users', {
        method: 'POST',
        body: JSON.stringify({ ...values, phoneNumber: values.phoneNumber || null, preferredLanguage: 'ar' }),
      });
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('users.saveError');
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ key: string; label: string; type?: string }> = [
    { key: 'username', label: t('users.username') },
    { key: 'password', label: t('users.password'), type: 'password' },
    { key: 'fullName', label: t('users.fullName') },
    { key: 'phoneNumber', label: t('users.phone'), type: 'tel' },
  ];

  return (
    <form onSubmit={submit} className="rounded-xl border border-emerald-500/20 bg-slate-900 p-5">
      <h3 className="mb-4 flex items-center gap-2 font-bold text-white"><UserCog className="h-5 w-5 text-emerald-400" />{t('users.add')}</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map(({ key, label, type }) => (
          <label key={key} className="text-sm font-semibold text-slate-300">
            {label}
            <input
              required={key !== 'phoneNumber'}
              type={type || 'text'}
              value={values[key as keyof typeof values]}
              onChange={(event) => change(key, event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500"
            />
          </label>
        ))}
        <label className="text-sm font-semibold text-slate-300">
          {t('users.role')}
          <select value={values.role} onChange={(event) => change('role', event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white outline-none focus:border-emerald-500">
            <option value="ADMIN">{t('users.roles.admin')}</option>
            <option value="RECEPTIONIST">{t('users.roles.receptionist')}</option>
          </select>
        </label>
      </div>
      {error && <ErrorState message={error} />}
      <button disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold disabled:opacity-60">
        <Save className="h-4 w-4" />
        {saving ? t('ui.processing') : t('management.save')}
      </button>
    </form>
  );
}

function UserRowView({ user, isSelf, onRole, onActive, onReset }: { user: UserRow; isSelf: boolean; onRole: (role: Role) => void; onActive: (active: boolean) => void; onReset: (password: string) => void }) {
  const { t } = useTranslation();
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState('');

  const languageLabel = user.preferredLanguage === 'en' ? 'English' : 'عربي';

  return (
    <tr className="border-t border-slate-800 bg-slate-950 last:border-b-0">
      <td className="px-4 py-3">
        <p className="font-bold text-white">{user.fullName}</p>
        <p className="text-xs text-slate-500">{formatDate(user.createdAt, 'ar')}</p>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-slate-300">{user.username}</td>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className="text-xs font-bold text-slate-300">{t(`users.roles.${user.role}`)}</span>
        ) : (
          <select value={user.role} onChange={(event) => onRole(event.target.value as Role)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-emerald-500">
            <option value="ADMIN">{t('users.roles.admin')}</option>
            <option value="RECEPTIONIST">{t('users.roles.receptionist')}</option>
          </select>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-400" dir="ltr">{user.phoneNumber || '—'}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{languageLabel}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${user.isActive ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
          {user.isActive ? t('status.active') : t('status.inactive')}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setResetting((value) => !value)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/10" aria-label={t('users.resetPassword')}>
            <KeyRound className="h-3.5 w-3.5" />{t('users.resetPassword')}
          </button>
          <button type="button" disabled={isSelf} onClick={() => onActive(!user.isActive)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label={t(user.isActive ? 'users.deactivate' : 'users.activate')}>
            {user.isActive ? t('users.deactivate') : t('users.activate')}
          </button>
        </div>
        {resetting && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('users.password')}
              className="w-40 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-amber-500"
            />
            <button type="button" disabled={password.length < 8} onClick={() => { onReset(password); setPassword(''); setResetting(false); }} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold disabled:opacity-40">
              {t('actions.confirm')}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}