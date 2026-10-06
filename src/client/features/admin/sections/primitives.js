import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw } from 'lucide-react';
export function Pagination({ page, pages, total, onChange, }) {
    const { t } = useTranslation();
    if (pages <= 1)
        return null;
    return (_jsxs("div", { className: "pagination", style: { marginTop: 16 }, children: [_jsx("button", { className: "btn btn--ghost", disabled: page <= 1, onClick: () => onChange(page - 1), "aria-label": t('common.previous'), children: t('common.previous') }), _jsxs("span", { className: "page-sub", style: { padding: '0 12px' }, children: [t('common.pageOf', { page, pages }), typeof total === 'number' && ` · ${total.toLocaleString('ar-EG')}`] }), _jsx("button", { className: "btn btn--ghost", disabled: page >= pages, onClick: () => onChange(page + 1), "aria-label": t('common.next'), children: t('common.next') })] }));
}
export function FilterSelect({ id, labelKey, value, options, onChange, }) {
    const { t } = useTranslation();
    return (_jsxs("div", { children: [_jsx("label", { className: "form-label", htmlFor: id, children: t(labelKey) }), _jsx("select", { id: id, className: "form-input", value: value, onChange: (event) => onChange(event.target.value), children: options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }));
}
export function TemporaryPasswordNotice({ value }) {
    const { t } = useTranslation();
    return (_jsxs("div", { role: "status", style: {
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#78350f',
            fontSize: 13,
            display: 'grid',
            gap: 6,
        }, children: [_jsx("strong", { children: t('superAdmin.users.passwordShownOnce') }), _jsx("code", { dir: "ltr", style: { fontSize: 15, fontWeight: 700, userSelect: 'all' }, children: value }), _jsx("span", { style: { fontSize: 12 }, children: t('superAdmin.users.passwordHandOver') })] }));
}
export function SectionHeader({ titleKey, subtitleKey, onRefresh, actions, }) {
    const { t } = useTranslation();
    return (_jsxs("div", { className: "page-header", style: { marginBottom: 20 }, children: [_jsxs("div", { children: [_jsx("h2", { className: "page-title", style: { fontSize: 20 }, children: t(titleKey) }), subtitleKey && _jsx("p", { className: "page-sub", children: t(subtitleKey) })] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [actions, onRefresh && (_jsx("button", { className: "btn btn--ghost", onClick: onRefresh, "aria-label": t('common.refresh'), title: t('common.refresh'), children: _jsx(RefreshCw, { className: "h-4 w-4" }) }))] })] }));
}
export function LoadingBlock({ labelKey }) {
    const { t } = useTranslation();
    return (_jsx("div", { style: { padding: 32, textAlign: 'center' }, children: _jsx("span", { className: "page-sub", children: t(labelKey) }) }));
}
export function EmptyBlock({ labelKey }) {
    const { t } = useTranslation();
    return (_jsx("div", { style: { padding: 24, textAlign: 'center' }, children: _jsx("span", { className: "page-sub", children: t(labelKey) }) }));
}
export function ErrorBlock({ labelKey, onRetry }) {
    const { t } = useTranslation();
    return (_jsxs("div", { role: "alert", style: {
            background: 'var(--color-danger-bg, #fef2f2)',
            border: '1px solid var(--color-danger-border, #fecaca)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            color: 'var(--color-danger-text, #991b1b)',
            fontSize: 13,
        }, children: [_jsx(AlertTriangle, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("span", { style: { flex: 1 }, children: t(labelKey) }), onRetry && (_jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px' }, onClick: onRetry, children: t('common.retry') }))] }));
}
export function NoticeBlock({ labelKey, tone = 'warning' }) {
    const { t } = useTranslation();
    const styles = tone === 'warning'
        ? { background: '#fffbeb', border: '1px solid #fde68a', color: '#78350f' }
        : { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' };
    return (_jsxs("div", { style: { ...styles, borderRadius: 12, padding: '10px 16px', marginBottom: 16, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx(AlertTriangle, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("span", { children: t(labelKey) })] }));
}
export function SectionTable({ labelKey, headers, children, colSpan, emptyKey = 'common.empty', }) {
    const { t } = useTranslation();
    return (_jsx("div", { className: "table-wrapper", role: "region", "aria-label": t(labelKey), children: _jsxs("table", { className: "data-table", "aria-label": t(labelKey), children: [_jsx("thead", { children: _jsx("tr", { children: headers.map((headerKey) => (_jsx("th", { scope: "col", children: t(headerKey) }, headerKey))) }) }), _jsx("tbody", { children: children ?? (_jsx("tr", { children: _jsx("td", { colSpan: colSpan, style: { textAlign: 'center', padding: 24 }, children: _jsx("span", { className: "page-sub", children: t(emptyKey) }) }) })) })] }) }));
}
