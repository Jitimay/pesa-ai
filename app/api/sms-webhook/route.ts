import { NextResponse } from "next/server";
import { pushEvent, getEvents as storeGetEvents, updateEventStatus as storeUpdateStatus } from "@/lib/sms-store";

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

// In-memory ring buffer — last 50 SMS events (persisted via sms-store)
export function getEvents(): SmsEvent[] {
  return storeGetEvents();
}

export function updateEventStatus(id: string, status: SmsEvent["status"], txHash?: string) {
  storeUpdateStatus(id, status, txHash);
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

    // Build short SMS reply for ESP32 (keep under 160 chars, ASCII-safe)
    let smsReply = "Pesa AI: message received.";
    if (parsed) {
      if (parsed.action === "SEND") {
        const amt = parsed.amount ? `${parsed.amount} ${parsed.currency ?? "HSP"}` : "HSP";
        const fraudWarn = parsed.fraud?.level === "danger" ? " RISK DETECTED." : "";
        if (parsed.clarifyQuestion) {
          // Strip non-ASCII for SMS safety
          const q = (parsed.clarifyQuestion as string).replace(/[^\x00-\x7F]/g, "").trim().slice(0, 80);
          smsReply = `Pesa AI: Send ${amt}?${fraudWarn} ${q} Open: pesa-ai.vercel.app`;
        } else {
          smsReply = `Pesa AI: Payment ${amt} ready.${fraudWarn} Open app to confirm: pesa-ai.vercel.app`;
        }
      } else if (parsed.action === "CLARIFY") {
        const q = (parsed.clarifyQuestion as string ?? "Please provide more details.")
          .replace(/[^\x00-\x7F]/g, "").trim().slice(0, 100);
        smsReply = `Pesa AI: ${q}`;
      } else if (parsed.action === "CHECK") {
        smsReply = "Pesa AI: Check your balance at pesa-ai.vercel.app";
      } else if (parsed.action === "HISTORY") {
        smsReply = "Pesa AI: View history at pesa-ai.vercel.app";
      } else {
        smsReply = "Pesa AI: Try: SEND 10 HSP TO 0x... or CHECK BALANCE";
      }
    }
    // Ensure reply fits in one SMS (160 chars max)
    smsReply = smsReply.slice(0, 155);

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
