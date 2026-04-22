import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { pushEvent, getEvents as storeGetEvents, updateEventStatus as storeUpdateStatus } from "@/lib/sms-store";
import { RPC_URL, CONTRACT_ADDRESS, HSP_TOKEN_ADDRESS, PESA_AI_ABI, HSP_ABI } from "@/lib/hashkey";

// ── Alias book — maps names to wallet addresses ───────────────────────────────
// Add your demo contacts here
const ALIAS_BOOK: Record<string, string> = {
  "mama":   "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "maman":  "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "mom":    "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "papa":   "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "jean":   "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "alice":  "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
};

async function resolveRecipient(recipient: string | null): Promise<string | null> {
  if (!recipient) return null;
  if (ethers.isAddress(recipient)) return recipient;
  
  const aliasStr: string = recipient;
  const alias = aliasStr.toLowerCase().trim();

  // 1. Try on-chain registry first
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, PESA_AI_ABI, provider);
    const onChainAddr = await contract.resolveAlias(alias);
    if (onChainAddr && onChainAddr !== ethers.ZeroAddress) {
      return onChainAddr;
    }
  } catch (err) {
    console.error("[webhook] On-chain alias lookup failed:", err);
  }

  // 2. Fallback to demo book
  return ALIAS_BOOK[alias] ?? null;
}

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

function getEvents(): SmsEvent[] {
  return storeGetEvents();
}

function updateEventStatus(id: string, status: SmsEvent["status"], txHash?: string) {
  storeUpdateStatus(id, status, txHash);
}

// ── Server-side wallet settlement (no MetaMask needed) ────────────────────────

async function settleOnChain(event: SmsEvent): Promise<void> {
  console.log(`[settle] Starting for event ${event.id}`);
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || !CONTRACT_ADDRESS || !HSP_TOKEN_ADDRESS) {
    console.log("[settle] ABORT: Missing env variables");
    storeUpdateStatus(event.id, "failed");
    return;
  }

  const p = event.parsed;
  if (!p || p.action !== "SEND") {
    console.log("[settle] ABORT: Not a SEND action");
    return;
  }

  storeUpdateStatus(event.id, "processing");
  console.log("[settle] Status updated to processing");

  // Need a valid recipient address for auto-settlement
  console.log(`[settle] Resolving recipient: ${p.recipient}`);
  const resolvedRecipient = await resolveRecipient(p.recipient);
  if (!resolvedRecipient) {
    console.log("[settle] ABORT: Could not resolve recipient");
    storeUpdateStatus(event.id, "failed");
    return;
  }
  console.log(`[settle] Resolved to: ${resolvedRecipient}`);

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet   = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, PESA_AI_ABI, wallet);
    const hsp      = new ethers.Contract(HSP_TOKEN_ADDRESS, HSP_ABI, wallet);

    const currency = p.currency ?? "HSP";
    const useHSP   = currency !== "HSK";
    const recipient = resolvedRecipient;

    // Convert amount
    const val = p.amount && p.amount > 0 ? p.amount : 1;
    const amount = ethers.parseEther(val.toFixed(6));

    console.log(`[settle] Preparing ${useHSP ? "HSP" : "HSK"} transaction...`);

    let tx;
    if (useHSP) {
      console.log("[settle] Sending HSP Approval...");
      const approveTx = await hsp.approve(CONTRACT_ADDRESS, amount);
      console.log(`[settle] Approval sent: ${approveTx.hash}. Waiting for confirmation...`);
      await approveTx.wait();
      console.log("[settle] Approval confirmed. Sending logPaymentHSP...");
      tx = await contract.logPaymentHSP(recipient, amount, currency, event.message);
    } else {
      console.log("[settle] Sending logPaymentHSK...");
      tx = await contract.logPaymentHSK(recipient, amount, currency, event.message, { value: amount });
    }

    console.log(`[settle] TX sent: ${tx.hash}. Waiting for finality...`);
    const receipt = await tx.wait();
    const ok = receipt?.status === 1;

    storeUpdateStatus(event.id, ok ? "settled" : "failed", tx.hash);
    console.log(`[settle] COMPLETED: ${tx.hash} status=${ok ? "settled" : "failed"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("[settle] FATAL ERROR:", msg);
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
    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    
    console.log(`[webhook] Calling parse-intent at: ${baseUrl}/api/parse-intent`);
    
    const parseRes = await fetch(`${baseUrl}/api/parse-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsText: message }),
    });

    if (!parseRes.ok) {
      console.error(`[webhook] parse-intent failed with status: ${parseRes.status}`);
    }
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

    // Auto-settle — await it so Vercel doesn't kill it before completion
    console.log("[webhook] parsed:", parsed?.action, "| fraud:", parsed?.fraud?.level, "| recipient:", parsed?.recipient);
    if (parsed?.action === "SEND" && parsed.fraud?.level !== "danger") {
      await settleOnChain(event);
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
