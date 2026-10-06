import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { navigationGroups } from '../../features/navigation/navigationItems';
function groupForRoleGroup(group, role) {
    return { ...group, items: group.items.filter((item) => item.roles.includes(role)) };
}
export function Sidebar({ activeId, onSelect, role }) {
    const { t } = useTranslation();
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cos_sidebar') === 'collapsed');
    const [open, setOpen] = useState(false);
    const toggleCollapsed = () => {
        const next = !collapsed;
        setCollapsed(next);
        localStorage.setItem('cos_sidebar', next ? 'collapsed' : 'expanded');
    };
    const groups = navigationGroups.map((group) => groupForRoleGroup(group, role)).filter((group) => group.items.length > 0);
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn btn--ghost sidebar-toggle", onClick: () => setOpen(true), "aria-label": t('navigation.menu'), children: _jsx(PanelLeftOpen, { className: "h-4 w-4" }) }), open && _jsx("div", { className: "sidebar-backdrop", onClick: () => setOpen(false), "aria-hidden": "true" }), _jsxs("aside", { className: `sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${!open ? 'sidebar--hidden' : ''}`, "aria-label": t('navigation.ariaLabel'), children: [_jsxs("div", { className: "sidebar-top", children: [_jsxs("div", { className: "brand", children: [_jsx("span", { className: "brand-logo", children: "\u0645" }), _jsx("div", { className: "brand-name", children: t('appName') })] }), _jsx("button", { type: "button", className: "icon-btn", onClick: () => setOpen(false), "aria-label": t('actions.close'), children: _jsx(X, { className: "h-4 w-4" }) })] }), _jsx("nav", { className: "stack", style: { gap: 18 }, children: groups.map((group) => (_jsxs("div", { className: "nav-group", children: [_jsx("div", { className: "nav-group-title", children: t(group.labelKey) }), group.items.map((item) => (_jsxs("button", { type: "button", className: `nav-item ${activeId === item.id ? 'nav-item--active' : ''}`, onClick: () => { onSelect(item.id); setOpen(false); }, "aria-current": activeId === item.id ? 'page' : undefined, children: [_jsx(item.icon, { className: "nav-icon", "aria-hidden": "true" }), _jsx("span", { children: t(item.labelKey) })] }, item.id)))] }, group.labelKey))) }), _jsx("div", { className: "sidebar-foot", children: _jsxs("button", { type: "button", className: "nav-item", onClick: toggleCollapsed, "aria-label": "toggle sidebar", children: [collapsed ? _jsx(PanelLeftOpen, { className: "nav-icon", "aria-hidden": "true" }) : _jsx(PanelLeftClose, { className: "nav-icon", "aria-hidden": "true" }), _jsx("span", { children: collapsed ? '' : t('actions.close') })] }) })] })] }));
}
