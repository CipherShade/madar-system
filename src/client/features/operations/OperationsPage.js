import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { BarChart3, ClipboardCheck, Coins, MapPin, RefreshCw, Search, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { api, money } from '../../lib/api';
import { Avatar, Banner, EmptyState, Metric, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';
export function OperationsPage({ mode, selectedSessionId = '', onSessionChange }) {
    if (mode === 'lobby')
        return _jsx(LobbyPage, { selectedSessionId: selectedSessionId, onSessionChange: onSessionChange ?? (() => { }) });
    if (mode === 'shift')
        return _jsx(ShiftPage, {});
    if (mode === 'reconciliation')
        return _jsx(ReconciliationPage, {});
    if (mode === 'settlement')
        return _jsx(SettlementPage, {});
    return _jsx(ReportsPage, {});
}
/* ============================== LOBBY ============================== */
function LobbyPage({ selectedSessionId, onSessionChange }) {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState([]);
    const [students, setStudents] = useState([]);
    const [query, setQuery] = useState('');
    const [selectedSession, setSelectedSession] = useState(selectedSessionId);
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [reference, setReference] = useState('');
    const [error, setError] = useState('');
    const [checkingIn, setCheckingIn] = useState('');
    const selected = sessions.find((item) => item.id === selectedSession);
    const load = async () => {
        try {
            setSessions((await api('/attendances/sessions/active')).sessions);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('operations.loadError'));
        }
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
        if (query.trim().length < 1) {
            setStudents([]);
            return;
        }
        const timer = window.setTimeout(() => {
            void api(`/registry/students?search=${encodeURIComponent(query)}`).then((data) => setStudents(data.students)).catch(() => setStudents([]));
        }, 250);
        return () => window.clearTimeout(timer);
    }, [query]);
    async function checkIn(student) {
        if (!selectedSession) {
            setError(t('operations.chooseSession'));
            return;
        }
        setError('');
        setCheckingIn(student.id);
        try {
            await api('/attendances/checkin', { method: 'POST', body: JSON.stringify({ sessionId: selectedSession, studentId: student.id, paymentMethod, paymentReference: reference || undefined }) });
            notify(t('operations.checkInSuccess'));
            setQuery('');
            setStudents([]);
            setReference('');
            await load();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('operations.checkInError'));
        }
        finally {
            setCheckingIn('');
        }
    }
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.operation'), title: t('operations.lobby.title'), subtitle: t('operations.lobby.subtitle') }), _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "lobby-grid", children: [_jsx("div", { className: "stack", children: sessions.length === 0 ? (_jsx(EmptyState, { text: t('operations.lobby.empty') })) : (_jsx("div", { className: "session-grid", children: sessions.map((session) => {
                                const isSelected = selectedSession === session.id;
                                const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                                return (_jsxs("button", { type: "button", "aria-pressed": isSelected, className: `session-card ${isSelected ? 'session-card--active' : ''}`, onClick: () => { onSessionChange(session.id); setSelectedSession(session.id); }, children: [_jsxs("div", { className: "session-top", children: [_jsx("span", { className: "session-title", children: session.title }), _jsxs(Pill, { tone: ratio >= 1 ? 'danger' : 'primary', children: [session.currentLobbyCount, "/", session.room.capacity] })] }), _jsxs("div", { className: "session-meta", children: [_jsxs("span", { children: [session.teacher.fullName, " \u00B7 ", session.teacher.subject] }), _jsxs("span", { children: [_jsx(Timer, { className: "h-3.5 w-3.5" }), new Date(session.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })] }), _jsxs("span", { children: [_jsx(MapPin, { className: "h-3.5 w-3.5" }), session.room.name] })] }), _jsxs("div", { className: "session-foot", children: [_jsxs("span", { className: "count-now", children: [_jsxs("small", { children: [t('timeline.attended'), ":"] }), " ", session.currentLobbyCount] }), isSelected && _jsxs(Pill, { tone: "success", children: [_jsx("span", { className: "dot" }), t('status.active')] })] }), _jsx(Progress, { now: session.currentLobbyCount, max: session.room.capacity, className: "mt-2" })] }, session.id));
                            }) })) }), _jsxs("div", { className: "card card-pad", style: { position: 'sticky', top: 'calc(var(--header-h) + 16px)' }, children: [_jsxs("h3", { className: "card-title", children: [_jsx(Search, { className: "h-4 w-4", style: { color: 'var(--primary)' } }), t('operations.lobby.studentSearch')] }), selected ? (_jsxs("div", { className: "flex-between", style: { marginBottom: 14 }, children: [_jsxs("span", { className: "pill pill--primary", style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }, children: [t('operations.lobby.sessionSelected'), ": ", _jsx("b", { children: selected.title })] }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": t('actions.close'), onClick: () => { onSessionChange(''); setSelectedSession(''); }, children: _jsx(RefreshCw, { className: "h-4 w-4" }) })] })) : (_jsx("p", { className: "muted", style: { fontSize: 12.5, margin: '0 0 12px' }, children: t('operations.lobby.noSession') })), _jsxs("div", { className: "searchbar", children: [_jsx(Search, { className: "h-4 w-4" }), _jsx("input", { className: "input", value: query, onChange: (event) => setQuery(event.target.value), placeholder: t('operations.lobby.searchPlaceholder') })] }), _jsxs("div", { className: "student-list", children: [students.map((student) => (_jsxs("div", { className: "student-row", children: [_jsxs("div", { className: "flex-gap", style: { minWidth: 0 }, children: [_jsx(Avatar, { name: student.fullName, size: 34 }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { style: { fontWeight: 700, fontSize: 13 }, children: student.fullName }), _jsx("div", { className: "muted mono", style: { fontSize: 11 }, children: student.studentCode })] })] }), _jsx("button", { type: "button", className: "btn btn--soft btn--sm", disabled: checkingIn === student.id || !selectedSession, onClick: () => void checkIn(student), children: checkingIn === student.id ? t('auth.signingIn') : t('actions.checkIn') })] }, student.id))), query.trim().length >= 1 && students.length === 0 && _jsx(EmptyState, { text: t('students.empty') })] }), _jsx("div", { className: "payment-row", children: ['CASH', 'VODAFONE_CASH', 'INSTAPAY'].map((method) => (_jsx("button", { type: "button", className: `payment-option ${paymentMethod === method ? 'payment-option--active' : ''}`, onClick: () => setPaymentMethod(method), children: t(`paymentMethods.${method.toLowerCase()}`) }, method))) }), _jsxs("label", { className: "field mt-3", children: [_jsx("span", { className: "field-label", children: t('operations.lobby.reference') }), _jsx("input", { className: "input mono", placeholder: t('operations.lobby.reference'), value: reference, onChange: (event) => setReference(event.target.value) })] })] })] })] }));
}
/* ============================== SHIFT ============================== */
function ShiftPage() {
    const { t } = useTranslation();
    const [shift, setShift] = useState(null);
    const [desk, setDesk] = useState('Desk 1');
    const [opening, setOpening] = useState('0');
    const [actual, setActual] = useState('0');
    const [notes, setNotes] = useState('');
    const [expense, setExpense] = useState({ category: '', amount: '', description: '', paymentMethod: 'CASH' });
    const [error, setError] = useState('');
    const load = async () => {
        try {
            setShift((await api('/shifts/current')).shift);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('operations.loadError'));
        }
    };
    useEffect(() => { void load(); }, []);
    async function submit(path, body, message) {
        setError('');
        try {
            await api(path, { method: 'POST', body: JSON.stringify(body) });
            notify(message);
            await load();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('operations.saveError'));
        }
    }
    const financials = shift?.financials;
    const digital = (financials?.totalVodafoneCashCollected ?? 0) + (financials?.totalInstapayCollected ?? 0);
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.finance'), title: t('operations.shift.title'), subtitle: t('operations.shift.subtitle') }), _jsx(Banner, { text: error, tone: "error" }), !shift ? (_jsxs("form", { onSubmit: (event) => { event.preventDefault(); void submit('/shifts/open', { deskIdentifier: desk, openingCash: Number(opening) }, t('operations.shift.opened')); }, className: "card card-pad", children: [_jsxs("div", { className: "form-grid", style: { maxWidth: 640 }, children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.shift.desk') }), _jsx("input", { className: "input", value: desk, onChange: (event) => setDesk(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsxs("span", { className: "field-label", children: [t('operations.shift.openingCash'), " (", t('currency'), ")"] }), _jsx("input", { className: "input mono", type: "number", min: 0, step: "0.01", value: opening, onChange: (event) => setOpening(event.target.value) })] })] }), _jsx("button", { className: "btn btn--primary mt-4", children: t('actions.openShift') })] })) : (_jsxs("div", { className: "stack", children: [_jsxs("div", { className: "flex-between", children: [_jsxs("span", { className: "pill pill--success", children: [_jsx("span", { className: "dot" }), t('status.open')] }), _jsxs("span", { className: "muted mono", style: { fontSize: 12 }, children: ["#", shift.id.slice(0, 8)] })] }), _jsx("div", { className: "metric-grid", children: [['expectedCashInDrawer', financials?.expectedCashInDrawer], ['totalCashCollected', financials?.totalCashCollected], ['totalTeacherCashPayouts', financials?.totalTeacherCashPayouts], ['totalCashExpenses', financials?.totalCashExpenses]].map(([key, value]) => (_jsx(Metric, { label: t(`operations.shift.${key}`), value: money(value) }, key))) }), _jsxs("div", { className: "card card-pad", children: [_jsx("h3", { className: "card-title", children: t('operations.shift.addExpense') }), _jsxs("form", { onSubmit: (event) => { event.preventDefault(); void submit('/shifts/expenses', { ...expense, amount: Number(expense.amount) }, t('operations.shift.expenseSaved')); }, className: "form-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.shift.category') }), _jsx("input", { className: "input", required: true, value: expense.category, onChange: (event) => setExpense({ ...expense, category: event.target.value }) })] }), _jsxs("label", { className: "field", children: [_jsxs("span", { className: "field-label", children: [t('operations.shift.amount'), " (", t('currency'), ")"] }), _jsx("input", { className: "input mono", required: true, type: "number", min: 0, step: "0.01", value: expense.amount, onChange: (event) => setExpense({ ...expense, amount: event.target.value }) })] }), _jsxs("label", { className: "field", style: { gridColumn: '1 / -1' }, children: [_jsx("span", { className: "field-label", children: t('operations.shift.description') }), _jsx("input", { className: "input", value: expense.description, onChange: (event) => setExpense({ ...expense, description: event.target.value }) })] }), _jsxs("div", { className: "flex-gap", style: { gridColumn: '1 / -1' }, children: [_jsx("button", { className: "btn btn--soft", children: t('operations.shift.addExpense') }), _jsxs("span", { className: "mono muted", style: { fontSize: 12 }, children: [t('operations.shift.trend.digital'), ": ", money(digital)] })] })] })] }), _jsxs("div", { className: "card card-pad", children: [_jsx("h3", { className: "card-title", children: t('actions.closeShift') }), _jsxs("form", { onSubmit: (event) => { event.preventDefault(); void submit('/shifts/close', { actualCashCounted: Number(actual), closingNotes: notes || undefined }, t('operations.shift.closed')); }, className: "form-grid", style: { maxWidth: 640 }, children: [_jsxs("label", { className: "field", children: [_jsxs("span", { className: "field-label", children: [t('operations.shift.actualCash'), " (", t('currency'), ")"] }), _jsx("input", { className: "input mono", type: "number", min: 0, step: "0.01", value: actual, onChange: (event) => setActual(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.shift.notes') }), _jsx("input", { className: "input", value: notes, onChange: (event) => setNotes(event.target.value) })] }), _jsx("div", { style: { gridColumn: '1 / -1' }, children: _jsx("button", { className: "btn btn--danger", children: t('actions.closeShift') }) })] })] })] }))] }));
}
/* ============================ RECONCILIATION ============================ */
function ReconciliationPage() {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState([]);
    const [sessionId, setSessionId] = useState('');
    const [assistant, setAssistant] = useState('');
    const [headcount, setHeadcount] = useState('');
    const [notes, setNotes] = useState('');
    useEffect(() => {
        void api('/attendances/sessions/active').then((data) => setSessions(data.sessions)).catch(() => { });
    }, []);
    const selected = sessions.find((item) => item.id === sessionId);
    const diff = selected ? Number(headcount || 0) - selected.currentLobbyCount : 0;
    async function submit(event) {
        event.preventDefault();
        try {
            await api(`/sessions/${sessionId}/reconcile`, { method: 'POST', body: JSON.stringify({ assistantCount: Number(assistant), reconciledHeadcount: Number(headcount), resolutionNotes: notes || undefined }) });
            notify(t('operations.reconciliation.saved'));
        }
        catch (caught) {
            notify(caught instanceof Error ? caught.message : t('operations.saveError'), 'error');
        }
    }
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.finance'), title: t('operations.reconciliation.title'), subtitle: t('operations.reconciliation.subtitle') }), _jsx("form", { onSubmit: submit, className: "card card-pad", style: { maxWidth: 560 }, children: _jsxs("div", { className: "form-stack", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.reconciliation.session') }), _jsxs("select", { className: "select", required: true, value: sessionId, onChange: (event) => setSessionId(event.target.value), children: [_jsx("option", { value: "", children: "\u2014" }), sessions.map((item) => _jsxs("option", { value: item.id, children: [item.title, " (", item.currentLobbyCount, ")"] }, item.id))] })] }), selected && (_jsxs("div", { className: "flex-between", children: [_jsxs("span", { children: [t('operations.reconciliation.lobbyCount'), ": ", _jsx("b", { children: selected.currentLobbyCount })] }), _jsxs("span", { className: `mono ${diff !== 0 ? 'pill pill--warning' : 'pill pill--success'}`, children: [t('operations.reconciliation.headcount'), ": ", Number(headcount || 0)] })] })), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.reconciliation.assistantCount') }), _jsx("input", { className: "input mono", required: true, type: "number", min: 0, value: assistant, onChange: (event) => setAssistant(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.reconciliation.headcount') }), _jsx("input", { className: "input mono", required: true, type: "number", min: 0, value: headcount, onChange: (event) => setHeadcount(event.target.value) })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.reconciliation.notes') }), _jsx("input", { className: "input", value: notes, onChange: (event) => setNotes(event.target.value) })] }), _jsx("button", { className: "btn btn--primary", disabled: !sessionId, children: t('actions.reconcile') })] }) })] }));
}
/* ============================== SETTLEMENT ============================== */
function SettlementPage() {
    const { t } = useTranslation();
    const [sessions, setSessions] = useState([]);
    const [sessionId, setSessionId] = useState('');
    const [recipient, setRecipient] = useState('');
    const [method, setMethod] = useState('CASH');
    useEffect(() => {
        void api('/scheduling/sessions').then((data) => setSessions(data.sessions)).catch(() => { });
    }, []);
    const selected = sessions.find((item) => item.id === sessionId);
    const expectedPayout = selected ? (selected.sessionPrice - selected.centerFeePerStudent) * selected.currentLobbyCount : 0;
    async function submit(event) {
        event.preventDefault();
        try {
            await api(`/sessions/${sessionId}/settle`, { method: 'POST', body: JSON.stringify({ payoutMethod: method, recipientName: recipient }) });
            notify(t('operations.settlement.saved'));
        }
        catch (caught) {
            notify(caught instanceof Error ? caught.message : t('operations.saveError'), 'error');
        }
    }
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.finance'), title: t('operations.settlement.title'), subtitle: t('operations.settlement.subtitle') }), _jsx("form", { onSubmit: submit, className: "card card-pad", style: { maxWidth: 560 }, children: _jsxs("div", { className: "form-stack", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.settlement.session') }), _jsxs("select", { className: "select", required: true, value: sessionId, onChange: (event) => setSessionId(event.target.value), children: [_jsx("option", { value: "", children: "\u2014" }), sessions.map((item) => _jsx("option", { value: item.id, children: item.title }, item.id))] })] }), selected && (_jsxs("div", { className: "metric-grid", style: { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }, children: [_jsx(Metric, { label: t('operations.settlement.price'), value: money(selected.sessionPrice) }), _jsx(Metric, { label: t('operations.settlement.centerFee'), value: money(selected.centerFeePerStudent) }), _jsx(Metric, { label: t('timeline.attended'), value: selected.currentLobbyCount }), _jsx(Metric, { label: t('operations.settlement.payment'), value: money(expectedPayout) })] })), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.settlement.payment') }), _jsxs("select", { className: "select", value: method, onChange: (event) => setMethod(event.target.value), children: [_jsx("option", { value: "CASH", children: t('paymentMethods.cash') }), _jsx("option", { value: "VODAFONE_CASH", children: t('paymentMethods.vodafoneCash') }), _jsx("option", { value: "INSTAPAY", children: t('paymentMethods.instapay') })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('operations.settlement.recipient') }), _jsx("input", { className: "input", value: recipient, onChange: (event) => setRecipient(event.target.value), placeholder: selected?.teacher.fullName })] }), _jsx("button", { className: "btn btn--primary", disabled: !sessionId, children: t('actions.settlePayout') })] }) })] }));
}
/* ============================== REPORTS ============================== */
function ReportsPage() {
    const { t } = useTranslation();
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [report, setReport] = useState(null);
    const [shiftId, setShiftId] = useState('');
    const [entries, setEntries] = useState([]);
    const [auditLoaded, setAuditLoaded] = useState(false);
    const [error, setError] = useState('');
    const loadReport = async () => {
        setError('');
        try {
            setReport(await api(`/reports/daily?date=${date}`));
        }
        catch {
            setError(t('operations.loadError'));
        }
    };
    const loadAudit = async () => {
        setError('');
        setAuditLoaded(true);
        try {
            setEntries((await api(`/reports/shifts/${shiftId}/audit`)).entries);
        }
        catch {
            setError(t('operations.loadError'));
        }
    };
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.finance'), title: t('operations.reports.title'), subtitle: t('operations.reports.subtitle') }), _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "flex-gap", style: { marginBottom: 16 }, children: [_jsx("input", { className: "input", "aria-label": t('operations.reports.load'), style: { width: 'auto' }, type: "date", value: date, onChange: (event) => setDate(event.target.value) }), _jsxs("button", { type: "button", className: "btn btn--primary", onClick: () => void loadReport(), children: [_jsx(BarChart3, { className: "h-4 w-4" }), t('operations.reports.load')] })] }), report && (_jsx("div", { className: "metric-grid", children: ['totalAttendees', 'centerNetRevenue', 'teacherPayouts', 'digitalCollections'].map((key) => (_jsx(Metric, { label: t(`operations.reports.${key}`), value: key === 'totalAttendees' ? String(report[key]) : money(report[key]) }, key))) })), _jsxs("div", { className: "card card-pad", style: { maxWidth: 560 }, children: [_jsxs("h3", { className: "card-title", children: [_jsx(ClipboardCheck, { className: "h-4 w-4", style: { color: 'var(--primary)' } }), t('operations.reports.loadAudit')] }), _jsxs("div", { className: "flex-gap", children: [_jsxs("label", { className: "field", style: { flex: 1 }, children: [_jsx("span", { className: "field-label", children: t('operations.reports.shiftId') }), _jsx("input", { className: "input mono", value: shiftId, onChange: (event) => setShiftId(event.target.value), placeholder: "xxxxxxxx-xxxx-..." })] }), _jsxs("button", { type: "button", className: "btn btn--ghost", disabled: !shiftId, style: { marginTop: 22 }, onClick: () => void loadAudit(), children: [_jsx(Coins, { className: "h-4 w-4" }), t('operations.reports.loadAudit')] })] }), auditLoaded && entries.length === 0 && (_jsx("p", { className: "muted mt-3", style: { fontSize: 13 }, children: t('operations.auditEmpty') })), entries.length > 0 && (_jsx("div", { className: "table-wrap mt-3", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsx("tr", { children: Object.keys(entries[0]).slice(0, 5).map((key) => _jsx("th", { children: key }, key)) }) }), _jsx("tbody", { children: entries.slice(0, 12).map((entry, index) => (_jsx("tr", { children: Object.entries(entry).slice(0, 5).map(([key, value], cellIndex) => (_jsx("td", { children: key === 'amount' && typeof value === 'number' ? money(value) : String(value) }, cellIndex))) }, index))) })] }) }))] })] }));
}
