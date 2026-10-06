import { BarChart3, BookOpen, Building2, CalendarDays, ClipboardCheck, Coins, CreditCard, GraduationCap, LayoutDashboard, Shield, Sparkles, Users, Wallet } from 'lucide-react';
export const ALL_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'];
export const ADMIN_ONLY = ['SUPER_ADMIN', 'ADMIN'];
export const SUPER_ADMIN_ONLY = ['SUPER_ADMIN'];
export const navigationGroups = [
    {
        labelKey: 'navigation.groups.operation',
        items: [
            { id: 'dashboard', labelKey: 'navigation.dashboard', icon: LayoutDashboard, roles: ALL_ROLES },
            { id: 'lobby', labelKey: 'navigation.lobby', icon: Users, roles: ALL_ROLES },
            { id: 'sessions', labelKey: 'navigation.sessions', icon: CalendarDays, roles: ALL_ROLES },
        ],
    },
    {
        labelKey: 'navigation.groups.registries',
        items: [
            { id: 'students', labelKey: 'navigation.students', icon: GraduationCap, roles: ALL_ROLES },
            { id: 'teachers', labelKey: 'navigation.teachers', icon: BookOpen, roles: ALL_ROLES },
            { id: 'rooms', labelKey: 'navigation.rooms', icon: Building2, roles: ALL_ROLES },
        ],
    },
    {
        labelKey: 'navigation.groups.finance',
        items: [
            { id: 'shift', labelKey: 'navigation.shiftRegister', icon: Wallet, roles: ADMIN_ONLY },
            { id: 'reconciliation', labelKey: 'navigation.reconciliation', icon: ClipboardCheck, roles: ADMIN_ONLY },
            { id: 'settlement', labelKey: 'navigation.settlement', icon: Coins, roles: ADMIN_ONLY },
            { id: 'reports', labelKey: 'navigation.reports', icon: BarChart3, roles: ADMIN_ONLY },
            { id: 'billing', labelKey: 'navigation.billing', icon: CreditCard, roles: ADMIN_ONLY },
            { id: 'data-migration', labelKey: 'navigation.dataMigration', icon: Sparkles, roles: ADMIN_ONLY },
        ],
    },
    {
        labelKey: 'navigation.groups.platform',
        items: [
            { id: 'superadmin', labelKey: 'navigation.superadmin', icon: Shield, roles: SUPER_ADMIN_ONLY },
        ],
    },
];
