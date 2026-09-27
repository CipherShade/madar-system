import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, ClipboardCheck, Coins, MapPin, RefreshCw, Search, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { api, money } from '../../lib/api';
import { Avatar, Banner, EmptyState, Metric, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';

type Mode = 'lobby' | 'shift' | 'reconciliation' | 'settlement' | 'reports';
type Session = { id: string; title: string; academicStage: string; startTime: string; endTime: string; sessionPrice: number; centerFeePerStudent: number; currentLobbyCount: number; status: string; teacher: { fullName: string; subject: string }; room: { name: string; capacity: number } };
type Student = { id: string; fullName: string; studentCode: string; guardianPhone: string };
type Shift = { id: string; deskIdentifier: string; status: 'OPEN' | 'CLOSED'; openingCash: number; financials?: { expectedCashInDrawer: number; totalCashCollected: number; totalVodafoneCashCollected: number; totalInstapayCollected: number; totalTeacherCashPayouts: number; totalCashExpenses: number }; actualCashCounted: number | null; expectedCash: number | null; cashVariance: number | null };

export function OperationsPage({ mode, selectedSessionId = '', onSessionChange }: { mode: Mode; selectedSessionId?: string; onSessionChange?: (id: string) => void }) {
  if (mode === 'lobby') return <LobbyPage selectedSessionId={selectedSessionId} onSessionChange={onSessionChange ?? (() => {})} />;
  if (mode === 'shift') return <ShiftPage />;
  if (mode === 'reconciliation') return <ReconciliationPage />;
  if (mode === 'settlement') return <SettlementPage />;
  return <ReportsPage />;
}

/* ============================== LOBBY ============================== */
function LobbyPage({ selectedSessionId, onSessionChange }: { selectedSessionId: string; onSessionChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState(selectedSessionId);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [checkingIn, setCheckingIn] = useState('');

  const selected = sessions.find((item) => item.id === selectedSession);

  const load = async () => {
    try { setSessions((await api<{ sessions: Session[] }>('/attendances/sessions/active')).sessions); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('operations.loadError')); }
  };
  useEffect(() => {
    void load();
    const socket = io({ withCredentials: true });
    socket.on('connect', () => socket.emit('join:lobby'));
    socket.on('attendance:checked_in', () => void load());
    const timer = window.setInterval(() => void load(), 30000);
    return () => { socket.emit('leave:lobby'); socket.disconnect(); window.clearInterval(timer); };
  }, []);
  useEffect(() => { setSelectedSession(selectedSessionId); }, [selectedSessionId]);
  useEffect(() => {
    if (query.trim().length < 1) { setStudents([]); return; }
    const timer = window.setTimeout(() => {
      void api<{ students: Student[] }>(`/registry/students?search=${encodeURIComponent(query)}`).then((data) => setStudents(data.students)).catch(() => setStudents([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function checkIn(student: Student) {
    if (!selectedSession) { setError(t('operations.chooseSession')); return; }
    setError('');
    setCheckingIn(student.id);
    try {
      await api('/attendances/checkin', { method: 'POST', body: JSON.stringify({ sessionId: selectedSession, studentId: student.id, paymentMethod, paymentReference: reference || undefined }) });
      notify(t('operations.checkInSuccess'));
      setQuery(''); setStudents([]); setReference('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('operations.checkInError'));
    } finally {
      setCheckingIn('');
    }
  }

  return (
    <section>
      <PageHeader kicker={t('navigation.groups.operation')} title={t('operations.lobby.title')} subtitle={t('operations.lobby.subtitle')} />
      <Banner text={error} tone="error" />

      <div className="lobby-grid">
        <div className="stack">
          {sessions.length === 0 ? (
            <EmptyState text={t('operations.lobby.empty')} />
          ) : (
            <div className="session-grid">
              {sessions.map((session) => {
                const isSelected = selectedSession === session.id;
                const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                return (
                  <button
                    key={session.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`session-card ${isSelected ? 'session-card--active' : ''}`}
                    onClick={() => { onSessionChange(session.id); setSelectedSession(session.id); }}
                  >
                    <div className="session-top">
                      <span className="session-title">{session.title}</span>
                      <Pill tone={ratio >= 1 ? 'danger' : 'primary'}>{session.currentLobbyCount}/{session.room.capacity}</Pill>
                    </div>
                    <div className="session-meta">
                      <span>{session.teacher.fullName} · {session.teacher.subject}</span>
                      <span><Timer className="h-3.5 w-3.5" />{new Date(session.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                      <span><MapPin className="h-3.5 w-3.5" />{session.room.name}</span>
                    </div>
                    <div className="session-foot">
                      <span className="count-now"><small>{t('timeline.attended')}:</small> {session.currentLobbyCount}</span>
                      {isSelected && <Pill tone="success"><span className="dot" />{t('status.active')}</Pill>}
                    </div>
                    <Progress now={session.currentLobbyCount} max={session.room.capacity} className="mt-2" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ position: 'sticky', top: 'calc(var(--header-h) + 16px)' }}>
          <h3 className="card-title"><Search className="h-4 w-4" style={{ color: 'var(--primary)' }} />{t('operations.lobby.studentSearch')}</h3>
          {selected ? (
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <span className="pill pill--primary" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('operations.lobby.sessionSelected')}: <b>{selected.title}</b></span>
              <button type="button" className="icon-btn" aria-label={t('actions.close')} onClick={() => { onSessionChange(''); setSelectedSession(''); }}>
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>{t('operations.lobby.noSession')}</p>
          )}
          <div className="searchbar">
            <Search className="h-4 w-4" />
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('operations.lobby.searchPlaceholder')} />
          </div>

          <div className="student-list">
            {students.map((student) => (
              <div className="student-row" key={student.id}>
                <div className="flex-gap" style={{ minWidth: 0 }}>
                  <Avatar name={student.fullName} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{student.fullName}</div>
                    <div className="muted mono" style={{ fontSize: 11 }}>{student.studentCode}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--soft btn--sm"
                  disabled={checkingIn === student.id || !selectedSession}
                  onClick={() => void checkIn(student)}
                >
                  {checkingIn === student.id ? t('auth.signingIn') : t('actions.checkIn')}
                </button>
              </div>
            ))}
            {query.trim().length >= 1 && students.length === 0 && <EmptyState text={t('students.empty')} />}
          </div>

          <div className="payment-row">
            {(['CASH', 'VODAFONE_CASH', 'INSTAPAY'] as const).map((method) => (
              <button key={method} type="button" className={`payment-option ${paymentMethod === method ? 'payment-option--active' : ''}`} onClick={() => setPaymentMethod(method)}>
                {t(`paymentMethods.${method.toLowerCase()}`)}
              </button>
            ))}
          </div>
          <label className="field mt-3">
            <span className="field-label">{t('operations.lobby.reference')}</span>
            <input className="input mono" placeholder={t('operations.lobby.reference')} value={reference} onChange={(event) => setReference(event.target.value)} />
          </label>
        </div>
      </div>
    </section>
  );
}

/* ============================== SHIFT ============================== */
function ShiftPage() {
  const { t } = useTranslation();
  const [shift, setShift] = useState<Shift | null>(null);
  const [desk, setDesk] = useState('Desk 1');
  const [opening, setOpening] = useState('0');
  const [actual, setActual] = useState('0');
  const [notes, setNotes] = useState('');
  const [expense, setExpense] = useState({ category: '', amount: '', description: '', paymentMethod: 'CASH' });
  const [error, setError] = useState('');

  const load = async () => {
    try { setShift((await api<{ shift: Shift | null }>('/shifts/current')).shift); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('operations.loadError')); }
  };
  useEffect(() => { void load(); }, []);

  async function submit(path: string, body: object, message: string) {
    setError('');
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); notify(message); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t('operations.saveError')); }
  }

  const financials = shift?.financials;
  const digital = (financials?.totalVodafoneCashCollected ?? 0) + (financials?.totalInstapayCollected ?? 0);

  return (
    <section>
      <PageHeader kicker={t('navigation.groups.finance')} title={t('operations.shift.title')} subtitle={t('operations.shift.subtitle')} />
      <Banner text={error} tone="error" />

      {!shift ? (
        <form onSubmit={(event) => { event.preventDefault(); void submit('/shifts/open', { deskIdentifier: desk, openingCash: Number(opening) }, t('operations.shift.opened')); }} className="card card-pad">
          <div className="form-grid" style={{ maxWidth: 640 }}>
            <label className="field">
              <span className="field-label">{t('operations.shift.desk')}</span>
              <input className="input" value={desk} onChange={(event) => setDesk(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t('operations.shift.openingCash')} ({t('currency')})</span>
              <input className="input mono" type="number" min={0} step="0.01" value={opening} onChange={(event) => setOpening(event.target.value)} />
            </label>
          </div>
          <button className="btn btn--primary mt-4">{t('actions.openShift')}</button>
        </form>
      ) : (
        <div className="stack">
          <div className="flex-between">
            <span className="pill pill--success"><span className="dot" />{t('status.open')}</span>
            <span className="muted mono" style={{ fontSize: 12 }}>#{shift.id.slice(0, 8)}</span>
          </div>
          <div className="metric-grid">
            {([['expectedCashInDrawer', financials?.expectedCashInDrawer], ['totalCashCollected', financials?.totalCashCollected], ['totalTeacherCashPayouts', financials?.totalTeacherCashPayouts], ['totalCashExpenses', financials?.totalCashExpenses]] as const).map(([key, value]) => (
              <Metric key={key} label={t(`operations.shift.${key}`)} value={money(value)} />
            ))}
          </div>

          <div className="card card-pad">
            <h3 className="card-title">{t('operations.shift.addExpense')}</h3>
            <form onSubmit={(event) => { event.preventDefault(); void submit('/shifts/expenses', { ...expense, amount: Number(expense.amount) }, t('operations.shift.expenseSaved')); }} className="form-grid">
              <label className="field">
                <span className="field-label">{t('operations.shift.category')}</span>
                <input className="input" required value={expense.category} onChange={(event) => setExpense({ ...expense, category: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">{t('operations.shift.amount')} ({t('currency')})</span>
                <input className="input mono" required type="number" min={0} step="0.01" value={expense.amount} onChange={(event) => setExpense({ ...expense, amount: event.target.value })} />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span className="field-label">{t('operations.shift.description')}</span>
                <input className="input" value={expense.description} onChange={(event) => setExpense({ ...expense, description: event.target.value })} />
              </label>
              <div className="flex-gap" style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn--soft">{t('operations.shift.addExpense')}</button>
                <span className="mono muted" style={{ fontSize: 12 }}>{t('operations.shift.trend.digital')}: {money(digital)}</span>
              </div>
            </form>
          </div>

          <div className="card card-pad">
            <h3 className="card-title">{t('actions.closeShift')}</h3>
            <form onSubmit={(event) => { event.preventDefault(); void submit('/shifts/close', { actualCashCounted: Number(actual), closingNotes: notes || undefined }, t('operations.shift.closed')); }} className="form-grid" style={{ maxWidth: 640 }}>
              <label className="field">
                <span className="field-label">{t('operations.shift.actualCash')} ({t('currency')})</span>
                <input className="input mono" type="number" min={0} step="0.01" value={actual} onChange={(event) => setActual(event.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">{t('operations.shift.notes')}</span>
                <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn--danger">{t('actions.closeShift')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================ RECONCILIATION ============================ */
function ReconciliationPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [assistant, setAssistant] = useState('');
  const [headcount, setHeadcount] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    void api<{ sessions: Session[] }>('/attendances/sessions/active').then((data) => setSessions(data.sessions)).catch(() => { /* ignore */ });
  }, []);
  const selected = sessions.find((item) => item.id === sessionId);
  const diff = selected ? Number(headcount || 0) - selected.currentLobbyCount : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/sessions/${sessionId}/reconcile`, { method: 'POST', body: JSON.stringify({ assistantCount: Number(assistant), reconciledHeadcount: Number(headcount), resolutionNotes: notes || undefined }) });
      notify(t('operations.reconciliation.saved'));
    } catch (caught) { notify(caught instanceof Error ? caught.message : t('operations.saveError'), 'error'); }
  }

  return (
    <section>
      <PageHeader kicker={t('navigation.groups.finance')} title={t('operations.reconciliation.title')} subtitle={t('operations.reconciliation.subtitle')} />
      <form onSubmit={submit} className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="form-stack">
          <label className="field">
            <span className="field-label">{t('operations.reconciliation.session')}</span>
            <select className="select" required value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="">—</option>
              {sessions.map((item) => <option key={item.id} value={item.id}>{item.title} ({item.currentLobbyCount})</option>)}
            </select>
          </label>
          {selected && (
            <div className="flex-between">
              <span>{t('operations.reconciliation.lobbyCount')}: <b>{selected.currentLobbyCount}</b></span>
              <span className={`mono ${diff !== 0 ? 'pill pill--warning' : 'pill pill--success'}`}>{t('operations.reconciliation.headcount')}: {Number(headcount || 0)}</span>
            </div>
          )}
          <div className="form-grid">
            <label className="field">
              <span className="field-label">{t('operations.reconciliation.assistantCount')}</span>
              <input className="input mono" required type="number" min={0} value={assistant} onChange={(event) => setAssistant(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">{t('operations.reconciliation.headcount')}</span>
              <input className="input mono" required type="number" min={0} value={headcount} onChange={(event) => setHeadcount(event.target.value)} />
            </label>
          </div>
          <label className="field">
            <span className="field-label">{t('operations.reconciliation.notes')}</span>
            <input className="input" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button className="btn btn--primary" disabled={!sessionId}>{t('actions.reconcile')}</button>
        </div>
      </form>
    </section>
  );
}

/* ============================== SETTLEMENT ============================== */
function SettlementPage() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [recipient, setRecipient] = useState('');
  const [method, setMethod] = useState('CASH');
  useEffect(() => {
    void api<{ sessions: Session[] }>('/scheduling/sessions').then((data) => setSessions(data.sessions)).catch(() => { /* ignore */ });
  }, []);
  const selected = sessions.find((item) => item.id === sessionId);
  const expectedPayout = selected ? (selected.sessionPrice - selected.centerFeePerStudent) * selected.currentLobbyCount : 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/sessions/${sessionId}/settle`, { method: 'POST', body: JSON.stringify({ payoutMethod: method, recipientName: recipient }) });
      notify(t('operations.settlement.saved'));
    } catch (caught) { notify(caught instanceof Error ? caught.message : t('operations.saveError'), 'error'); }
  }

  return (
    <section>
      <PageHeader kicker={t('navigation.groups.finance')} title={t('operations.settlement.title')} subtitle={t('operations.settlement.subtitle')} />
      <form onSubmit={submit} className="card card-pad" style={{ maxWidth: 560 }}>
        <div className="form-stack">
          <label className="field">
            <span className="field-label">{t('operations.settlement.session')}</span>
            <select className="select" required value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="">—</option>
              {sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          {selected && (
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
              <Metric label={t('operations.settlement.price')} value={money(selected.sessionPrice)} />
              <Metric label={t('operations.settlement.centerFee')} value={money(selected.centerFeePerStudent)} />
              <Metric label={t('timeline.attended')} value={selected.currentLobbyCount} />
              <Metric label={t('operations.settlement.payment')} value={money(expectedPayout)} />
            </div>
          )}
          <label className="field">
            <span className="field-label">{t('operations.settlement.payment')}</span>
            <select className="select" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="CASH">{t('paymentMethods.cash')}</option>
              <option value="VODAFONE_CASH">{t('paymentMethods.vodafoneCash')}</option>
              <option value="INSTAPAY">{t('paymentMethods.instapay')}</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('operations.settlement.recipient')}</span>
            <input className="input" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={selected?.teacher.fullName} />
          </label>
          <button className="btn btn--primary" disabled={!sessionId}>{t('actions.settlePayout')}</button>
        </div>
      </form>
    </section>
  );
}

/* ============================== REPORTS ============================== */
function ReportsPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [shiftId, setShiftId] = useState('');
  const [entries, setEntries] = useState<Record<string, unknown>[]>([]);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [error, setError] = useState('');

  const loadReport = async () => {
    setError('');
    try { setReport(await api<Record<string, unknown>>(`/reports/daily?date=${date}`)); }
    catch { setError(t('operations.loadError')); }
  };
  const loadAudit = async () => {
    setError('');
    setAuditLoaded(true);
    try { setEntries((await api<{ entries: Record<string, unknown>[] }>(`/reports/shifts/${shiftId}/audit`)).entries); }
    catch { setError(t('operations.loadError')); }
  };

  return (
    <section>
      <PageHeader kicker={t('navigation.groups.finance')} title={t('operations.reports.title')} subtitle={t('operations.reports.subtitle')} />
      <Banner text={error} tone="error" />
      <div className="flex-gap" style={{ marginBottom: 16 }}>
        <input className="input" aria-label={t('operations.reports.load')} style={{ width: 'auto' }} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="btn btn--primary" onClick={() => void loadReport()}>
          <BarChart3 className="h-4 w-4" />{t('operations.reports.load')}
        </button>
      </div>
      {report && (
        <div className="metric-grid">
          {(['totalAttendees', 'centerNetRevenue', 'teacherPayouts', 'digitalCollections'] as const).map((key) => (
            <Metric key={key} label={t(`operations.reports.${key}`)} value={key === 'totalAttendees' ? String(report[key]) : money(report[key] as number)} />
          ))}
        </div>
      )}
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <h3 className="card-title"><ClipboardCheck className="h-4 w-4" style={{ color: 'var(--primary)' }} />{t('operations.reports.loadAudit')}</h3>
        <div className="flex-gap">
          <label className="field" style={{ flex: 1 }}>
            <span className="field-label">{t('operations.reports.shiftId')}</span>
            <input className="input mono" value={shiftId} onChange={(event) => setShiftId(event.target.value)} placeholder="xxxxxxxx-xxxx-..." />
          </label>
          <button type="button" className="btn btn--ghost" disabled={!shiftId} style={{ marginTop: 22 }} onClick={() => void loadAudit()}>
            <Coins className="h-4 w-4" />{t('operations.reports.loadAudit')}
          </button>
        </div>
        {auditLoaded && entries.length === 0 && (
          <p className="muted mt-3" style={{ fontSize: 13 }}>{t('operations.auditEmpty')}</p>
        )}
        {entries.length > 0 && (
          <div className="table-wrap mt-3">
            <table className="table">
              <thead>
                <tr>
                  {Object.keys(entries[0]).slice(0, 5).map((key) => <th key={key}>{key}</th>)}
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 12).map((entry, index) => (
                  <tr key={index}>
                    {Object.entries(entry).slice(0, 5).map(([key, value], cellIndex) => (
                      <td key={cellIndex}>
                        {key === 'amount' && typeof value === 'number' ? money(value) : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}