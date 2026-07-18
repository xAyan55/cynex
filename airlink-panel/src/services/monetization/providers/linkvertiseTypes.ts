export interface LinkvertiseConfig {
  publisherId: string;
  apiKey?: string;
  enabled: boolean;
  useDynamicLinks: boolean;
  defaultDestination: string;
  redirectDelay: number;
  verifyCallbacks: boolean;
  callbackSecret: string;
  allowGuestLinks: boolean;
  analyticsEnabled: boolean;
  retryFailures: boolean;
  
  // Feature Flags
  enableDynamicLinks: boolean;
  enableRewards: boolean;
  enableCallbackProcessing: boolean;
  enableAnalytics: boolean;
  enableDiagnostics: boolean;
  enableTestMode: boolean;
  enableCsvExport: boolean;

  // Reward rules mapping (Campaign -> coin reward amount)
  rewardRules: Record<string, number>;
}

export type LinkvertiseStatus = 
  | 'CREATED' 
  | 'VISITED' 
  | 'COMPLETED' 
  | 'VERIFIED' 
  | 'PENDING_REWARD' 
  | 'REWARDED' 
  | 'FAILED' 
  | 'EXPIRED';

export interface LinkvertiseTokenPayload {
  userId: number;
  rewardType: string;
  campaign: string;
  placement: string;
  expiry: number;
  nonce: string;
}
