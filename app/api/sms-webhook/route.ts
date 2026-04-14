import { NextResponse } from "next/server";

/**
 * POST /api/sms-webhook
 *
 * Called by the ESP32 / Andasy.io server when a real SMS arrives.
 * Body: { sender: string, message: string, secret?: string }
 *
 * This endpoint:
 * 1. Validates the webhook secret
 * 2. Parses the SMS intent via the same AI pipeline
 * 3. Stores the event in the in-memory log (polled by the UI)
 * 4. Returns the AI parse result so the ESP32 server can reply via SMS
 *
 * For on-chain settlement: the UI polls /api/sms-webhook/events and
 * the connected wallet executes the transaction client-side.
 * This keeps private keys out of the server entirely.
 */

export type SmsEvent = {
  id: string;
  sender: string;
  message: string;
  receivedAt: number;
  parsed?: {
    action: string;
    amount: number | null;
    currency: string | null;
    recipient: string | null;
    confidence: number;
    explanation: string;
    detectedLanguage: string;
    fraud: { level: string; score: number; flags: string[] } | null;
    route: { id: string; label: string; estimatedFeeUSD: number } | null;
  };
  status: "pending" | "processing" | "settled" | "failed" | "cancelled";
  txHash?: string;
};

// In-memory ring buffer — last 50 SMS events
const MAX_EVENTS = 50;
const events: SmsEvent[] = [];

export function getEvents(): SmsEvent[] {
  return [...events].reverse(); // newest first
}

export function updateEventStatus(id: string, status: SmsEvent["status"], txHash?: string) {
  const ev = events.find((e) => e.id === id);
  if (ev) {
    ev.status = status;
    if (txHash) ev.txHash = txHash;
  }
}

function pushEvent(ev: SmsEvent) {
  events.push(ev);
  if (events.length > MAX_EVENTS) events.shift();
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Validate webhook secret
    const secret = request.headers.get("x-webhook-secret") ?? "";
    const expectedSecret = process.env.SMS_WEBHOOK_SECRET ?? "";
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      sender?: string;
      message?: string;
    };

    const sender  = typeof body.sender  === "string" ? body.sender.trim()  : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!sender || !message) {
      return NextResponse.json({ error: "sender and message required" }, { status: 400 });
    }

    // Parse intent using the same AI pipeline
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const parseRes = await fetch(`${baseUrl}/api/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsText: message }),
    });

    const parsed = parseRes.ok
      ? (await parseRes.json()) as SmsEvent["parsed"]
      : null;

    const event: SmsEvent = {
      id:         crypto.randomUUID(),
      sender,
      message,
      receivedAt: Date.now(),
      parsed:     parsed ?? undefined,
      status:     "pending",
    };

    pushEvent(event);

    // Build SMS reply for the ESP32 to send back
    let smsReply = "Pesa AI received your message.";
    if (parsed) {
      if (parsed.action === "SEND") {
        const fraudWarn = parsed.fraud?.level === "danger"
          ? "\n⚠️ HIGH RISK detected. Open app to confirm."
          : parsed.fraud?.level === "warning"
          ? "\n⚠️ Caution: " + (parsed.fraud.flags[0] ?? "review before sending")
          : "";
        smsReply = `${parsed.explanation}${fraudWarn}\nOpen app to confirm payment: pesa-ai.vercel.app`;
      } else if (parsed.action === "CHECK") {
        smsReply = "Open app to check your balance: pesa-ai.vercel.app";
      } else if (parsed.action === "HISTORY") {
        smsReply = "Open app to view history: pesa-ai.vercel.app";
      } else if (parsed.action === "CLARIFY") {
        smsReply = parsed.explanation + (parsed.clarifyQuestion ? "\n" + parsed.clarifyQuestion : "");
      } else {
        smsReply = parsed.explanation;
      }
    }

    return NextResponse.json({
      id:       event.id,
      reply:    smsReply,   // ESP32 server sends this back as SMS
      parsed,
      status:   "pending",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
