import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Monitor, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiUrl } from '../../lib/config';
export function DeskStationBadge() {
    const { t } = useTranslation();
    const [shift, setShift] = useState(null);
    const [online, setOnline] = useState(true);
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const response = await fetch(apiUrl('/api/shifts/current'), { credentials: 'include' });
                if (cancelled)
                    return;
                if (!response.ok) {
                    setShift(null);
                    setOnline(false);
                    return;
                }
                const body = (await response.json());
                setShift(body.data?.shift ?? null);
                setOnline(true);
            }
            catch {
                if (!cancelled) {
                    setShift(null);
                    setOnline(false);
                }
            }
        };
        void load();
        const timer = window.setInterval(() => void load(), 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);
    const hasShift = shift !== null && shift !== undefined;
    return (_jsxs("div", { className: `inline-flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${hasShift ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-amber-500/20 bg-amber-500/10'}`, children: [_jsxs("span", { className: "relative flex h-2.5 w-2.5", children: [_jsx("span", { className: `absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${hasShift ? 'bg-emerald-400' : 'bg-amber-400'}` }), _jsx("span", { className: `relative inline-flex h-2.5 w-2.5 rounded-full ${hasShift ? 'bg-emerald-500' : 'bg-amber-500'}` })] }), _jsx(Monitor, { className: `h-4 w-4 ${hasShift ? 'text-emerald-400' : 'text-amber-400'}`, "aria-hidden": "true" }), _jsx("span", { className: `font-semibold ${hasShift ? 'text-emerald-300' : 'text-amber-300'}`, children: hasShift ? shift?.deskIdentifier : t('desk.noActiveShift') }), _jsx("span", { className: "hidden text-slate-400 lg:inline", children: t('desk.location') }), hasShift ? (_jsx(Wifi, { className: "h-4 w-4 text-emerald-400", "aria-label": t('desk.connected') })) : (_jsx(WifiOff, { className: `h-4 w-4 ${online ? 'hidden' : 'text-red-400'}`, "aria-label": t('desk.connected') }))] }));
}
