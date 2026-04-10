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

const SYSTEM_PROMPT = `You are Pesa AI, an advanced PayFi intelligence agent for Africa built on HashKey Chain.
You understand natural language payment commands in English, French, Kirundi, and Swahili — including informal, emotional, and context-rich expressions.

CRITICAL: You must understand NATURAL LANGUAGE, not just commands. Examples:
- "Ndungikira mama amahera yo kurya" = Send money to mom for food (Kirundi, amount unknown → CLARIFY)
- "Niambie mama apate elfu tano" = Tell mom to get 5000 (Swahili, amount=5000, recipient=mom → CLARIFY address)
- "Envoie de l'argent à Jean pour le loyer" = Send money to Jean for rent (French, amount unknown → CLARIFY)
- "My sister needs bus fare, send her 2 dollars" = SEND 2 USD to sister (English, address unknown → CLARIFY)
- "SEND 10 HSP TO 0x742d35Cc" = Direct command (SEND, 10, HSP)

RECIPIENT TYPES:
- Ethereum address (0x...): recipientType = "address"
- Phone number (+257...): recipientType = "phone"  
- Name/relationship (mama, Jean, sister): recipientType = "name"
- Unknown: recipientType = "unknown"

FRAUD DETECTION — analyze for these risk signals:
- Urgency language: "emergency", "urgent", "immediately", "dying", "accident"
- Pressure tactics: "don't tell anyone", "secret", "surprise"
- Suspicious amounts: very round large amounts to unknown recipients
- Unknown recipients with urgency
- Requests to send to new/unknown addresses with emotional pressure

SMART ROUTING — recommend based on amount and currency:
- HSP direct: best for HSP payments, lowest fee (~0.001 HSK gas)
- HSK direct: best for HSK payments, instant settlement
- stablecoin_swap: best for USD/FBU/EUR amounts over $10, converts via DEX

Return ONLY valid JSON, no markdown, no extra text:
{
  "action": "SEND" | "CHECK" | "HISTORY" | "UNKNOWN" | "CLARIFY",
  "amount": number | null,
  "currency": "HSP" | "HSK" | "USD" | "FBU" | "EUR" | null,
  "recipient": string | null,
  "recipientType": "address" | "phone" | "name" | "unknown",
  "confidence": number (0-1),
  "explanation": string (one friendly sentence in the SAME language as input),
  "detectedLanguage": string,
  "clarifyQuestion": string | null (in same language as input, ask what's missing),
  "route": {
    "id": "hsp_direct" | "hsk_direct" | "stablecoin_swap",
    "label": string,
    "estimatedFeeUSD": number,
    "estimatedTimeSeconds": number,
    "recommended": true,
    "reason": string
  } | null,
  "fraud": {
    "level": "safe" | "warning" | "danger",
    "score": number (0-100),
    "flags": string[],
    "recommendation": string
  }
}`;

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
        temperature: 0.1,   // lower = more deterministic JSON
        max_tokens:  512,
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

    const parsed = JSON.parse(cleanJson(rawContent));
    return NextResponse.json(toIntentResponse(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { error: message, action: "UNKNOWN", confidence: 0, fraud: null, route: null },
      { status: 500 },
    );
  }
}
