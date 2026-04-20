import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { pushEvent, getEvents as storeGetEvents, updateEventStatus as storeUpdateStatus } from "@/lib/sms-store";
import { RPC_URL, CONTRACT_ADDRESS, HSP_TOKEN_ADDRESS, PESA_AI_ABI, HSP_ABI } from "@/lib/hashkey";

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
    clarifyQuestion?: string | null;
    fraud: { level: string; score: number; flags: string[] } | null;
    route: { id: string; label: string; estimatedFeeUSD: number } | null;
  };
  status: "pending" | "processing" | "settled" | "failed" | "cancelled";
  txHash?: string;
};

export function getEvents(): SmsEvent[] {
  return storeGetEvents();
}

export function updateEventStatus(id: string, status: SmsEvent["status"], txHash?: string) {
  storeUpdateStatus(id, status, txHash);
}

// ── Server-side wallet settlement (no MetaMask needed) ────────────────────────

async function settleOnChain(event: SmsEvent): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !CONTRACT_ADDRESS || !HSP_TOKEN_ADDRESS) {
    console.log("[webhook] Auto-settle skipped — missing PRIVATE_KEY or contract addresses");
    return;
  }

  const p = event.parsed;
  if (!p || p.action !== "SEND" || p.fraud?.level === "danger") return;

  // Need a valid recipient address for auto-settlement
  const isValidAddr = p.recipient && ethers.isAddress(p.recipient);
  if (!isValidAddr) {
    console.log("[webhook] Auto-settle skipped — no valid recipient address");
    return;
  }

  storeUpdateStatus(event.id, "processing");

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet   = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, PESA_AI_ABI, wallet);
    const hsp      = new ethers.Contract(HSP_TOKEN_ADDRESS, HSP_ABI, wallet);

    const currency = p.currency ?? "HSP";
    const useHSP   = currency !== "HSK";
    const recipient = p.recipient!;

    // Convert amount
    let amount: bigint;
    if (currency === "HSP" || currency === "HSK") {
      const val = p.amount && p.amount > 0 ? p.amount : 1;
      amount = ethers.parseEther(val.toFixed(6));
    } else {
      const val = p.amount && p.amount > 0 ? p.amount : 1;
      const hspAmt = currency === "FBU" ? val * 0.00035 : val;
      amount = ethers.parseEther(Math.max(hspAmt, 0.000001).toFixed(6));
    }

    let tx;
    if (useHSP) {
      // Approve then transfer
      const approveTx = await hsp.approve(CONTRACT_ADDRESS, amount);
      await approveTx.wait();
      tx = await contract.logPaymentHSP(recipient, amount, currency, event.message);
    } else {
      tx = await contract.logPaymentHSK(recipient, amount, currency, event.message, { value: amount });
    }

    const receipt = await tx.wait();
    const ok = receipt?.status === 1;

    storeUpdateStatus(event.id, ok ? "settled" : "failed", tx.hash);
    console.log(`[webhook] Auto-settled: ${tx.hash} status=${ok ? "settled" : "failed"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[webhook] Auto-settle error:", msg);
    storeUpdateStatus(event.id, "failed");
  }
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-webhook-secret") ?? "";
    const expectedSecret = process.env.SMS_WEBHOOK_SECRET ?? "";
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { sender?: string; message?: string };
    const sender  = typeof body.sender  === "string" ? body.sender.trim()  : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!sender || !message) {
      return NextResponse.json({ error: "sender and message required" }, { status: 400 });
    }

    // Parse intent
    const baseUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const parseRes = await fetch(`${baseUrl}/api/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsText: message }),
    });

    const parsed = parseRes.ok ? (await parseRes.json()) as SmsEvent["parsed"] : null;

    const event: SmsEvent = {
      id:         crypto.randomUUID(),
      sender,
      message,
      receivedAt: Date.now(),
      parsed:     parsed ?? undefined,
      status:     "pending",
    };

    pushEvent(event);

    // Auto-settle in background — don't await, return SMS reply immediately
    if (parsed?.action === "SEND" && parsed.fraud?.level !== "danger") {
      void settleOnChain(event);
    }

    // Build SMS reply
    let smsReply = "Pesa AI: message received.";
    if (parsed) {
      if (parsed.action === "SEND") {
        const amt      = parsed.amount ? `${parsed.amount} ${parsed.currency ?? "HSP"}` : "HSP";
        const fraudWarn = parsed.fraud?.level === "danger" ? " RISK DETECTED." : "";
        const hasAddr   = parsed.recipient && ethers.isAddress(parsed.recipient);
        if (parsed.clarifyQuestion && !hasAddr) {
          const q = (parsed.clarifyQuestion as string).replace(/[^\x00-\x7F]/g, "").trim().slice(0, 80);
          smsReply = `Pesa AI: Send ${amt}?${fraudWarn} ${q}`;
        } else {
          smsReply = `Pesa AI: Sending ${amt} now...${fraudWarn} Track: pesa-ai.vercel.app`;
        }
      } else if (parsed.action === "CLARIFY") {
        const q = (parsed.clarifyQuestion as string ?? "Please provide more details.")
          .replace(/[^\x00-\x7F]/g, "").trim().slice(0, 100);
        smsReply = `Pesa AI: ${q}`;
      } else if (parsed.action === "CHECK") {
        smsReply = "Pesa AI: Check balance at pesa-ai.vercel.app";
      } else if (parsed.action === "HISTORY") {
        smsReply = "Pesa AI: View history at pesa-ai.vercel.app";
      } else {
        smsReply = "Pesa AI: Try: SEND 10 HSP TO 0x... or CHECK BALANCE";
      }
    }
    smsReply = smsReply.slice(0, 155);

    return NextResponse.json({ id: event.id, reply: smsReply, parsed, status: "pending" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
