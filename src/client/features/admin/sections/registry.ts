import {
  Activity,
  AlertTriangle,
  Building2,
  CreditCard,
  Database,
  Flag,
  Gauge,
  LifeBuoy,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  UserCog,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type SectionId =
  | 'overview'
  | 'centers'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'usage'
  | 'revenue'
  | 'support'
  | 'notifications'
  | 'featureFlags'
  | 'health'
  | 'audit'
  | 'settings'
  | 'data'
  | 'security'
  | 'account';

export type SectionGroup = 'monitor' | 'manage' | 'configure' | 'govern';

export type SectionDefinition = {
  id: SectionId;
  labelKey: string;
  subtitleKey: string;
  icon: LucideIcon;
  group: SectionGroup;
};

export const SECTION_GROUPS: { id: SectionGroup; labelKey: string }[] = [
  { id: 'monitor', labelKey: 'superAdmin.nav.groupMonitor' },
  { id: 'manage', labelKey: 'superAdmin.nav.groupManage' },
  { id: 'configure', labelKey: 'superAdmin.nav.groupConfigure' },
  { id: 'govern', labelKey: 'superAdmin.nav.groupGovern' },
];

export const SECTIONS: SectionDefinition[] = [
  { id: 'overview', labelKey: 'superAdmin.nav.overview', subtitleKey: 'superAdmin.overview.subtitle', icon: Activity, group: 'monitor' },
  { id: 'health', labelKey: 'superAdmin.nav.health', subtitleKey: 'superAdmin.health.subtitle', icon: AlertTriangle, group: 'monitor' },
  { id: 'usage', labelKey: 'superAdmin.nav.usage', subtitleKey: 'superAdmin.usage.subtitle', icon: Gauge, group: 'monitor' },
  { id: 'revenue', labelKey: 'superAdmin.nav.revenue', subtitleKey: 'superAdmin.revenue.subtitle', icon: TrendingUp, group: 'monitor' },
  { id: 'centers', labelKey: 'superAdmin.nav.centers', subtitleKey: 'superAdmin.centers.subtitle', icon: Building2, group: 'manage' },
  { id: 'users', labelKey: 'superAdmin.nav.users', subtitleKey: 'superAdmin.users.subtitle', icon: Users, group: 'manage' },
  { id: 'subscriptions', labelKey: 'superAdmin.nav.subscriptions', subtitleKey: 'superAdmin.subscriptions.subtitle', icon: CreditCard, group: 'manage' },
  { id: 'plans', labelKey: 'superAdmin.nav.plans', subtitleKey: 'superAdmin.plans.subtitle', icon: SlidersHorizontal, group: 'manage' },
  { id: 'support', labelKey: 'superAdmin.nav.support', subtitleKey: 'superAdmin.support.subtitle', icon: LifeBuoy, group: 'manage' },
  { id: 'notifications', labelKey: 'superAdmin.nav.notifications', subtitleKey: 'superAdmin.notifications.subtitle', icon: SlidersHorizontal, group: 'configure' },
  { id: 'featureFlags', labelKey: 'superAdmin.nav.featureFlags', subtitleKey: 'superAdmin.featureFlags.subtitle', icon: Flag, group: 'configure' },
  { id: 'settings', labelKey: 'superAdmin.nav.settings', subtitleKey: 'superAdmin.settings.subtitle', icon: Settings, group: 'configure' },
  { id: 'data', labelKey: 'superAdmin.nav.data', subtitleKey: 'superAdmin.data.subtitle', icon: Database, group: 'govern' },
  { id: 'security', labelKey: 'superAdmin.nav.security', subtitleKey: 'superAdmin.security.subtitle', icon: ShieldCheck, group: 'govern' },
  { id: 'audit', labelKey: 'superAdmin.nav.audit', subtitleKey: 'superAdmin.audit.subtitle', icon: ScrollText, group: 'govern' },
  { id: 'account', labelKey: 'superAdmin.nav.account', subtitleKey: 'superAdmin.account.subtitle', icon: UserCog, group: 'govern' },
];

export const DEFAULT_SECTION: SectionId = 'overview';
