export type ParsedAction = "SEND" | "CHECK" | "HISTORY" | "UNKNOWN" | "CLARIFY";

export type RouteOption = {
  id: "hsp_direct" | "hsk_direct" | "stablecoin_swap";
  label: string;
  estimatedFeeUSD: number;
  estimatedTimeSeconds: number;
  recommended: boolean;
  reason: string;
};

export type FraudSignal = {
  level: "safe" | "warning" | "danger";
  score: number;
  flags: string[];
  recommendation: string;
};

export type ParsedIntent = {
  action: ParsedAction;
  amount: number | null;
  currency: "USD" | "FBU" | "HSK" | "HSP" | "EUR" | null;
  recipient: string | null;
  recipientType: "address" | "phone" | "name" | "unknown";
  confidence: number;
  explanation: string;
  detectedLanguage: string;
  clarifyQuestion: string | null;
  route: RouteOption | null;
  fraud: FraudSignal | null;
};

export type WalletState = {
  isConnected: boolean;
  address: string | null;
  isCorrectNetwork: boolean;
  balanceHSK: string | null;
  balanceHSP: string | null;
};

export type PaymentRecord = {
  txId: string;
  sender: string;
  recipient: string;
  amount: string;
  currency: string;
  smsIntent: string;
  timestamp: bigint;
  token: number; // 0 = HSK, 1 = HSP
};
