
export interface TreasuryStats {
  tvl: number;
  collateralRatio: number;
  treasuryRevenue: number;
  lastPoR: string;
  reserveAllocation: { tBills: number; liquidity: number; operations: number };
}

export interface MarketAsset {
  id: string;
  title: string;
  subtitle: string;
  category: 'Compute' | 'SaaS' | 'E-commerce' | 'AI';
  issuer: string;
  faceValue: number;
  askPrice: number;
  apy: number;
  durationDays: number;
  daysLeft?: number;
  creditScore: number;
  status: 'Fundraising' | 'Ending Soon' | 'Sold Out' | 'Failed' | 'Funded';
  targetAmount: number;
  raisedAmount: number;
  backersCount: number;
  remainingCap: number;
  coverageRatio: number;
  verifiedSource: string;
  description: string;
  useOfFunds: string;
  monthlyRevenue: { month: string; amount: number }[];
  coverImage: string;
  issuerLogo: string;
}

export interface HistoryItem {
  timestamp: string;
  type: 'MINT' | 'REDEEM' | 'INTEREST' | 'DEPOSIT';
  amount: number;
  asset: string;
  status: 'COMPLETED' | 'PENDING' | 'QUEUED';
}

export interface TradeOrder {
  id: string; projectId: string; projectTitle: string; projectCoverImage: string;
  projectIssuer: string; projectIssuerLogo: string; projectApy: number; projectDurationDays: number;
  seller: string; listPrice: number; originalPrice: number; shares: number;
  totalValue: number; expectedReturn: number; expectedYield: number; listedAt: string;
  status: 'Listed' | 'Sold'; buyer?: string; soldAt?: string;
}

export interface RepaymentSchedule {
  id: string; projectId: string; periodNumber: number; dueDate: string;
  principalDue: number; interestDue: number; totalDue: number; paidAmount: number;
  status: 'upcoming' | 'due' | 'paid' | 'overdue' | 'defaulted'; paidAt: string | null; createdAt: string;
}

export interface LiquidationSummary {
  outstandingDebt: number; totalCollateralValue: number; totalRecoverable: number;
  recoveryRate: number; investorCount: number; totalInvested: number;
  waterfall: Array<{ tier: string; label: string; recoveryRate: number; recoverable: number }>;
  collaterals: Array<{ id: string; type: string; description: string; value: number; status: string }>;
}

// ─── V2 types ────────────────────────────────────────────────

export type RoleType = 'human' | 'agent' | 'avatar';

export enum Page {
  SUPER_AGENT = 'SUPER_AGENT',
  CHATS = 'CHATS',
  INVEST = 'INVEST',
  DISCOVER = 'DISCOVER',
  CONTACTS = 'CONTACTS',
  SETTINGS = 'SETTINGS',
  API = 'API',
  PORTFOLIO = 'PORTFOLIO',
  ENTERPRISE = 'ENTERPRISE'
}
