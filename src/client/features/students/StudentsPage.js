import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Pencil, Plus, Search, Save, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { Avatar, Banner, EmptyState, PageHeader, Pill, notify } from '../../components/ui/kit';
const emptyForm = { fullName: '', studentPhone: '', guardianPhone: '', academicStage: '', schoolType: 'GENERAL', notes: '' };
const SCHOOL_TONE = { GENERAL: 'primary', LANGUAGES: 'accent', AZHAR: 'muted' };
export function StudentsPage() {
    const { t } = useTranslation();
    const { hasRole } = useAuth();
    const [students, setStudents] = useState([]);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState('');
    const load = async (value = search) => {
        try {
            setStudents((await api(`/registry/students?search=${encodeURIComponent(value)}`)).students);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('students.loadError'));
        }
    };
    useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [search]);
    const startEdit = (student) => {
        setEditingId(student.id);
        setForm({ fullName: student.fullName, studentPhone: student.studentPhone || '', guardianPhone: student.guardianPhone, academicStage: student.academicStage, schoolType: student.schoolType, notes: student.notes || '' });
    };
    const remove = async (id) => {
        if (!window.confirm(t('students.confirmDelete')))
            return;
        try {
            await api(`/registry/students/${id}`, { method: 'DELETE' });
            notify(t('management.delete'));
            await load();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('students.deleteError'));
        }
    };
    return (_jsxs("section", { children: [_jsx(PageHeader, { kicker: t('navigation.groups.registries'), title: t('students.title'), subtitle: t('students.sectionLabel'), actions: hasRole('ADMIN', 'RECEPTIONIST') && (_jsxs("button", { type: "button", className: "btn btn--primary", onClick: () => { setEditingId(null); setForm(emptyForm); }, children: [_jsx(Plus, { className: "h-4 w-4" }), t('students.quickAdd')] })) }), _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "searchbar", style: { marginBottom: 16 }, children: [_jsx(Search, { className: "h-4 w-4" }), _jsx("input", { className: "input", value: search, onChange: (event) => setSearch(event.target.value), placeholder: t('students.search') })] }), form && _jsx(StudentForm, { form: form, id: editingId, onChange: setForm, onDone: () => { setForm(null); void load(); }, onCancel: () => setForm(null) }), students.length === 0 ? (_jsx(EmptyState, { text: t('students.empty') })) : (_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsx("tr", { children: ['code', 'name', 'phone', 'stage', 'school', 'actions'].map((key) => _jsx("th", { children: t(`students.table.${key}`) }, key)) }) }), _jsx("tbody", { children: students.map((student) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("span", { className: "cell-mono", children: student.studentCode }) }), _jsx("td", { children: _jsxs("div", { className: "flex-gap", children: [_jsx(Avatar, { name: student.fullName, size: 30 }), _jsx("span", { style: { fontWeight: 700 }, children: student.fullName })] }) }), _jsx("td", { className: "cell-muted", children: student.guardianPhone || '—' }), _jsx("td", { children: student.academicStage || '—' }), _jsx("td", { children: _jsx(Pill, { tone: SCHOOL_TONE[student.schoolType] ?? 'muted', children: t(`students.school.${(student.schoolType || 'GENERAL').toLowerCase()}`) }) }), _jsx("td", { children: _jsxs("div", { className: "flex-gap", children: [_jsxs("button", { type: "button", className: "btn btn--ghost btn--sm", onClick: () => startEdit(student), children: [_jsx(Pencil, { className: "h-3.5 w-3.5" }), t('management.edit')] }), _jsx("button", { type: "button", className: "btn btn--danger-soft btn--sm", onClick: () => void remove(student.id), children: _jsx(Trash2, { className: "h-3.5 w-3.5" }) })] }) })] }, student.id))) })] }) }))] }));
}
function StudentForm({ form, id, onChange, onDone, onCancel }) {
    const { t } = useTranslation();
    const [error, setError] = useState('');
    const set = (key, value) => onChange({ ...form, [key]: value });
    async function submit(event) {
        event.preventDefault();
        try {
            await api(`/registry/students${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
            notify(id ? t('management.save') : t('students.quickAdd'));
            onDone();
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : t('students.saveError'));
        }
    }
    return (_jsxs("form", { onSubmit: submit, className: "card card-pad", style: { marginBottom: 16, borderColor: 'color-mix(in srgb, var(--primary) 30%, var(--border))' }, children: [_jsxs("div", { className: "flex-between", style: { marginBottom: 14 }, children: [_jsx("h3", { className: "card-title", style: { margin: 0 }, children: id ? t('students.edit') : t('students.quickAdd') }), _jsx("button", { type: "button", className: "icon-btn", onClick: onCancel, "aria-label": t('actions.close'), children: _jsx(X, { className: "h-4 w-4" }) })] }), error && _jsx(Banner, { text: error, tone: "error" }), _jsxs("div", { className: "form-grid", children: [_jsx(Field, { label: t('students.form.name'), value: form.fullName, onChange: (value) => set('fullName', value), required: true }), _jsx(Field, { label: t('students.form.studentPhone'), value: form.studentPhone || '', onChange: (value) => set('studentPhone', value) }), _jsx(Field, { label: t('students.form.guardianPhone'), value: form.guardianPhone, onChange: (value) => set('guardianPhone', value), required: true }), _jsx(Field, { label: t('students.form.stage'), value: form.academicStage, onChange: (value) => set('academicStage', value), required: true }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: t('students.form.school') }), _jsxs("select", { className: "select", value: form.schoolType, onChange: (event) => set('schoolType', event.target.value), children: [_jsx("option", { value: "GENERAL", children: t('students.school.general') }), _jsx("option", { value: "LANGUAGES", children: t('students.school.languages') }), _jsx("option", { value: "AZHAR", children: t('students.school.azhar') })] })] }), _jsx(Field, { label: t('students.notes'), value: form.notes, onChange: (value) => set('notes', value) })] }), _jsxs("button", { className: "btn btn--primary mt-4", children: [_jsx(Save, { className: "h-4 w-4" }), t('students.save')] })] }));
}
function Field({ label, value, onChange, required }) {
    return (_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: label }), _jsx("input", { className: "input", required: required, value: value, onChange: (event) => onChange(event.target.value) })] }));
}
