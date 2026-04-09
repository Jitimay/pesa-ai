export type ParsedAction = "SEND" | "CHECK" | "HISTORY" | "UNKNOWN";

export type ParsedIntent = {
  action: ParsedAction;
  amount: number | null;
  currency: "USD" | "FBU" | "HSK" | "HSP" | "EUR" | null;
  recipient: string | null;
  confidence: number;
  explanation: string;
  detectedLanguage: string;
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
