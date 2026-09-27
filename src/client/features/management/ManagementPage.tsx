import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Pencil, Phone, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api, money } from '../../lib/api';
import { Banner, PageHeader, Pill, notify } from '../../components/ui/kit';

type Room = { id: string; name: string; capacity: number; floor: string | null; isActive: boolean };
type Teacher = { id: string; fullName: string; phoneNumber: string; subject: string; defaultCenterFee: string; assistantName: string | null; assistantPhone: string | null; isActive: boolean };
type Mode = 'rooms' | 'teachers';

export function ManagementPage({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      if (mode === 'rooms') setRooms((await api<{ rooms: Room[] }>('/management/rooms')).rooms);
      else setTeachers((await api<{ teachers: Teacher[] }>('/management/teachers')).teachers);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('management.loadError')); }
  };
  useEffect(() => { void load(); setEditing(null); }, [mode]);

  const remove = async (path: string, id: string) => {
    if (!window.confirm(t('management.confirmDelete'))) return;
    try { await api(`${path}/${id}`, { method: 'DELETE' }); notify(t('management.delete')); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('management.deleteError')); }
  };

  const path = mode === 'rooms' ? '/management/rooms' : '/management/teachers';

  return (
    <section>
      <PageHeader
        kicker={t('navigation.groups.registries')}
        title={t(`management.${mode}.title`)}
        subtitle={t('management.sectionLabel')}
        actions={isAdmin && (
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />{t('management.add')}
          </button>
        )}
      />
      <Banner text={error} tone="error" />

      {editing && isAdmin && (
        <ManagementForm
          mode={mode}
          id={editing === 'new' ? null : editing}
          room={rooms.find((item) => item.id === editing)}
          teacher={teachers.find((item) => item.id === editing)}
          onDone={() => { setEditing(null); void load(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {mode === 'rooms' ? (
        rooms.length === 0 ? <div className="empty">{t('management.loadError')}</div> : (
          <div className="session-grid">
            {rooms.map((room) => (
              <article className="card" key={room.id} style={{ padding: 16 }}>
                <div className="session-top">
                  <span className="session-title">{room.name}</span>
                  <Pill tone={room.isActive ? 'success' : 'muted'}><span className="dot" />{room.isActive ? t('status.active') : t('status.inactive')}</Pill>
                </div>
                <div className="session-meta" style={{ marginTop: 10 }}>
                  <span><Building2 className="h-3.5 w-3.5" />{t('management.rooms.capacity')}: {room.capacity}</span>
                  <span>{room.floor || t('management.rooms.noFloor')}</span>
                </div>
                {isAdmin && (
                  <div className="session-foot" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(room.id)}><Pencil className="h-3.5 w-3.5" />{t('management.edit')}</button>
                    <button type="button" className="btn btn--danger-soft btn--sm" onClick={() => void remove(path, room.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )
      ) : (
        <div className="lobby-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
          {teachers.map((teacher) => (
            <article className="card" key={teacher.id} style={{ padding: 16 }}>
              <div className="session-top">
                <div className="flex-gap">
                  <span className="brand-logo" style={{ width: 36, height: 36, fontSize: 16 }}>{teacher.fullName?.charAt(0) || ''}</span>
                  <span className="session-title">{teacher.fullName}</span>
                </div>
                <Pill tone={teacher.isActive ? 'success' : 'muted'}><span className="dot" />{teacher.isActive ? t('status.active') : t('status.inactive')}</Pill>
              </div>
              <div className="session-meta" style={{ marginTop: 10 }}>
                <span><UserRound className="h-3.5 w-3.5" />{teacher.subject}</span>
                <span><Phone className="h-3.5 w-3.5" />{teacher.phoneNumber}</span>
                <span>{t('management.teachers.fee')}: <b className="mono">{money(Number(teacher.defaultCenterFee), 'ar-EG')}</b></span>
                {teacher.assistantName && <span className="muted">{t('management.teachers.assistant')}: {teacher.assistantName}{teacher.assistantPhone ? ` · ${teacher.assistantPhone}` : ''}</span>}
              </div>
              {isAdmin && (
                <div className="session-foot" style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(teacher.id)}><Pencil className="h-3.5 w-3.5" />{t('management.edit')}</button>
                  <button type="button" className="btn btn--danger-soft btn--sm" onClick={() => void remove(path, teacher.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ManagementForm({ mode, id, room, teacher, onDone, onCancel }: { mode: Mode; id: string | null; room?: Room; teacher?: Teacher; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string | number>>(() => mode === 'rooms'
    ? { name: room?.name || '', capacity: room?.capacity || 30, floor: room?.floor || '' } as Record<string, string | number>
    : { fullName: teacher?.fullName || '', phoneNumber: teacher?.phoneNumber || '', subject: teacher?.subject || '', defaultCenterFee: teacher?.defaultCenterFee || 0, assistantName: teacher?.assistantName || '', assistantPhone: teacher?.assistantPhone || '' } as Record<string, string | number>);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const change = (key: string, value: string) => setValues((current) => ({ ...current, [key]: key === 'capacity' || key === 'defaultCenterFee' ? Number(value) : value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api(`${mode === 'rooms' ? '/management/rooms' : '/management/teachers'}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      notify(t('management.save'));
      onDone();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('management.saveError')); }
    finally { setSaving(false); }
  }

  const fields = mode === 'rooms'
    ? [['name', t('management.rooms.name')], ['capacity', t('management.rooms.capacity')], ['floor', t('management.rooms.floor')]]
    : [['fullName', t('management.teachers.name')], ['phoneNumber', t('management.teachers.phone')], ['subject', t('management.teachers.subject')], ['defaultCenterFee', t('management.teachers.fee')], ['assistantName', t('management.teachers.assistant')], ['assistantPhone', t('management.teachers.assistantPhone')]];

  return (
    <form onSubmit={submit} className="card card-pad" style={{ marginBottom: 16, borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }}>
      <div className="flex-between" style={{ marginBottom: 14 }}>
        <h3 className="card-title" style={{ margin: 0 }}>{id ? t('management.edit') : t('management.add')}</h3>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label={t('actions.close')}><X className="h-4 w-4" /></button>
      </div>
      {error && <Banner text={error} tone="error" />}
      <div className="form-grid">
        {fields.map(([key, label]) => (
          <label className="field" key={key}>
            <span className="field-label">{label}</span>
            <input
              className="input"
              required={key !== 'floor' && key !== 'assistantName' && key !== 'assistantPhone'}
              type={key === 'capacity' || key === 'defaultCenterFee' ? 'number' : key.toLowerCase().includes('phone') ? 'tel' : 'text'}
              min={key === 'capacity' ? 1 : key === 'defaultCenterFee' ? 0 : undefined}
              step={key === 'defaultCenterFee' ? '0.01' : undefined}
              value={values[key]}
              onChange={(event) => change(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <button disabled={saving} className="btn btn--primary mt-4"><Save className="h-4 w-4" />{saving ? t('management.saving') : t('management.save')}</button>
    </form>
  );
}