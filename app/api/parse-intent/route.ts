import { NextResponse } from "next/server";

type IntentResponse = {
  action: "SEND" | "CHECK" | "HISTORY" | "UNKNOWN";
  amount: number | null;
  currency: "USD" | "FBU" | "HSK" | "HSP" | "EUR" | null;
  recipient: string | null;
  confidence: number;
  explanation: string;
  detectedLanguage: string;
};

const SYSTEM_PROMPT = `You are Pesa AI, an intelligent PayFi agent for Africa built on HashKey Chain.
You parse SMS payment commands written in English, French, Kirundi, or Swahili.
Extract the payment intent and return ONLY a valid JSON object with no extra text.

HSP (HashKey Settlement Protocol) is the primary PayFi token. Default to HSP unless user specifies HSK.

JSON format:
{
  action: 'SEND' | 'CHECK' | 'HISTORY' | 'UNKNOWN',
  amount: number | null,
  currency: 'HSP' | 'HSK' | 'USD' | 'FBU' | 'EUR' | null,
  recipient: string | null,
  confidence: number (0 to 1),
  explanation: string (one sentence, friendly),
  detectedLanguage: string
}

Examples:
'SEND 10 HSP TO 0x742d35Cc' -> SEND, 10, HSP, 0x742d35Cc, 0.99
'SEND 5 HSK TO 0xABC123' -> SEND, 5, HSK, 0xABC123, 0.99
'Ohereza 1000 FBU kuri +25761234567' -> SEND, 1000, FBU, +25761234567, 0.95
'Envoyer 20 USD a 0xABC123' -> SEND, 20, USD, 0xABC123, 0.97
'CHECK BALANCE' -> CHECK, null, null, null, 0.99
'HISTORY' -> HISTORY, null, null, null, 0.99`;

const MAX_SMS_LENGTH = 160;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ipRequestLog = new Map<string, number[]>();

function fallback(error: string) {
  return NextResponse.json(
    {
      error,
      action: "UNKNOWN",
      confidence: 0,
    },
    { status: 500 },
  );
}

function cleanJson(text: string): string {
  return text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function toIntentResponse(raw: unknown): IntentResponse {
  const obj = raw as Partial<IntentResponse>;

  return {
    action:
      obj.action === "SEND" || obj.action === "CHECK" || obj.action === "HISTORY"
        ? obj.action
        : "UNKNOWN",
    amount: typeof obj.amount === "number" ? obj.amount : null,
    currency:
      obj.currency === "USD" || obj.currency === "FBU" || obj.currency === "HSK" || obj.currency === "HSP" || obj.currency === "EUR"
        ? obj.currency
        : null,
    recipient: typeof obj.recipient === "string" ? obj.recipient : null,
    confidence: typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0,
    explanation:
      typeof obj.explanation === "string"
        ? obj.explanation
        : "I could not confidently parse that command.",
    detectedLanguage: typeof obj.detectedLanguage === "string" ? obj.detectedLanguage : "Unknown",
  };
}

function normalizeSmsText(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, MAX_SMS_LENGTH);
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (ipRequestLog.get(ip) ?? []).filter((ts) => ts >= windowStart);
  recent.push(now);
  ipRequestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

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

    const body = (await request.json()) as { smsText?: string };
    const smsText = typeof body.smsText === "string" ? normalizeSmsText(body.smsText) : "";

    if (!smsText) {
      return NextResponse.json({ error: "smsText is required" }, { status: 400 });
    }

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is not configured",
          action: "UNKNOWN",
          confidence: 0,
        },
        { status: 500 },
      );
    }

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: smsText },
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
    if (!rawContent) {
      return fallback("No response content from Groq");
    }

    const parsed = JSON.parse(cleanJson(rawContent));
    return NextResponse.json(toIntentResponse(parsed));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected parsing error";
    return NextResponse.json(
      {
        error: message,
        action: "UNKNOWN",
        confidence: 0,
      },
      { status: 500 },
    );
  }
}
