import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertCircle, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
export function LoadingState({ label }) {
    const { t } = useTranslation();
    return _jsxs("div", { className: "flex min-h-32 items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300", role: "status", "aria-live": "polite", children: [_jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-emerald-400" }), label || t('ui.loading')] });
}
export function EmptyState({ message }) {
    return _jsxs("div", { className: "rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400", children: [_jsx(RefreshCw, { className: "mx-auto mb-3 h-5 w-5" }), message] });
}
export function ErrorState({ message, onRetry }) {
    const { t } = useTranslation();
    return _jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200", role: "alert", children: [_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx(AlertCircle, { className: "h-5 w-5 shrink-0" }), message] }), onRetry && _jsx("button", { type: "button", onClick: onRetry, className: "rounded-lg border border-red-300/30 px-3 py-2 text-xs font-bold hover:bg-red-500/10", children: t('ui.retry') })] });
}
export function PermissionState() {
    const { t } = useTranslation();
    return _jsx("div", { className: "rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100", role: "status", children: _jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx(ShieldAlert, { className: "h-5 w-5 shrink-0" }), t('ui.adminOnly')] }) });
}
