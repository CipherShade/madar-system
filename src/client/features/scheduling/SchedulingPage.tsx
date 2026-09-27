import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarPlus, Clock3, MapPin, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { Banner, EmptyState, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';

type Session = { id: string; title: string; academicStage: string; startTime: string; endTime: string; sessionPrice: number; centerFeePerStudent: number; currentLobbyCount: number; status: string; teacher: { fullName: string; subject: string }; room: { name: string; capacity: number } };
type Option = { id: string; name?: string; fullName?: string; subject?: string };

const GROUP_KEYS = ['now', 'upcoming', 'completed'] as const;
const STATUS_GROUPS: Record<string, (typeof GROUP_KEYS)[number]> = {
  active: 'now',
  scheduled: 'upcoming',
  completed: 'completed',
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function SchedulingPage({ onCheckIn }: { onCheckIn: (id: string) => void }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [teachers, setTeachers] = useState<Option[]>([]);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [sessionData, teacherData, roomData] = await Promise.all([
        api<{ sessions: Session[] }>('/scheduling/sessions'),
        api<{ teachers: Option[] }>('/management/teachers'),
        api<{ rooms: Option[] }>('/management/rooms'),
      ]);
      setSessions(sessionData.sessions);
      setTeachers(teacherData.teachers);
      setRooms(roomData.rooms);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduling.loadError')); }
  };
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const now = new Date().getTime();
    const bucket: Record<(typeof GROUP_KEYS)[number], Session[]> = { now: [], upcoming: [], completed: [] };
    for (const session of sessions) {
      const key = session.status === 'COMPLETED' || session.status === 'CANCELLED' ? 'completed' : (STATUS_GROUPS[session.status.toLowerCase()] ?? (new Date(session.startTime).getTime() <= now ? 'now' : 'upcoming'));
      bucket[key].push(session);
    }
    return bucket;
  }, [sessions]);

  const summary = [
    { key: 'all', value: sessions.length },
    { key: 'now', value: groups.now.length },
    { key: 'today', value: groups.upcoming.length },
    { key: 'done', value: groups.completed.length },
  ];

  return (
    <section>
      <PageHeader
        kicker={t('navigation.groups.operation')}
        title={t('scheduling.title')}
        subtitle={`${t('timeline.dateLabel')} — ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`}
        actions={isAdmin && (
          <button type="button" className="btn btn--primary" onClick={() => setShowForm((value) => !value)}>
            <CalendarPlus className="h-4 w-4" />{t('scheduling.add')}
          </button>
        )}
      />
      <Banner text={error} tone="error" />

      <div className="summary-strip">
        {summary.map((item) => (
          <div className="summary-cell" key={item.key}>
            <div className="num">{item.value}</div>
            <div className="lbl">{t(`timeline.summary.${item.key}`)}</div>
          </div>
        ))}
      </div>

      {showForm && isAdmin && <SessionForm teachers={teachers} rooms={rooms} onDone={() => { setShowForm(false); void load(); }} />}

      {sessions.length === 0 ? (
        <EmptyState text={t('timeline.empty')} />
      ) : (
        <div className="stack">
          {GROUP_KEYS.map((key) => {
            const items = groups[key];
            if (items.length === 0) return null;
            return (
              <div className={`tl-group tl-group--${key}`} key={key}>
                <div className="tl-group-title">
                  <span className="tl-dot" />
                  {t(`timeline.groups.${key}`)}
                  <span className="pill pill--muted">{items.length}</span>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {items.map((session) => {
                    const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                    const tone = key === 'now' ? (ratio >= 1 ? 'danger' : 'primary') : key === 'upcoming' ? 'accent' : 'muted';
                    return (
                      <div className={`tl-item tl-item--${key}`} key={session.id}>
                        <div className="tl-time">
                          <div>{time(session.startTime)}</div>
                          <div className="muted" style={{ fontSize: 10 }}>{session.room.capacity}</div>
                        </div>
                        <div className="tl-main">
                          <div className="tl-title">{session.title}</div>
                          <div className="tl-meta">
                            <span>{session.teacher.fullName} · {session.teacher.subject}</span>
                            <span><MapPin className="h-3 w-3" />{session.room.name}</span>
                            {key === 'now' && <span className="pill pill--muted">{t('timeline.attended')}: {session.currentLobbyCount}/{session.room.capacity}</span>}
                          </div>
                        </div>
                        {key === 'now' && (
                          <div style={{ width: 'min(120px, 100%)' }}>
                            <Progress now={session.currentLobbyCount} max={session.room.capacity} />
                          </div>
                        )}
                        <Pill tone={tone}>{t(`status.${session.status.toLowerCase()}`)}</Pill>
                        {key === 'now' && (
                          <button type="button" className="btn btn--soft btn--sm" onClick={() => onCheckIn(session.id)}>
                            {t('timeline.checkInFromList')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SessionForm({ teachers, rooms, onDone }: { teachers: Option[]; rooms: Option[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ teacherId: teachers[0]?.id || '', roomId: rooms[0]?.id || '', title: '', academicStage: '', startTime: '', endTime: '', sessionPrice: '100', centerFeePerStudent: '20' });
  const [error, setError] = useState('');
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/scheduling/sessions', {
        method: 'POST',
        body: JSON.stringify({ ...form, sessionPrice: Number(form.sessionPrice), centerFeePerStudent: Number(form.centerFeePerStudent), startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() }),
      });
      notify(t('scheduling.save'));
      onDone();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t('scheduling.saveError')); }
  }

  const fields = [['title', t('scheduling.form.title')], ['academicStage', t('scheduling.form.stage')], ['startTime', t('scheduling.form.start')], ['endTime', t('scheduling.form.end')], ['sessionPrice', t('scheduling.form.price')], ['centerFeePerStudent', t('scheduling.form.fee')]] as const;

  return (
    <form onSubmit={submit} className="card card-pad">
      {error && <Banner text={error} tone="error" />}
      <div className="form-grid">
        <label className="field"><span className="field-label">{t('scheduling.form.teacher')}</span>
          <select className="select" value={form.teacherId} onChange={(event) => set('teacherId', event.target.value)}>
            {teachers.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
          </select>
        </label>
        <label className="field"><span className="field-label">{t('scheduling.form.room')}</span>
          <select className="select" value={form.roomId} onChange={(event) => set('roomId', event.target.value)}>
            {rooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {fields.map(([key, label]) => (
          <label className="field" key={key}><span className="field-label">{label}</span>
            <input
              className="input"
              required
              type={key.includes('Time') ? 'datetime-local' : key === 'sessionPrice' || key === 'centerFeePerStudent' ? 'number' : 'text'}
              min={key === 'sessionPrice' || key === 'centerFeePerStudent' ? 0 : undefined}
              step={key === 'sessionPrice' || key === 'centerFeePerStudent' ? '0.01' : undefined}
              value={form[key]}
              onChange={(event) => set(key, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="flex-gap mt-4">
        <button className="btn btn--primary"><Save className="h-4 w-4" />{t('scheduling.save')}</button>
        <span className="flex-gap muted" style={{ fontSize: 12.5 }}><Clock3 className="h-4 w-4" />{t('scheduling.form.start')}</span>
      </div>
    </form>
  );
}