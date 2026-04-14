import { NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  score: number;        // 0–100, higher = riskier
  flags: string[];      // human-readable reasons
  recommendation: string;
};

export type IntentResponse = {
  action: "SEND" | "CHECK" | "HISTORY" | "UNKNOWN" | "CLARIFY";
  amount: number | null;
  currency: "USD" | "FBU" | "HSK" | "HSP" | "EUR" | null;
  recipient: string | null;
  recipientType: "address" | "phone" | "name" | "unknown";
  confidence: number;
  explanation: string;
  detectedLanguage: string;
  clarifyQuestion: string | null;   // set when action === "CLARIFY"
  route: RouteOption | null;        // smart routing recommendation
  fraud: FraudSignal | null;        // fraud/risk assessment
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Pesa AI, a PayFi payment agent for Africa on HashKey Chain.
You ONLY parse payment commands. You do NOT explain words or answer questions.

ALWAYS return a payment action. If unclear, return CLARIFY asking for the missing piece.

CRITICAL EXAMPLES — these are ALL payment commands:
- "Ndungikira Mama 5 HSP" → SEND, 5, HSP, recipient="Mama", recipientType="name", CLARIFY (need wallet address)
- "Ndungikira mama amahera" → SEND, null, HSP, recipient="mama", CLARIFY (need amount and address)
- "Ohereza 10 HSP kuri 0x742d35Cc" → SEND, 10, HSP, 0x742d35Cc, recipientType="address"
- "SEND 10 HSP TO 0x742d35Cc" → SEND, 10, HSP, 0x742d35Cc
- "Tuma 5 HSP kwa Jean" → SEND, 5, HSP, recipient="Jean", CLARIFY address
- "CHECK BALANCE" → CHECK
- "HISTORY" → HISTORY

"Ndungikira" = send money (Kirundi). "Ohereza" = send (Kirundi). "Tuma" = send (Swahili). "Envoyer" = send (French).

recipientType: "address" (0x...) | "phone" (+257...) | "name" (person name) | "unknown"

FRAUD: raise score for urgency/pressure words.
ROUTING: hsp_direct for HSP | hsk_direct for HSK | stablecoin_swap for USD/FBU/EUR

Return ONLY compact JSON (no spaces, no newlines):
{"action":"SEND"|"CHECK"|"HISTORY"|"UNKNOWN"|"CLARIFY","amount":number|null,"currency":"HSP"|"HSK"|"USD"|"FBU"|"EUR"|null,"recipient":string|null,"recipientType":"address"|"phone"|"name"|"unknown","confidence":0.0,"explanation":"short sentence in same language as input","detectedLanguage":"Kirundi","clarifyQuestion":"short question in same language"|null,"route":{"id":"hsp_direct","label":"HSP Direct","estimatedFeeUSD":0.001,"estimatedTimeSeconds":3,"recommended":true,"reason":"HSP payment"}|null,"fraud":{"level":"safe","score":0,"flags":[],"recommendation":"Safe to proceed"}}`;


// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS   = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ipRequestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now         = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent      = (ipRequestLog.get(ip) ?? []).filter((ts) => ts >= windowStart);
  recent.push(now);
  ipRequestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanJson(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function normalizeSmsText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function fallback(error: string): NextResponse {
  return NextResponse.json(
    { error, action: "UNKNOWN", confidence: 0, fraud: null, route: null },
    { status: 500 },
  );
}

function toIntentResponse(raw: unknown): IntentResponse {
  const obj = raw as Partial<IntentResponse> & {
    route?: Partial<RouteOption>;
    fraud?: Partial<FraudSignal>;
  };

  // Validate route
  let route: RouteOption | null = null;
  if (obj.route && typeof obj.route === "object") {
    const validIds = ["hsp_direct", "hsk_direct", "stablecoin_swap"];
    if (validIds.includes(obj.route.id ?? "")) {
      route = {
        id:                   obj.route.id as RouteOption["id"],
        label:                typeof obj.route.label === "string" ? obj.route.label : "Direct transfer",
        estimatedFeeUSD:      typeof obj.route.estimatedFeeUSD === "number" ? obj.route.estimatedFeeUSD : 0.001,
        estimatedTimeSeconds: typeof obj.route.estimatedTimeSeconds === "number" ? obj.route.estimatedTimeSeconds : 3,
        recommended:          true,
        reason:               typeof obj.route.reason === "string" ? obj.route.reason : "",
      };
    }
  }

  // Validate fraud
  let fraud: FraudSignal | null = null;
  if (obj.fraud && typeof obj.fraud === "object") {
    const validLevels = ["safe", "warning", "danger"];
    fraud = {
      level:          validLevels.includes(obj.fraud.level ?? "") ? (obj.fraud.level as FraudSignal["level"]) : "safe",
      score:          typeof obj.fraud.score === "number" ? Math.max(0, Math.min(100, obj.fraud.score)) : 0,
      flags:          Array.isArray(obj.fraud.flags) ? obj.fraud.flags.filter((f) => typeof f === "string") : [],
      recommendation: typeof obj.fraud.recommendation === "string" ? obj.fraud.recommendation : "Proceed with caution.",
    };
  }

  const validActions = ["SEND", "CHECK", "HISTORY", "UNKNOWN", "CLARIFY"];
  const validCurrencies = ["USD", "FBU", "HSK", "HSP", "EUR"];
  const validRecipientTypes = ["address", "phone", "name", "unknown"];

  return {
    action:        validActions.includes(obj.action ?? "") ? (obj.action as IntentResponse["action"]) : "UNKNOWN",
    amount:        typeof obj.amount === "number" ? obj.amount : null,
    currency:      validCurrencies.includes(obj.currency ?? "") ? (obj.currency as IntentResponse["currency"]) : null,
    recipient:     typeof obj.recipient === "string" ? obj.recipient : null,
    recipientType: validRecipientTypes.includes(obj.recipientType ?? "") ? (obj.recipientType as IntentResponse["recipientType"]) : "unknown",
    confidence:    typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0,
    explanation:   typeof obj.explanation === "string" ? obj.explanation : "I could not parse that command.",
    detectedLanguage: typeof obj.detectedLanguage === "string" ? obj.detectedLanguage : "Unknown",
    clarifyQuestion:  typeof obj.clarifyQuestion === "string" ? obj.clarifyQuestion : null,
    route,
    fraud,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again in a minute.", action: "UNKNOWN", confidence: 0 },
        { status: 429 },
      );
    }

    const body    = (await request.json()) as { smsText?: string };
    const smsText = typeof body.smsText === "string" ? normalizeSmsText(body.smsText) : "";

    if (!smsText) {
      return NextResponse.json({ error: "smsText is required" }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured", action: "UNKNOWN", confidence: 0 },
        { status: 500 },
      );
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model:       "llama-3.1-8b-instant",
        temperature: 0.1,
        max_tokens:  800,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: smsText },
        ],
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text();
      return fallback(`Groq API error (${groqResponse.status}): ${errBody.slice(0, 200)}`);
    }

    const payload = (await groqResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) return fallback("No response from Groq");

    // Try to extract JSON even if model adds extra text
    let jsonStr = cleanJson(rawContent);
    // Find the first { and last } in case model wraps with text
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace  = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[parse-intent] JSON parse failed. Raw content:", rawContent.slice(0, 300));
      return fallback(`AI returned invalid JSON. Raw: ${rawContent.slice(0, 100)}`);
    }

    return NextResponse.json(toIntentResponse(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[parse-intent] Unhandled error:", message);
    return NextResponse.json(
      { error: message, action: "UNKNOWN", confidence: 0, fraud: null, route: null },
      { status: 500 },
    );
  }
}
