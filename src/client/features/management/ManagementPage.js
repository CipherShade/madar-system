import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Building2, Pencil, Phone, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api, money } from '../../lib/api';
import { Banner, PageHeader, Pill, notify } from '../../components/ui/kit';
export function ManagementPage({ mode }) {
    const { t } = useTranslation();
    const { hasRole } = useAuth();
    const isAdmin = hasRole('ADMIN');
    const [rooms, setRooms] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const load = async () => {
        try {
            if (mode === 'rooms')
                setRooms((await api('/management/rooms')).rooms);
            else
                setTeachers((await api('/management/teachers')).teachers);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('management.loadError'));
        }
    };
    useEffect(() => { void load(); setEditing(null); }, [mode]);
    const remove = async (path, id) => {
        if (!window.confirm(t('management.confirmDelete')))
            return;
        try {
            await api(`${path}/${id}`, { method: 'DELETE' });
            notify(t('management.delete'));
            await load();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('management.deleteError'));
        }
    };
    const path = mode === 'rooms' ? '/management/rooms' : '/management/teachers';
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.registries'), title: t(`management.${mode}.title`), subtitle: t('management.sectionLabel'), actions: isAdmin && (_jsxs("button", { type: "button", className: "btn btn--primary", onClick: () => setEditing('new'), children: [_jsx(Plus, { className: "h-4 w-4" }), t('management.add')] })) }), _jsx(Banner, { text: error, tone: "error" }), editing && isAdmin && (_jsx(ManagementForm, { mode: mode, id: editing === 'new' ? null : editing, room: rooms.find((item) => item.id === editing), teacher: teachers.find((item) => item.id === editing), onDone: () => { setEditing(null); void load(); }, onCancel: () => setEditing(null) })), mode === 'rooms' ? (rooms.length === 0 ? _jsx("div", { className: "empty", children: t('management.loadError') }) : (_jsx("div", { className: "session-grid", children: rooms.map((room) => (_jsxs("article", { className: "card", style: { padding: 16 }, children: [_jsxs("div", { className: "session-top", children: [_jsx("span", { className: "session-title", children: room.name }), _jsxs(Pill, { tone: room.isActive ? 'success' : 'muted', children: [_jsx("span", { className: "dot" }), room.isActive ? t('status.active') : t('status.inactive')] })] }), _jsxs("div", { className: "session-meta", style: { marginTop: 10 }, children: [_jsxs("span", { children: [_jsx(Building2, { className: "h-3.5 w-3.5" }), t('management.rooms.capacity'), ": ", room.capacity] }), _jsx("span", { children: room.floor || t('management.rooms.noFloor') })] }), isAdmin && (_jsxs("div", { className: "session-foot", style: { marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }, children: [_jsxs("button", { type: "button", className: "btn btn--ghost btn--sm", onClick: () => setEditing(room.id), children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), t('management.edit')] }), _jsx("button", { type: "button", className: "btn btn--danger-soft btn--sm", onClick: () => void remove(path, room.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }))] }, room.id))) }))) : (_jsx("div", { className: "lobby-grid", style: { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }, children: teachers.map((teacher) => (_jsxs("article", { className: "card", style: { padding: 16 }, children: [_jsxs("div", { className: "session-top", children: [_jsxs("div", { className: "flex-gap", children: [_jsx("span", { className: "brand-logo", style: { width: 36, height: 36, fontSize: 16 }, children: teacher.fullName?.charAt(0) || '' }), _jsx("span", { className: "session-title", children: teacher.fullName })] }), _jsxs(Pill, { tone: teacher.isActive ? 'success' : 'muted', children: [_jsx("span", { className: "dot" }), teacher.isActive ? t('status.active') : t('status.inactive')] })] }), _jsxs("div", { className: "session-meta", style: { marginTop: 10 }, children: [_jsxs("span", { children: [_jsx(UserRound, { className: "h-3.5 w-3.5" }), teacher.subject] }), _jsxs("span", { children: [_jsx(Phone, { className: "h-3.5 w-3.5" }), teacher.phoneNumber] }), _jsxs("span", { children: [t('management.teachers.fee'), ": ", _jsx("b", { className: "mono", children: money(Number(teacher.defaultCenterFee), 'ar-EG') })] }), teacher.assistantName && _jsxs("span", { className: "muted", children: [t('management.teachers.assistant'), ": ", teacher.assistantName, teacher.assistantPhone ? ` · ${teacher.assistantPhone}` : ''] })] }), isAdmin && (_jsxs("div", { className: "session-foot", style: { marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }, children: [_jsxs("button", { type: "button", className: "btn btn--ghost btn--sm", onClick: () => setEditing(teacher.id), children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), t('management.edit')] }), _jsx("button", { type: "button", className: "btn btn--danger-soft btn--sm", onClick: () => void remove(path, teacher.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }))] }, teacher.id))) }))] }));
}
function ManagementForm({ mode, id, room, teacher, onDone, onCancel }) {
    const { t } = useTranslation();
    const [values, setValues] = useState(() => mode === 'rooms'
        ? { name: room?.name || '', capacity: room?.capacity || 30, floor: room?.floor || '' }
        : { fullName: teacher?.fullName || '', phoneNumber: teacher?.phoneNumber || '', subject: teacher?.subject || '', defaultCenterFee: teacher?.defaultCenterFee || 0, assistantName: teacher?.assistantName || '', assistantPhone: teacher?.assistantPhone || '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const change = (key, value) => setValues((current) => ({ ...current, [key]: key === 'capacity' || key === 'defaultCenterFee' ? Number(value) : value }));
    async function submit(event) {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            await api(`${mode === 'rooms' ? '/management/rooms' : '/management/teachers'}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
            notify(t('management.save'));
            onDone();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('management.saveError'));
        }
        finally {
            setSaving(false);
        }
    }
    const fields = mode === 'rooms'
        ? [['name', t('management.rooms.name')], ['capacity', t('management.rooms.capacity')], ['floor', t('management.rooms.floor')]]
        : [['fullName', t('management.teachers.name')], ['phoneNumber', t('management.teachers.phone')], ['subject', t('management.teachers.subject')], ['defaultCenterFee', t('management.teachers.fee')], ['assistantName', t('management.teachers.assistant')], ['assistantPhone', t('management.teachers.assistantPhone')]];
    return (_jsxs("form", { onSubmit: submit, className: "card card-pad", style: { marginBottom: 16, borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }, children: [_jsxs("div", { className: "flex-between", style: { marginBottom: 14 }, children: [_jsx("h3", { className: "card-title", style: { margin: 0 }, children: id ? t('management.edit') : t('management.add') }), _jsx("button", { type: "button", className: "icon-btn", onClick: onCancel, "aria-label": t('actions.close'), children: _jsx(X, { className: "h-4 w-4" }) })] }), error && _jsx(Banner, { text: error, tone: "error" }), _jsx("div", { className: "form-grid", children: fields.map(([key, label]) => (_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: label }), _jsx("input", { className: "input", required: key !== 'floor' && key !== 'assistantName' && key !== 'assistantPhone', type: key === 'capacity' || key === 'defaultCenterFee' ? 'number' : key.toLowerCase().includes('phone') ? 'tel' : 'text', min: key === 'capacity' ? 1 : key === 'defaultCenterFee' ? 0 : undefined, step: key === 'defaultCenterFee' ? '0.01' : undefined, value: values[key], onChange: (event) => change(key, event.target.value) })] }, key))) }), _jsxs("button", { disabled: saving, className: "btn btn--primary mt-4", children: [_jsx(Save, { className: "h-4 w-4" }), saving ? t('management.saving') : t('management.save')] })] }));
}
