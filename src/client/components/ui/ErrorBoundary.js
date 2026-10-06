import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
function Fallback() {
    const { t } = useTranslation();
    return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-slate-100", children: [_jsx(AlertTriangle, { className: "h-10 w-10 text-amber-400", "aria-hidden": "true" }), _jsx("h1", { className: "text-xl font-bold text-white", children: t('ui.fatal') }), _jsx("p", { className: "text-sm text-slate-400", children: t('ui.fatalDetail') }), _jsx("button", { type: "button", onClick: () => window.location.reload(), className: "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold", children: t('ui.retry') })] }));
}
export class ErrorBoundary extends Component {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error, info) {
        console.error('ErrorBoundary caught an error:', error, info);
    }
    render() {
        if (this.state.hasError)
            return _jsx(Fallback, {});
        return this.props.children;
    }
}
