// ── Client-side analytics (no external service needed) ────────────────────────
// Stores events in localStorage for the analytics dashboard.

export type AnalyticsEvent =
  | { type: "parse_success"; action: string; language: string; confidence: number; ts: number }
  | { type: "parse_error";   error: string; ts: number }
  | { type: "tx_success";    token: "HSP" | "HSK"; amount: string; ts: number }
  | { type: "tx_error";      reason: string; ts: number }
  | { type: "tx_retry";      attempt: number; ts: number }
  | { type: "faucet_claim";  ts: number }
  | { type: "wallet_connect"; ts: number }
  | { type: "page_view";     locale: string; ts: number };

const KEY = "pesa_ai_events";
const MAX = 500;

function load(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as AnalyticsEvent[];
  } catch {
    return [];
  }
}

function save(events: AnalyticsEvent[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX)));
}

export function track(event: AnalyticsEvent) {
  const events = load();
  events.push(event);
  save(events);
}

export function getEvents(): AnalyticsEvent[] {
  return load();
}

// ── Derived metrics ───────────────────────────────────────────────────────────

export type AnalyticsSummary = {
  totalParses: number;
  successRate: number;       // 0–100
  avgConfidence: number;     // 0–100
  txSuccess: number;
  txErrors: number;
  hspVolume: number;
  hskVolume: number;
  topLanguage: string;
  languageBreakdown: Record<string, number>;
  actionBreakdown: Record<string, number>;
  retries: number;
  faucetClaims: number;
  last24hTx: number;
};

export function getSummary(): AnalyticsSummary {
  const events = load();
  const now    = Date.now();
  const day    = 86_400_000;

  const parses    = events.filter((e) => e.type === "parse_success") as Extract<AnalyticsEvent, { type: "parse_success" }>[];
  const errors    = events.filter((e) => e.type === "parse_error");
  const txOk      = events.filter((e) => e.type === "tx_success")   as Extract<AnalyticsEvent, { type: "tx_success" }>[];
  const txErr     = events.filter((e) => e.type === "tx_error");
  const retries   = events.filter((e) => e.type === "tx_retry");
  const faucets   = events.filter((e) => e.type === "faucet_claim");
  const last24h   = txOk.filter((e) => now - e.ts < day);

  const langCount: Record<string, number> = {};
  const actionCount: Record<string, number> = {};
  let totalConf = 0;

  for (const p of parses) {
    langCount[p.language]  = (langCount[p.language]  ?? 0) + 1;
    actionCount[p.action]  = (actionCount[p.action]  ?? 0) + 1;
    totalConf += p.confidence;
  }

  const topLang = Object.entries(langCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  let hspVol = 0;
  let hskVol = 0;
  for (const tx of txOk) {
    const amt = parseFloat(tx.amount) || 0;
    if (tx.token === "HSP") hspVol += amt;
    else                    hskVol += amt;
  }

  const total = parses.length + errors.length;

  return {
    totalParses:       total,
    successRate:       total > 0 ? Math.round((parses.length / total) * 100) : 0,
    avgConfidence:     parses.length > 0 ? Math.round((totalConf / parses.length) * 100) : 0,
    txSuccess:         txOk.length,
    txErrors:          txErr.length,
    hspVolume:         hspVol,
    hskVolume:         hskVol,
    topLanguage:       topLang,
    languageBreakdown: langCount,
    actionBreakdown:   actionCount,
    retries:           retries.length,
    faucetClaims:      faucets.length,
    last24hTx:         last24h.length,
  };
}

export function clearEvents() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
