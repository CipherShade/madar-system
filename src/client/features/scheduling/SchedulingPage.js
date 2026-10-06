import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Clock3, MapPin, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { Banner, EmptyState, PageHeader, Pill, Progress, notify } from '../../components/ui/kit';
const GROUP_KEYS = ['now', 'upcoming', 'completed'];
const STATUS_GROUPS = {
    active: 'now',
    scheduled: 'upcoming',
    completed: 'completed',
};
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
export function SchedulingPage({ onCheckIn }) {
    const { t } = useTranslation();
    const { hasRole } = useAuth();
    const isAdmin = hasRole('ADMIN');
    const [sessions, setSessions] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [error, setError] = useState('');
    const load = async () => {
        try {
            const [sessionData, teacherData, roomData] = await Promise.all([
                api('/scheduling/sessions'),
                api('/management/teachers'),
                api('/management/rooms'),
            ]);
            setSessions(sessionData.sessions);
            setTeachers(teacherData.teachers);
            setRooms(roomData.rooms);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('scheduling.loadError'));
        }
    };
    useEffect(() => { void load(); }, []);
    const groups = useMemo(() => {
        const now = new Date().getTime();
        const bucket = { now: [], upcoming: [], completed: [] };
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
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.operation'), title: t('scheduling.title'), subtitle: `${t('timeline.dateLabel')} — ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}`, actions: isAdmin && (_jsxs("button", { type: "button", className: "btn btn--primary", onClick: () => setShowForm((value) => !value), children: [_jsx(CalendarPlus, { className: "h-4 w-4" }), t('scheduling.add')] })) }), _jsx(Banner, { text: error, tone: "error" }), _jsx("div", { className: "summary-strip", children: summary.map((item) => (_jsxs("div", { className: "summary-cell", children: [_jsx("div", { className: "num", children: item.value }), _jsx("div", { className: "lbl", children: t(`timeline.summary.${item.key}`) })] }, item.key))) }), showForm && isAdmin && _jsx(SessionForm, { teachers: teachers, rooms: rooms, onDone: () => { setShowForm(false); void load(); } }), sessions.length === 0 ? (_jsx(EmptyState, { text: t('timeline.empty') })) : (_jsx("div", { className: "stack", children: GROUP_KEYS.map((key) => {
                    const items = groups[key];
                    if (items.length === 0)
                        return null;
                    return (_jsxs("div", { className: `tl-group tl-group--${key}`, children: [_jsxs("div", { className: "tl-group-title", children: [_jsx("span", { className: "tl-dot" }), t(`timeline.groups.${key}`), _jsx("span", { className: "pill pill--muted", children: items.length })] }), _jsx("div", { className: "stack", style: { gap: 8 }, children: items.map((session) => {
                                    const ratio = session.room.capacity > 0 ? session.currentLobbyCount / session.room.capacity : 0;
                                    const tone = key === 'now' ? (ratio >= 1 ? 'danger' : 'primary') : key === 'upcoming' ? 'accent' : 'muted';
                                    return (_jsxs("div", { className: `tl-item tl-item--${key}`, children: [_jsxs("div", { className: "tl-time", children: [_jsx("div", { children: time(session.startTime) }), _jsx("div", { className: "muted", style: { fontSize: 10 }, children: session.room.capacity })] }), _jsxs("div", { className: "tl-main", children: [_jsx("div", { className: "tl-title", children: session.title }), _jsxs("div", { className: "tl-meta", children: [_jsxs("span", { children: [session.teacher.fullName, " \u00B7 ", session.teacher.subject] }), _jsxs("span", { children: [_jsx(MapPin, { className: "h-3 w-3" }), session.room.name] }), key === 'now' && _jsxs("span", { className: "pill pill--muted", children: [t('timeline.attended'), ": ", session.currentLobbyCount, "/", session.room.capacity] })] })] }), key === 'now' && (_jsx("div", { style: { width: 'min(120px, 100%)' }, children: _jsx(Progress, { now: session.currentLobbyCount, max: session.room.capacity }) })), _jsx(Pill, { tone: tone, children: t(`status.${session.status.toLowerCase()}`) }), key === 'now' && (_jsx("button", { type: "button", className: "btn btn--soft btn--sm", onClick: () => onCheckIn(session.id), children: t('timeline.checkInFromList') }))] }, session.id));
                                }) })] }, key));
                }) }))] }));
}
function SessionForm({ teachers, rooms, onDone }) {
    const { t } = useTranslation();
    const [form, setForm] = useState({ teacherId: teachers[0]?.id || '', roomId: rooms[0]?.id || '', title: '', academicStage: '', startTime: '', endTime: '', sessionPrice: '100', centerFeePerStudent: '20' });
    const [error, setError] = useState('');
    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    async function submit(event) {
        event.preventDefault();
        try {
            await api('/scheduling/sessions', {
                method: 'POST',
                body: JSON.stringify({ ...form, sessionPrice: Number(form.sessionPrice), centerFeePerStudent: Number(form.centerFeePerStudent), startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString() }),
            });
            notify(t('scheduling.save'));
            onDone();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('scheduling.saveError'));
        }
    }
    const fields = [['title', t('scheduling.form.title')], ['academicStage', t('scheduling.form.stage')], ['startTime', t('scheduling.form.start')], ['endTime', t('scheduling.form.end')], ['sessionPrice', t('scheduling.form.price')], ['centerFeePerStudent', t('scheduling.form.fee')]];
    return (_jsxs("form", { onSubmit: submit, className: "card card-pad", children: [error && _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('scheduling.form.teacher') }), _jsx("select", { className: "select", value: form.teacherId, onChange: (event) => set('teacherId', event.target.value), children: teachers.map((item) => _jsx("option", { value: item.id, children: item.fullName }, item.id)) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('scheduling.form.room') }), _jsx("select", { className: "select", value: form.roomId, onChange: (event) => set('roomId', event.target.value), children: rooms.map((item) => _jsx("option", { value: item.id, children: item.name }, item.id)) })] }), fields.map(([key, label]) => (_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: label }), _jsx("input", { className: "input", required: true, type: key.includes('Time') ? 'datetime-local' : key === 'sessionPrice' || key === 'centerFeePerStudent' ? 'number' : 'text', min: key === 'sessionPrice' || key === 'centerFeePerStudent' ? 0 : undefined, step: key === 'sessionPrice' || key === 'centerFeePerStudent' ? '0.01' : undefined, value: form[key], onChange: (event) => set(key, event.target.value) })] }, key)))] }), _jsxs("div", { className: "flex-gap mt-4", children: [_jsxs("button", { className: "btn btn--primary", children: [_jsx(Save, { className: "h-4 w-4" }), t('scheduling.save')] }), _jsxs("span", { className: "flex-gap muted", style: { fontSize: 12.5 }, children: [_jsx(Clock3, { className: "h-4 w-4" }), t('scheduling.form.start')] })] })] }));
}
