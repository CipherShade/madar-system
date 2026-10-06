import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, File, FileSpreadsheet, FileText, Image, Trash2, UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
function iconFor(file) {
    if (file.type.startsWith('image/'))
        return Image;
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))
        return FileSpreadsheet;
    if (file.type === 'application/pdf')
        return FileText;
    return File;
}
export function DataMigrationPage() {
    const { t } = useTranslation();
    const [step, setStep] = useState('intro');
    const [files, setFiles] = useState([]);
    const [processIndex, setProcessIndex] = useState(0);
    const [prepared, setPrepared] = useState(false);
    const inputRef = useRef(null);
    const processSteps = t('dataMigration.steps', { returnObjects: true });
    useEffect(() => {
        if (step !== 'processing')
            return;
        setProcessIndex(0);
        const timer = window.setInterval(() => setProcessIndex((index) => {
            if (index >= processSteps.length - 1) {
                window.clearInterval(timer);
                setStep('review');
                return index;
            }
            return index + 1;
        }), 650);
        return () => window.clearInterval(timer);
    }, [step, processSteps.length]);
    const addFiles = (selected) => {
        if (!selected)
            return;
        setFiles((existing) => [...existing, ...Array.from(selected).map((file) => ({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, type: file.type }))]);
    };
    const formatSize = (size) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 1 }).format(size / 1024 / 1024) + ' MB';
    const panelStyle = { maxWidth: 920, margin: '0 auto', display: 'grid', gap: 20 };
    const cardStyle = { background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16, padding: 'clamp(20px, 4vw, 36px)' };
    return _jsxs("div", { className: "page", dir: "rtl", style: panelStyle, children: [step === 'intro' && _jsxs("section", { style: cardStyle, children: [_jsxs("span", { className: "page-kicker", children: [_jsx(Bot, { className: "h-4 w-4" }), " AI Data Migration"] }), _jsx("h1", { className: "page-title", style: { marginTop: 12 }, children: t('dataMigration.title') }), _jsx("p", { className: "page-sub", style: { maxWidth: 640, marginTop: 10 }, children: t('dataMigration.intro') }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '22px 0' }, children: ['صور الدفاتر', 'PDF', 'Excel', 'CSV', 'Documents'].map((item) => _jsx("span", { className: "pill pill--neutral", children: item }, item)) }), _jsx("button", { type: "button", className: "btn btn--primary", onClick: () => setStep('upload'), children: t('dataMigration.start') })] }), step === 'upload' && _jsxs("section", { style: cardStyle, children: [_jsx("h1", { className: "page-title", children: t('dataMigration.title') }), _jsx("input", { ref: inputRef, type: "file", multiple: true, hidden: true, accept: "image/*,.pdf,.csv,.xls,.xlsx,.doc,.docx", onChange: (event) => addFiles(event.target.files) }), _jsxs("button", { type: "button", onClick: () => inputRef.current?.click(), style: { width: '100%', border: '2px dashed var(--primary, #0e7c56)', borderRadius: 14, padding: 32, background: 'var(--bg-muted, #f8fafc)', color: 'inherit', cursor: 'pointer' }, children: [_jsx(UploadCloud, { className: "h-8 w-8", style: { color: 'var(--primary, #0e7c56)', margin: '0 auto 10px' } }), _jsx("b", { children: t('dataMigration.dropTitle') }), _jsx("small", { style: { display: 'block', marginTop: 8, color: 'var(--text-secondary, #64748b)' }, children: t('dataMigration.dropHint') })] }), _jsx("div", { style: { display: 'grid', gap: 8, marginTop: 18 }, children: files.map((file) => { const Icon = iconFor(file); return _jsxs("div", { className: "card", style: { padding: 12, display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx(Icon, { className: "h-5 w-5" }), _jsxs("span", { style: { flex: 1 }, children: [_jsx("b", { children: file.name }), _jsxs("small", { style: { display: 'block' }, children: [formatSize(file.size), " \u00B7 ", file.type || 'Document'] })] }), _jsxs("span", { className: "pill pill--success", children: [_jsx(Check, { className: "h-3 w-3" }), " ", t('dataMigration.ready')] }), _jsx("button", { type: "button", className: "icon-btn", "aria-label": t('dataMigration.remove'), onClick: () => setFiles((all) => all.filter((item) => item.id !== file.id)), children: _jsx(Trash2, { className: "h-4 w-4" }) })] }, file.id); }) }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 20 }, children: [_jsx("button", { type: "button", className: "btn btn--secondary", onClick: () => setStep('intro'), children: t('dataMigration.back') }), _jsx("button", { type: "button", className: "btn btn--primary", disabled: !files.length, onClick: () => setStep('processing'), children: t('dataMigration.continue') })] })] }), step === 'processing' && _jsxs("section", { style: cardStyle, children: [_jsx("h1", { className: "page-title", children: t('dataMigration.processingTitle') }), _jsx("p", { className: "page-sub", children: t('dataMigration.processingNote') }), _jsx("div", { style: { display: 'grid', gap: 14, marginTop: 28 }, children: processSteps.map((label, index) => _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, color: index <= processIndex ? 'var(--primary, #0e7c56)' : 'var(--text-secondary, #64748b)', fontWeight: index === processIndex ? 800 : 600 }, children: [index < processIndex ? _jsx(Check, { className: "h-5 w-5" }) : _jsx("span", { style: { width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor', display: 'inline-grid', placeItems: 'center' }, children: index === processIndex && '•' }), label] }, label)) })] }), step === 'review' && _jsxs("section", { style: cardStyle, children: [_jsx("h1", { className: "page-title", children: t('dataMigration.reviewTitle') }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' }, children: [['١٬٨٤٧', t('dataMigration.students')], ['١٬٧٩٢', t('dataMigration.recognized')], ['٤٣', t('dataMigration.needsReview')], ['١٢', t('dataMigration.duplicates')]].map(([value, label]) => _jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("b", { style: { fontSize: 22 }, children: value }), _jsx("small", { style: { display: 'block' }, children: label })] }, label)) }), _jsx("div", { style: { overflowX: 'auto' }, children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsx("tr", { children: ['student', 'phone', 'grade', 'status'].map((key) => _jsx("th", { children: t(`dataMigration.${key}`) }, key)) }) }), _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("td", { children: "\u0623\u062D\u0645\u062F \u0645\u062D\u0645\u062F" }), _jsx("td", { dir: "ltr", children: "010\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }), _jsx("td", { children: "3 \u062B\u0627\u0646\u0648\u064A" }), _jsx("td", { children: _jsx("span", { className: "pill pill--success", children: t('dataMigration.readyStatus') }) })] }), _jsxs("tr", { children: [_jsx("td", { children: "\u0645\u062D\u0645\u062F \u0639\u0644\u064A" }), _jsx("td", { dir: "ltr", children: "011\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" }), _jsx("td", { children: "2 \u062B\u0627\u0646\u0648\u064A" }), _jsx("td", { children: _jsx("span", { className: "pill pill--warning", children: t('dataMigration.reviewStatus') }) })] })] })] }) }), _jsx("button", { type: "button", className: "btn btn--primary", style: { marginTop: 20 }, onClick: () => setStep('import'), children: t('dataMigration.continue') })] }), step === 'import' && _jsxs("section", { style: cardStyle, children: [_jsx("h1", { className: "page-title", children: t('dataMigration.importTitle') }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, margin: '20px 0' }, children: [['١٬٨٤٧', 'students'], ['٣٢', 'teachers'], ['٨٬٤٢١', 'payments'], ['١٢', 'duplicates'], ['٠', 'reviewCount']].map(([value, key]) => _jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("b", { style: { fontSize: 22 }, children: value }), _jsx("small", { style: { display: 'block' }, children: t(`dataMigration.${key}`) })] }, key)) }), _jsx("button", { type: "button", className: "btn btn--primary", onClick: () => setPrepared(true), children: t('dataMigration.import') }), prepared && _jsx("p", { className: "notice notice--info", style: { marginTop: 16 }, children: t('dataMigration.prepared') })] })] });
}
