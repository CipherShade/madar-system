import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../../lib/config';
const alertStyles = {
    success: { icon: CheckCircle2, className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200' },
    warning: { icon: AlertTriangle, className: 'border-amber-500/25 bg-amber-500/10 text-amber-200' },
    info: { icon: Info, className: 'border-sky-500/25 bg-sky-500/10 text-sky-200' },
};
export function StatusAlerts() {
    const { t } = useTranslation();
    const [state, setState] = useState('loading');
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        let cancelled = false;
        const check = async () => {
            try {
                const response = await fetch(apiUrl('/api/health'), { credentials: 'include' });
                if (!cancelled)
                    setState(response.ok ? 'ok' : 'down');
            }
            catch {
                if (!cancelled)
                    setState('down');
            }
        };
        void check();
        const timer = window.setInterval(() => void check(), 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);
    if (state === 'loading' || !visible)
        return null;
    const kind = state === 'ok' ? 'success' : 'warning';
    const { icon: Icon, className } = alertStyles[kind];
    return (_jsxs("div", { className: `flex items-start gap-3 rounded-xl border p-4 ${className}`, role: "status", children: [_jsx(Icon, { className: "mt-0.5 h-5 w-5 shrink-0", "aria-hidden": "true" }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-bold", children: state === 'ok' ? t('alerts.title') : t('alerts.unavailable') }), _jsx("p", { className: "mt-1 text-sm opacity-90", children: state === 'ok' ? t('alerts.message') : t('alerts.unavailableMessage') })] }), _jsx("button", { type: "button", onClick: () => setVisible(false), className: "rounded-lg p-1 opacity-70 transition hover:bg-white/10 hover:opacity-100", "aria-label": t('actions.dismiss'), children: _jsx(X, { className: "h-4 w-4", "aria-hidden": "true" }) })] }));
}
