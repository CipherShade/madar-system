import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CalendarDays, ClipboardList, Coins, MapPin, Timer, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api, money } from '../../lib/api';
import { EmptyState, Metric, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';
import { UsageMeter, type UsageData } from './UsageMeter';

type Session = { id: string; title: string; academicStage: string; startTime: string; endTime: string; sessionPrice: number; centerFeePerStudent: number; currentLobbyCount: number; status: string; teacher: { fullName: string; subject: string }; room: { name: string; capacity: number } };
type Shift = { id: string; status: 'OPEN' | 'CLOSED'; openingCash: number; financials?: { totalCashCollected: number } };
type DayReport = { totalAttendees: number; centerNetRevenue: number; teacherPayouts: number; digitalCollections: number };

const today = () => new Date().toISOString().slice(0, 10);
const minutesUntil = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 60000);

export function DashboardPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('ADMIN');
  const [active, setActive] = useState<Session[]>([]);
  const [upcoming, setUpcoming] = useState<Session[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [activeData, scheduleData, shiftData] = await Promise.all([
          api<{ sessions: Session[] }>('/attendances/sessions/active'),
          api<{ sessions: Session[] }>('/scheduling/sessions'),
          api<{ shift: Shift | null }>('/shifts/current'),
        ]);
        setActive(activeData.sessions);
        setUpcoming(scheduleData.sessions.filter((item) => item.status !== 'COMPLETED' && minutesUntil(item.startTime) > 0));
        setShift(shiftData.shift);
        if (isAdmin) {
          const [day, subData] = await Promise.all([
            api<DayReport>(`/reports/daily?date=${today()}`).catch(() => null),
            api<{ usage: UsageData | null }>('/subscriptions/current').catch(() => null),
          ]);
          if (day) setReport(day);
          if (subData?.usage) setUsage(subData.usage);
        }
      } catch { notify(t('operations.loadError'), 'error'); }
      finally { setUsageLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [isAdmin, t]);

  const studentsNow = useMemo(() => active.reduce((sum, item) => sum + item.currentLobbyCount, 0), [active]);
  const seatsLeft = useMemo(() => active.reduce((sum, item) => sum + Math.max(0, item.room.capacity - item.currentLobbyCount), 0), [active]);
  const fullSessions = active.filter((item) => item.currentLobbyCount >= item.room.capacity);
  const soon = upcoming.find((item) => minutesUntil(item.startTime) <= 30);
  const shiftCash = shift?.status === 'OPEN' ? (shift.financials?.totalCashCollected ?? 0) : 0;

  const at = <small>{t('timeline.groups.now')}</small>;

  return (
    <section>
      <PageHeader kicker={t('dashboard.currentSection')} title={t('dashboard.welcome')} subtitle={t('dashboard.welcome')} />

      {/* Owner / Admin Usage Meter with 80% / 90% / 100% Dynamic Warnings & Upgrade CTA */}
      {isAdmin && (
        <UsageMeter
          usage={usage}
          loading={usageLoading}
          onNavigateToBilling={() => onNavigate('billing')}
        />
      )}

      <div className="metric-grid">
        {isAdmin ? (
          <>
            <Metric icon={Users} label={t('dashboard.metrics.studentsToday')} value={<>{studentsNow} {at}</>} />
            <Metric icon={Coins} label={t('dashboard.metrics.netRevenue')} value={money(report?.centerNetRevenue ?? 0)} hint={t('dashboard.metrics.netRevenue')} />
            <Metric icon={ClipboardList} label={t('dashboard.metrics.teacherPayouts')} value={money(report?.teacherPayouts ?? 0)} />
            <Metric icon={Wallet} label={t('dashboard.metrics.shiftCash')} value={money(shiftCash)} hint={shift?.status === 'OPEN' ? t('status.open') : t('status.closed')} />
          </>
        ) : (
          <>
            <Metric icon={CalendarDays} label={t('dashboard.metrics.activeSessions')} value={<>{active.length} {at}</>} />
            <Metric icon={Users} label={t('dashboard.metrics.studentsToday')} value={<>{studentsNow} {at}</>} />
            <Metric icon={Timer} label={t('dashboard.metrics.seatsLeft')} value={seatsLeft} />
            <Metric icon={Wallet} label={t('dashboard.metrics.shiftCash')} value={money(shiftCash)} hint={shift?.status === 'OPEN' ? t('status.open') : t('status.closed')} />
          </>
        )}
      </div>

      <div className="section-grid">
        <div className="card card-pad">
          <div className="flex-between">
            <h3 className="card-title"><ClipboardList className="h-4 w-4" style={{ color: 'var(--primary)' }} />{t('dashboard.live.title')}</h3>
            <span className="pill pill--success"><span className="dot" />{t('dashboard.live.subtitle')}</span>
          </div>
          {active.length === 0 ? (
            <EmptyState text={t('operations.lobby.empty')} />
          ) : (
            <div className="session-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
              {active.map((session) => {
                const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                return (
                  <article key={session.id} className="card" style={{ padding: 14 }}>
                    <div className="session-top">
                      <span className="session-title">{session.title}</span>
                      <Pill tone={ratio >= 1 ? 'danger' : 'primary'}>{session.currentLobbyCount}/{session.room.capacity}</Pill>
                    </div>
                    <div className="session-meta">
                      <span>{session.teacher.fullName} · {session.teacher.subject}</span>
                      <span><MapPin className="h-3.5 w-3.5" />{session.room.name}</span>
                    </div>
                    <Progress now={session.currentLobbyCount} max={session.room.capacity} className="mt-3" />
                    <button type="button" className="btn btn--soft btn--sm mt-3" style={{ width: '100%' }} onClick={() => onNavigate('lobby')}>
                      {t('dashboard.live.openLobby')}<ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card card-pad">
            <h3 className="card-title">{t('dashboard.attention.title')}</h3>
            {!shift && (
              <div className={`attention-item ${isAdmin ? '' : 'attention-item--danger'}`}>
                <span className="attention-icon"><AlertTriangle className="h-4 w-4" /></span>
                <div className="body">
                  <div className="title">{t('dashboard.attention.shiftClosed.title')}</div>
                  <div className="desc">{t('dashboard.attention.shiftClosed.desc')}</div>
                </div>
                {isAdmin && (
                  <button type="button" className="btn btn--soft btn--sm" onClick={() => onNavigate('shift')}>{t('dashboard.attention.openShift')}</button>
                )}
              </div>
            )}
            {soon && (
              <div className="attention-item attention-item--success">
                <span className="attention-icon"><Timer className="h-4 w-4" /></span>
                <div className="body">
                  <div className="title">{soon.title}</div>
                  <div className="desc">{t('dashboard.attention.soon.desc')} — {new Date(soon.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
            )}
            {fullSessions.slice(0, 2).map((session) => (
              <div key={session.id} className="attention-item attention-item--danger">
                <span className="attention-icon"><Users className="h-4 w-4" /></span>
                <div className="body">
                  <div className="title">{session.title}</div>
                  <div className="desc">{t('dashboard.attention.full.desc')}</div>
                </div>
              </div>
            ))}
            {shift && !soon && fullSessions.length === 0 && <EmptyState text={t('dashboard.attention.nothing')} />}
          </div>

          <div className="card card-pad">
            <h3 className="card-title">{t('dashboard.live.next.title')}</h3>
            {upcoming.length === 0 ? (
              <EmptyState text={t('dashboard.live.next.empty')} />
            ) : (
              upcoming.slice(0, 3).map((session) => (
                <div className="attention-item" key={session.id}>
                  <span className="attention-icon"><CalendarDays className="h-4 w-4" /></span>
                  <div className="body">
                    <div className="title">{session.title}</div>
                    <div className="desc">{session.teacher.fullName} · {new Date(session.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}