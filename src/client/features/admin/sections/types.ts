export type PlatformStats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  suspendedTenants: number;
  mrrEgp: number;
};

export type UsageLevel = 'none' | 'ok' | 'warning' | 'strong' | 'over';
export type UsageMetricName = 'USERS' | 'RECEPTIONISTS' | 'STUDENTS' | 'VISITS' | 'BRANCHES';

export type UsageMetricState = {
  metric: UsageMetricName;
  used: number;
  limit: number | null;
  percent: number | null;
  remaining: number | null;
  level: UsageLevel;
  overLimit: boolean;
  warning: boolean;
};

export type PaymentState = 'paid' | 'trial' | 'due' | 'none';

export type CenterOwnerSummary = {
  name: string;
  username: string;
  phoneNumber: string | null;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
};

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planNameAr: string;
  planNameEn: string;
  priceMonthly: number;
  isActive: boolean;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  isTrialActive: boolean;
  maxDesks: number;
  maxBranches: number;
  maxUsers: number;
  visitLimit: number | null;
  discountBalance: string;
  creditBalance: string;
  createdAt: string;
  renewalDate: string | null;
  renewalAmount: string | null;
  paymentStatus: PaymentState;
  visitsThisPeriod: number;
  visitLimitEffective: number | null;
  visitUsagePercent: number | null;
  userUsagePercent: number | null;
  usageLevel: UsageLevel;
  isApproachingLimit: boolean;
  isOverLimit: boolean;
  userCount: number;
  receptionistCount: number;
  studentCount: number;
  teacherCount: number;
  sessionCount: number;
  branchesUsed: number | null;
  owner: CenterOwnerSummary | null;
};

export type CenterUserRow = {
  id: string;
  username: string;
  fullName: string;
  role: string;
  email: string | null;
  phoneNumber: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type CenterUsage = {
  tenantId: string;
  periodStart: string;
  userCount: number;
  receptionistCount: number;
  studentCount: number;
  visitCount: number;
  metrics: UsageMetricState[];
  warningCount: number;
  overCount: number;
  highestLevel: UsageLevel;
};

export type CenterHealthAlert = {
  id: string;
  level: string;
  category: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type CenterAuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  amount: string | null;
  createdAt: string;
  actor: { username: string; fullName: string } | null;
};

export type BillingAdjustment = {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  type: 'DISCOUNT' | 'CREDIT' | 'REFUND' | string;
  amount: string;
  reason: string | null;
  createdAt: string;
  createdById: string;
  createdBy?: { id: string; fullName: string; username: string } | null;
  tenant?: { id: string; name: string; slug: string; plan: string } | null;
  subscription?: { id: string; plan: string; status: string; amount: string } | null;
};

export type SubscriptionRow = {
  id: string;
  tenantId: string;
  plan: string;
  status: 'PENDING' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' | string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  isStale: boolean;
  adjustments: BillingAdjustment[];
  tenant: { id: string; name: string; slug: string; plan: string; isActive: boolean; ownerName: string | null } | null;
};

export type CenterDetail = {
  tenant: TenantRow & {
    ownerName: string | null;
    ownerPhone: string | null;
    roomCount: number;
    attendanceCount: number;
    attendancesByStatus: Record<string, number>;
  };
  usage: CenterUsage | null;
  users: CenterUserRow[];
  supportNotes: SupportNote[];
  overrides: UsageOverride[];
  healthAlerts: CenterHealthAlert[];
  adjustments: BillingAdjustment[];
  subscriptions: SubscriptionRow[];
  recentAudit: CenterAuditEntry[];
};

export type UsageRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isActive: boolean;
  maxDesks: number;
  maxBranches: number;
  maxUsers: number;
  visitLimit: number | null;
  createdAt: string;
  periodStart: string;
  userCount: number;
  receptionistCount: number;
  studentCount: number;
  visitCount: number;
  metrics: UsageMetricState[];
  warningCount: number;
  overCount: number;
  highestLevel: UsageLevel;
};

export type PlatformUser = {
  id: string;
  tenantId: string | null;
  username: string;
  email: string | null;
  fullName: string;
  role: string;
  phoneNumber: string | null;
  preferredLanguage: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  centerName: string | null;
  centerPlan: string | null;
};

export type PlatformUserActivity = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  amount: string | null;
  createdAt: string;
};

export type PlatformUserDetail = {
  id: string;
  tenantId: string | null;
  username: string;
  email: string | null;
  fullName: string;
  role: string;
  phoneNumber: string | null;
  preferredLanguage: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  centerUsersActive: number;
  recentActivity: PlatformUserActivity[];
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    isActive: boolean;
    maxUsers: number;
    visitLimit: number | null;
    maxDesks: number;
    maxBranches: number;
  } | null;
  _count: { auditLogs: number; shiftRegisters: number; attendances: number };
};

export type CenterOption = { id: string; name: string; slug: string; plan: string };

export type RevenuePoint = { key: string; amount: number; count: number };

export type RevenueReport = {
  mrr: number;
  atRiskRevenue: number;
  revenueThisMonth: number;
  mrrByPlan: Record<string, number>;
  history: RevenuePoint[];
  movements: {
    newSubscriptions: number;
    canceledSubscriptions: number;
    pastDue: number;
    stalePending: number;
  };
  adjustments: { refunds: number; discounts: number; credits: number };
  stalePendingAfterDays: number;
};

export type PendingPayment = {
  id: string;
  plan: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string; plan: string };
};

export type HealthEvent = {
  id: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  category: string;
  message: string;
  createdAt: string;
};

export type ApproachingLimitRow = {
  tenantId: string;
  centerName: string;
  level: UsageLevel;
  warningCount: number;
  overCount: number;
  metrics: UsageMetricState[];
};

export type RecentActivityRow = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  tenant: { id: string; name: string } | null;
};

export type PlatformConsole = {
  mrrEgp: number;
  mrrByPlan: Record<string, number>;
  revenueThisMonth: number;
  monthlyVisits: number;
  tenants: {
    total: number;
    active: number;
    trial: number;
    suspended: number;
    free: number;
    newThisMonth: number;
  };
  users: { total: number; inactive: number };
  billing: { pastDue: number; stalePending: number };
  approachingLimits: ApproachingLimitRow[];
  support: {
    openNotes: number;
    recentNotes: { id: string; status: string; createdAt: string; tenant: { id: string; name: string } | null }[];
  };
  notifications: { total: number };
  usageOverrides: { active: number };
  viewAs: { openSessions: number };
  recentHealthEvents: HealthEvent[];
  recentActivity: RecentActivityRow[];
};

export type ViewAsSession = {
  sessionId: string;
  token: string;
  expiresAt: string;
  tenantName: string;
};

export type CenterPreview = {
  students: { id: string; fullName: string; studentCode: string }[];
  total: number;
};

export type PlatformNotification = {
  id: string;
  titleAr: string;
  bodyAr: string;
  audience: 'ALL_CENTERS' | 'PLAN' | 'CENTER' | 'USER' | string;
  audienceIds: string[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | string;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type FeatureFlag = {
  key: string;
  labelAr: string;
  descriptionAr: string;
  value: { enabled: boolean; plans: Record<string, boolean>; centers: Record<string, boolean> };
  updatedAt: string | null;
};

export type HealthCheck = {
  key: string;
  labelAr: string;
  ok: boolean;
  level: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  detailAr: string;
  value?: string | number | null;
  latencyMs?: number | null;
};

export type HealthChecksResponse = {
  checks: HealthCheck[];
  summary: {
    total: number;
    ok: number;
    failed: number;
    critical: number;
    unresolvedCriticalEvents: number;
  };
  checkedAt: string;
};

export type FullHealthEvent = {
  id: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL' | string;
  category: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  tenant: { id: string; name: string } | null;
};

export type SuperAuditEntry = {
  id: string;
  actorId: string;
  tenantId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
  createdAt: string;
  actor: { id: string; fullName: string; username: string } | null;
  tenant: { id: string; name: string } | null;
};

export type PlatformSetting = {
  key: string;
  kind: 'string' | 'number' | 'boolean' | 'json';
  value: unknown;
  isDefault: boolean;
  updatedAt: string | null;
  updatedBy: { id: string; fullName: string; username: string } | null;
};

export type DataStatus = {
  counts: Record<string, number>;
  migrations: { applied: number; failed: number } | null;
  databaseSizeBytes: number | null;
  automatedBackup: unknown | null;
  automatedBackupNote: string;
  recentExports: { id: string; action: string; createdAt: string; entityType: string | null; entityId: string | null; ip: string | null }[];
};

export type SuperAdminSessionRow = {
  id: string;
  startedAt: string;
  expiresAt: string | null;
  endedAt: string | null;
  reason: string | null;
  isActive: boolean;
  impersonatingTenant: { id: string; name: string; slug: string } | null;
};

export type AccountUser = {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  phoneNumber: string | null;
  role: string;
  preferredLanguage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  _count: { superAdminAuditLogs: number; superAdminSessions: number };
};

export type SupportNote = {
  id: string;
  text: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | string;
  createdAt: string;
  updatedAt: string;
  tenant: { id: string; name: string; slug: string; plan: string };
  author: { id: string; fullName: string; username: string };
};

export type UsageOverride = {
  id: string;
  metric: string;
  extraAmount: number;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  tenant: { id: string; name: string; slug: string; plan: string };
  grantedBy: { id: string; fullName: string; username: string };
};

export type PlanCatalogEntry = {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMonthly: number;
  public: boolean;
  purchasable: boolean;
  maxDesks: number | null;
  maxUsers: number | null;
  maxBranches: number | null;
  visitLimit: number | null;
};
