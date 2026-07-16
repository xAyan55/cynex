export interface EconomyConfig {
  startingCoins: number;
  coinName: string;
  coinSymbol: string;
  maxBalance: number;
  downgradeRefundPercent: number;
  taxPercent: number;
}

export interface StoreConfig {
  ramPricePerMb: number;
  cpuPricePerPercent: number;
  diskPricePerMb: number;
  backupSlotPrice: number;
  databaseSlotPrice: number;
  portPrice: number;
  serverSlotPrice: number;
}

export interface NotificationsConfig {
  notifyOnServerExpiration: boolean;
  notifyOnPurchase: boolean;
  notifyOnCouponRedeem: boolean;
  notifyOnAdminAction: boolean;
  notifyOnMaintenance: boolean;
  expirationWarningDays: number;
}

export interface DefaultServerConfig {
  defaultMemory: number;
  defaultCpu: number;
  defaultDisk: number;
  defaultValidityDays: number;
  defaultBackupSlots: number;
  defaultDatabaseSlots: number;
  defaultPorts: number;
}

export interface RenewalConfig {
  renew7DaysCost: number;
  renew15DaysCost: number;
  renew30DaysCost: number;
  renew60DaysCost: number;
  renew90DaysCost: number;
}

export interface LimitsConfig {
  maxServers: number;
  maxBackupsPerServer: number;
  maxDatabasesPerServer: number;
  maxPortsPerServer: number;
  maxRamUpgrade: number;
  maxCpuUpgrade: number;
  maxDiskUpgrade: number;
  maxWalletBalance: number;
  maxCouponUsesPerUser: number;
}

export interface UIConfig {
  coinIconPath: string;
  dashboardShowResourceCards: boolean;
  dashboardShowStore: boolean;
  dashboardShowCoupons: boolean;
  storeEnabled: boolean;
  couponsEnabled: boolean;
  landingEnabled: boolean;
  brandName: string;
  brandLogo: string;
}

export type ConfigGroup = EconomyConfig | StoreConfig | DefaultServerConfig | RenewalConfig | LimitsConfig | UIConfig | NotificationsConfig;

export const defaultValues: Record<string, Record<string, unknown>> = {
  economy: {
    startingCoins: 100,
    coinName: 'Coins',
    coinSymbol: 'C',
    maxBalance: 999999,
    downgradeRefundPercent: 50,
    taxPercent: 0,
  },
  store: {
    ramPricePerMb: 10,
    cpuPricePerPercent: 5,
    diskPricePerMb: 2,
    backupSlotPrice: 500,
    databaseSlotPrice: 300,
    portPrice: 200,
    serverSlotPrice: 1000,
  },
  defaults: {
    defaultMemory: 512,
    defaultCpu: 100,
    defaultDisk: 5120,
    defaultValidityDays: 30,
    defaultBackupSlots: 1,
    defaultDatabaseSlots: 1,
    defaultPorts: 1,
  },
  renewals: {
    renew7DaysCost: 100,
    renew15DaysCost: 200,
    renew30DaysCost: 350,
    renew60DaysCost: 600,
    renew90DaysCost: 800,
  },
  limits: {
    maxServers: 10,
    maxBackupsPerServer: 5,
    maxDatabasesPerServer: 3,
    maxPortsPerServer: 5,
    maxRamUpgrade: 16384,
    maxCpuUpgrade: 400,
    maxDiskUpgrade: 102400,
    maxWalletBalance: 999999,
    maxCouponUsesPerUser: 10,
  },
  ui: {
    coinIconPath: '/assets/dash/coin.png',
    dashboardShowResourceCards: true,
    dashboardShowStore: true,
    dashboardShowCoupons: true,
    storeEnabled: true,
    couponsEnabled: true,
    landingEnabled: false,
    brandName: 'CynexGP',
    brandLogo: '/assets/dash/logo.png',
  },
  notifications: {
    notifyOnServerExpiration: true,
    notifyOnPurchase: true,
    notifyOnCouponRedeem: true,
    notifyOnAdminAction: true,
    notifyOnMaintenance: true,
    expirationWarningDays: 3,
  },
};
