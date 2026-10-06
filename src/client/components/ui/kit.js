import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Signal } from 'lucide-react';
const TOAST_EVENT = 'app:toast';
export function notify(message, tone = 'success') {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, tone } }));
}
export function ToastHost() {
    const [toasts, setToasts] = useState([]);
    useEffect(() => {
        const onToast = (event) => {
            const { message, tone } = event.detail;
            const id = Date.now() + Math.random();
            setToasts((current) => [...current, { id, message, tone }]);
            window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
        };
        window.addEventListener(TOAST_EVENT, onToast);
        return () => window.removeEventListener(TOAST_EVENT, onToast);
    }, []);
    if (toasts.length === 0)
        return null;
    return (_jsx("div", { className: "toast-host", role: "status", "aria-live": "polite", children: toasts.map((toast) => (_jsxs("div", { className: `toast toast--${toast.tone}`, children: [toast.tone === 'success' ? _jsx(CheckCircle2, { className: "toast-icon h-4 w-4" }) : _jsx(AlertCircle, { className: "toast-icon h-4 w-4" }), _jsx("span", { children: toast.message })] }, toast.id))) }));
}
/* --------------------------- Shared pieces --------------------------- */
export function Avatar({ name, size = 36 }) {
    const letter = (name || '؟').trim().charAt(0);
    return _jsx("span", { className: "avatar", style: { width: size, height: size, fontSize: size * 0.42 }, "aria-hidden": "true", children: letter });
}
export function Pill({ children, tone = 'muted' }) {
    return _jsx("span", { className: `pill pill--${tone}`, children: children });
}
export function Metric({ label, value, hint, icon: Icon }) {
    return (_jsxs("div", { className: "metric", children: [_jsxs("div", { className: "metric-label", children: [Icon && _jsx(Icon, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), label] }), _jsx("div", { className: "metric-value", children: value }), hint && _jsx("div", { className: "metric-hint", children: hint }), Icon && _jsx(Icon, { className: "metric-icon", strokeWidth: 1.4, "aria-hidden": "true" })] }));
}
export function Progress({ now, max, className }) {
    const ratio = max > 0 ? Math.min(1, now / max) : 0;
    return (_jsx("div", { className: `progress ${className ?? ''}`, role: "progressbar", "aria-valuenow": Math.round(ratio * 100), "aria-valuemin": 0, "aria-valuemax": 100, children: _jsx("div", { className: `progress-track ${ratio >= 1 ? 'progress-track--full' : ''}`, style: { width: `${ratio * 100}%` } }) }));
}
export function PageHeader({ kicker, title, subtitle, actions }) {
    return (_jsxs("div", { className: "page-head", children: [_jsxs("div", { children: [_jsxs("div", { className: "page-kicker", children: [_jsx(Signal, { className: "h-3.5 w-3.5", "aria-hidden": "true" }), kicker] }), _jsx("h2", { className: "page-title", children: title }), subtitle && _jsx("p", { className: "page-sub", children: subtitle })] }), actions && _jsx("div", { className: "flex-gap", children: actions })] }));
}
export function EmptyState({ text, icon: Icon = Signal }) {
    return _jsxs("div", { className: "empty", children: [_jsx(Icon, { className: "mx-auto mb-3 h-6 w-6 opacity-50", "aria-hidden": "true" }), text] });
}
export function Banner({ text, tone }) {
    if (!text)
        return null;
    const isProblem = tone === 'error' || tone === 'warning';
    return (_jsxs("div", { className: `banner banner--${tone}`, role: isProblem ? 'alert' : 'status', children: [tone === 'success' ? _jsx(CheckCircle2, { className: "h-4 w-4 flex-none" }) : _jsx(AlertCircle, { className: "h-4 w-4 flex-none" }), _jsx("span", { children: text })] }));
}
