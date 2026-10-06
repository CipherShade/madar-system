import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronDown, Languages, LogOut, Palette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { Avatar, notify } from '../ui/kit';
import { THEMES, getStoredTheme, storeTheme } from '../ui/theme';
const CENTER_NAME = import.meta.env.VITE_CENTER_NAME || '';
export function Header({ activeLabel }) {
    const { t, i18n } = useTranslation();
    const { user, logout } = useAuth();
    const isArabic = i18n.language === 'ar';
    const [menuOpen, setMenuOpen] = useState(false);
    const [theme, setTheme] = useState(getStoredTheme);
    const menuRef = useRef(null);
    useEffect(() => {
        const onPointer = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target))
                setMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        return () => document.removeEventListener('mousedown', onPointer);
    }, []);
    const switchTheme = (next) => {
        setTheme(next);
        storeTheme(next);
    };
    const handleLogout = () => { void logout(); notify(t('actions.signOut') + ' ✓', 'success'); };
    const centerDisplayName = user?.tenant?.name || CENTER_NAME || t('center');
    return (_jsxs("header", { className: "header", children: [_jsxs("div", { className: "header-group", children: [_jsxs("div", { className: "brand", children: [_jsx("span", { className: "brand-logo", children: "\u0645" }), _jsxs("div", { style: { minWidth: 0 }, children: [_jsx("div", { className: "brand-name", children: t('appName') }), _jsx("div", { className: "brand-sub", children: centerDisplayName })] })] }), _jsxs("div", { className: "center-chip", "aria-hidden": isArabic ? undefined : 'true', style: { marginInlineStart: 8 }, children: [_jsx("span", { className: "dot" }), t('desk.connected')] })] }), _jsxs("div", { className: "breadcrumb", style: { marginInlineStart: 12 }, children: [_jsx("span", { children: t('appName') }), _jsx("span", { "aria-hidden": "true", children: "/" }), _jsx("b", { children: activeLabel })] }), _jsxs("div", { className: "header-actions", children: [_jsxs("button", { type: "button", className: "btn btn--ghost btn--sm", onClick: () => i18n.changeLanguage(isArabic ? 'en' : 'ar'), "aria-label": t('actions.switchLanguage'), children: [_jsx(Languages, { className: "h-4 w-4" }), isArabic ? t('languages.en') : t('languages.ar')] }), _jsxs("div", { className: "theme-dots", role: "group", "aria-label": t('theme.toggle'), title: t('theme.toggle'), children: [_jsx(Palette, { className: "h-4 w-4", style: { color: 'var(--text-muted)' }, "aria-hidden": "true" }), THEMES.map((name) => (_jsx("button", { type: "button", className: `theme-dot theme-dot--${name} ${theme === name ? 'theme-dot--active' : ''}`, onClick: () => switchTheme(name), "aria-label": t(`theme.${name}`), title: t(`theme.${name}`) }, name)))] }), _jsxs("div", { className: "user-menu", ref: menuRef, children: [_jsxs("button", { type: "button", className: "user-trigger", onClick: () => setMenuOpen((value) => !value), "aria-expanded": menuOpen, "aria-haspopup": "menu", children: [_jsxs("div", { className: "meta", style: { marginInlineEnd: 4 }, children: [_jsx("div", { className: "name", children: user?.fullName || user?.username }), _jsx("div", { className: "role", children: t(`roleName.${user?.role.toLowerCase()}`) })] }), _jsx(Avatar, { name: user?.fullName || '•', size: 32 }), _jsx(ChevronDown, { className: "h-3.5 w-3.5", style: { color: 'var(--text-muted)' }, "aria-hidden": "true" })] }), menuOpen && (_jsxs("div", { className: "user-dropdown", role: "menu", children: [_jsxs("div", { className: "dd-header", children: [_jsx("div", { className: "name", children: user?.fullName }), _jsxs("div", { className: "role", children: [t(`roleName.${user?.role.toLowerCase()}`), " \u00B7 @", user?.username] })] }), _jsxs("button", { type: "button", className: "dd-item dd-item--danger", role: "menuitem", onClick: handleLogout, children: [_jsx(LogOut, { className: "h-4 w-4", "aria-hidden": "true" }), t('actions.signOut')] })] }))] })] })] }));
}
