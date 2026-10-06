import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, CalendarDays, ClipboardList, Coins, MapPin, Timer, Users, Wallet } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { api, money } from '../../lib/api';
import { EmptyState, Metric, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';
import { UsageMeter } from './UsageMeter';
const today = () => new Date().toISOString().slice(0, 10);
const minutesUntil = (iso) => Math.round((new Date(iso).getTime() - Date.now()) / 60000);
export function DashboardPage({ onNavigate }) {
    const { t } = useTranslation();
    const { hasRole } = useAuth();
    const isAdmin = hasRole('ADMIN');
    const [active, setActive] = useState([]);
    const [upcoming, setUpcoming] = useState([]);
    const [shift, setShift] = useState(null);
    const [report, setReport] = useState(null);
    const [usage, setUsage] = useState(null);
    const [usageLoading, setUsageLoading] = useState(true);
    useEffect(() => {
        const load = async () => {
            try {
                const [activeData, scheduleData, shiftData] = await Promise.all([
                    api('/attendances/sessions/active'),
                    api('/scheduling/sessions'),
                    api('/shifts/current'),
                ]);
                setActive(activeData.sessions);
                setUpcoming(scheduleData.sessions.filter((item) => item.status !== 'COMPLETED' && minutesUntil(item.startTime) > 0));
                setShift(shiftData.shift);
                if (isAdmin) {
                    const [day, subData] = await Promise.all([
                        api(`/reports/daily?date=${today()}`).catch(() => null),
                        api('/subscriptions/current').catch(() => null),
                    ]);
                    if (day)
                        setReport(day);
                    // `summaryAvailable` guards against a server-side summary failure, which
                    // returns a usage object carrying only the period and visit counters.
                    if (subData?.usage?.summaryAvailable)
                        setUsage(subData.usage);
                }
            }
            catch {
                notify(t('operations.loadError'), 'error');
            }
            finally {
                setUsageLoading(false);
            }
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
    const at = _jsx("small", { children: t('timeline.groups.now') });
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('dashboard.currentSection'), title: t('dashboard.welcome'), subtitle: t('dashboard.welcome') }), isAdmin && (_jsx(UsageMeter, { usage: usage, loading: usageLoading, onNavigateToBilling: () => onNavigate('billing') })), _jsx("div", { className: "metric-grid", children: isAdmin ? (_jsxs(_Fragment, { children: [_jsx(Metric, { icon: Users, label: t('dashboard.metrics.studentsToday'), value: _jsxs(_Fragment, { children: [studentsNow, " ", at] }) }), _jsx(Metric, { icon: Coins, label: t('dashboard.metrics.netRevenue'), value: money(report?.centerNetRevenue ?? 0), hint: t('dashboard.metrics.netRevenue') }), _jsx(Metric, { icon: ClipboardList, label: t('dashboard.metrics.teacherPayouts'), value: money(report?.teacherPayouts ?? 0) }), _jsx(Metric, { icon: Wallet, label: t('dashboard.metrics.shiftCash'), value: money(shiftCash), hint: shift?.status === 'OPEN' ? t('status.open') : t('status.closed') })] })) : (_jsxs(_Fragment, { children: [_jsx(Metric, { icon: CalendarDays, label: t('dashboard.metrics.activeSessions'), value: _jsxs(_Fragment, { children: [active.length, " ", at] }) }), _jsx(Metric, { icon: Users, label: t('dashboard.metrics.studentsToday'), value: _jsxs(_Fragment, { children: [studentsNow, " ", at] }) }), _jsx(Metric, { icon: Timer, label: t('dashboard.metrics.seatsLeft'), value: seatsLeft }), _jsx(Metric, { icon: Wallet, label: t('dashboard.metrics.shiftCash'), value: money(shiftCash), hint: shift?.status === 'OPEN' ? t('status.open') : t('status.closed') })] })) }), _jsxs("div", { className: "section-grid", children: [_jsxs("div", { className: "card card-pad", children: [_jsxs("div", { className: "flex-between", children: [_jsxs("h3", { className: "card-title", children: [_jsx(ClipboardList, { className: "h-4 w-4", style: { color: 'var(--primary)' } }), t('dashboard.live.title')] }), _jsxs("span", { className: "pill pill--success", children: [_jsx("span", { className: "dot" }), t('dashboard.live.subtitle')] })] }), active.length === 0 ? (_jsx(EmptyState, { text: t('operations.lobby.empty') })) : (_jsx("div", { className: "session-grid", style: { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }, children: active.map((session) => {
                                    const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                                    return (_jsxs("article", { className: "card", style: { padding: 14 }, children: [_jsxs("div", { className: "session-top", children: [_jsx("span", { className: "session-title", children: session.title }), _jsxs(Pill, { tone: ratio >= 1 ? 'danger' : 'primary', children: [session.currentLobbyCount, "/", session.room.capacity] })] }), _jsxs("div", { className: "session-meta", children: [_jsxs("span", { children: [session.teacher.fullName, " \u00B7 ", session.teacher.subject] }), _jsxs("span", { children: [_jsx(MapPin, { className: "h-3.5 w-3.5" }), session.room.name] })] }), _jsx(Progress, { now: session.currentLobbyCount, max: session.room.capacity, className: "mt-3" }), _jsxs("button", { type: "button", className: "btn btn--soft btn--sm mt-3", style: { width: '100%' }, onClick: () => onNavigate('lobby'), children: [t('dashboard.live.openLobby'), _jsx(ArrowLeft, { className: "h-3.5 w-3.5" })] })] }, session.id));
                                }) }))] }), _jsxs("div", { className: "stack", children: [_jsxs("div", { className: "card card-pad", children: [_jsx("h3", { className: "card-title", children: t('dashboard.attention.title') }), !shift && (_jsxs("div", { className: `attention-item ${isAdmin ? '' : 'attention-item--danger'}`, children: [_jsx("span", { className: "attention-icon", children: _jsx(AlertTriangle, { className: "h-4 w-4" }) }), _jsxs("div", { className: "body", children: [_jsx("div", { className: "title", children: t('dashboard.attention.shiftClosed.title') }), _jsx("div", { className: "desc", children: t('dashboard.attention.shiftClosed.desc') })] }), isAdmin && (_jsx("button", { type: "button", className: "btn btn--soft btn--sm", onClick: () => onNavigate('shift'), children: t('dashboard.attention.openShift') }))] })), soon && (_jsxs("div", { className: "attention-item attention-item--success", children: [_jsx("span", { className: "attention-icon", children: _jsx(Timer, { className: "h-4 w-4" }) }), _jsxs("div", { className: "body", children: [_jsx("div", { className: "title", children: soon.title }), _jsxs("div", { className: "desc", children: [t('dashboard.attention.soon.desc'), " \u2014 ", new Date(soon.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })] })] })] })), fullSessions.slice(0, 2).map((session) => (_jsxs("div", { className: "attention-item attention-item--danger", children: [_jsx("span", { className: "attention-icon", children: _jsx(Users, { className: "h-4 w-4" }) }), _jsxs("div", { className: "body", children: [_jsx("div", { className: "title", children: session.title }), _jsx("div", { className: "desc", children: t('dashboard.attention.full.desc') })] })] }, session.id))), shift && !soon && fullSessions.length === 0 && _jsx(EmptyState, { text: t('dashboard.attention.nothing') })] }), _jsxs("div", { className: "card card-pad", children: [_jsx("h3", { className: "card-title", children: t('dashboard.live.next.title') }), upcoming.length === 0 ? (_jsx(EmptyState, { text: t('dashboard.live.next.empty') })) : (upcoming.slice(0, 3).map((session) => (_jsxs("div", { className: "attention-item", children: [_jsx("span", { className: "attention-icon", children: _jsx(CalendarDays, { className: "h-4 w-4" }) }), _jsxs("div", { className: "body", children: [_jsx("div", { className: "title", children: session.title }), _jsxs("div", { className: "desc", children: [session.teacher.fullName, " \u00B7 ", new Date(session.startTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })] })] })] }, session.id))))] })] })] })] }));
}
