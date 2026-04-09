"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import type { ParsedIntent, PaymentRecord, WalletState } from "@/lib/contract";
import {
  formatAddress,
  formatHSK,
  formatHSP,
  getContract,
  getHspContract,
  getExplorerTxLink,
  getSigner,
  isValidAddress,
  EXPLORER_URL,
} from "@/lib/hashkey";
import { track } from "@/lib/analytics";
import { enqueue, dequeue, getQueue, incrementAttempts, type QueuedPayment } from "@/lib/queue";
import { t, type Locale } from "@/lib/i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

type MessageType = "sent" | "received" | "system" | "error";

type Message = {
  id: string;
  type: MessageType;
  text: string;
  link?: { href: string; label: string };
  retryPayload?: QueuedPayment;
};

type Props = { wallet: WalletState; locale: Locale };

const DEMO_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const MIN_CONFIDENCE = 0.6; // below this, ask for clarification
const MAX_RETRIES    = 3;

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({
  message,
  onRetry,
}: {
  message: Message;
  onRetry?: (payload: QueuedPayment) => void;
}) {
  if (message.type === "system") {
    return <div className="my-2 text-center text-xs text-pesa-muted">{message.text}</div>;
  }

  const sent    = message.type === "sent";
  const isError = message.type === "error";

  return (
    <div className={`my-2 flex ${sent ? "justify-end" : "justify-start"} animate-fade-up`}>
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm
          ${sent    ? "bg-pesa-accent text-black"
          : isError ? "border border-red-500/40 bg-red-500/10 text-red-300"
          :           "border border-pesa-border bg-pesa-card text-pesa-text"}`}
      >
        {message.text}
        {message.link && (
          <a
            href={message.link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block text-xs underline opacity-80 hover:opacity-100"
          >
            {message.link.label} ↗
          </a>
        )}
        {message.retryPayload && onRetry && (
          <button
            onClick={() => onRetry(message.retryPayload!)}
            className="mt-2 block rounded-lg border border-red-400/60 px-3 py-1 text-xs text-red-300 hover:bg-red-500/10"
          >
            ↺ Retry
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SMSTerminal({ wallet, locale }: Props) {
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);

  const charsLeft = useMemo(() => 160 - input.length, [input]);
  const uid = () => crypto.randomUUID();

  // Welcome message (locale-aware)
  useEffect(() => {
    setMessages([{
      id: "welcome",
      type: "received",
      text: t(locale, "welcomeMsg"),
    }]);
  }, [locale]);

  // Online/offline detection
  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  void flushQueue(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const pushMessage = (msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => {
      if (messageAreaRef.current) {
        messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
      }
    }, 30);
  };

  // ── Parse intent ────────────────────────────────────────────────────────────

  const parseIntent = async (smsText: string): Promise<ParsedIntent> => {
    const res  = await fetch("/api/parse-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ smsText }),
    });
    const body = (await res.json()) as ParsedIntent & { error?: string };
    if (!res.ok) throw new Error(body.error || "Failed to parse SMS intent");
    return body;
  };

  // ── Amount conversion ────────────────────────────────────────────────────────

  const toTokenUnits = (amount: number | null, currency: string | null): bigint => {
    if (currency === "HSP" || currency === "HSK") {
      const val = amount && amount > 0 ? amount : 1;
      return ethers.parseEther(val.toFixed(6));
    }
    const val = amount && amount > 0 ? amount : 1;
    const hsp = currency === "FBU" ? val * 0.00035 : val;
    return ethers.parseEther(Math.max(hsp, 0.000001).toFixed(6));
  };

  // ── CHECK BALANCE ────────────────────────────────────────────────────────────

  const handleCheckBalance = async () => {
    if (!wallet.isConnected || !wallet.address) {
      pushMessage({ id: uid(), type: "received", text: "Connect your wallet first." });
      return;
    }
    pushMessage({ id: uid(), type: "system", text: "Fetching balances..." });
    try {
      const signer   = await getSigner();
      const hsp      = getHspContract(signer);
      const provider = new ethers.BrowserProvider(window.ethereum!);
      const hskRaw   = await provider.getBalance(wallet.address);
      const hspRaw   = await hsp.balanceOf(wallet.address) as bigint;
      pushMessage({
        id: uid(), type: "received",
        text: `Your balances:\n💎 ${formatHSK(hskRaw)} (gas)\n🟡 ${formatHSP(hspRaw)} (PayFi)\n\n${formatAddress(wallet.address)}`,
        link: { href: `${EXPLORER_URL}/address/${wallet.address}`, label: "View on explorer" },
      });
    } catch (err) {
      pushMessage({ id: uid(), type: "error", text: `Balance error: ${err instanceof Error ? err.message : "Unknown"}` });
    }
  };

  // ── HISTORY ──────────────────────────────────────────────────────────────────

  const handleHistory = async () => {
    if (!wallet.isConnected || !wallet.address) {
      pushMessage({ id: uid(), type: "received", text: "Connect your wallet first." });
      return;
    }
    pushMessage({ id: uid(), type: "system", text: "Fetching payment history..." });
    try {
      const { RPC_URL } = await import("@/lib/hashkey");
      const provider    = new ethers.JsonRpcProvider(RPC_URL);
      const contract    = getContract(provider);
      const records     = await contract.getUserPaymentRecords(wallet.address) as PaymentRecord[];
      if (!records.length) {
        pushMessage({ id: uid(), type: "received", text: "No payments found yet. Send your first payment!" });
        return;
      }
      const lines = records.slice(-5).reverse().map((r) => {
        const isHSP = Number(r.token) === 1;
        const amt   = isHSP ? formatHSP(BigInt(r.amount)) : formatHSK(BigInt(r.amount));
        return `#${r.txId} → ${formatAddress(r.recipient)} · ${amt} [${isHSP ? "HSP" : "HSK"}]`;
      }).join("\n");
      pushMessage({
        id: uid(), type: "received",
        text: `Last ${Math.min(records.length, 5)} payments:\n\n${lines}`,
        link: { href: `${EXPLORER_URL}/address/${wallet.address}`, label: "Full history on explorer" },
      });
    } catch (err) {
      pushMessage({ id: uid(), type: "error", text: `History error: ${err instanceof Error ? err.message : "Unknown"}` });
    }
  };

  // ── SEND (with retry logic) ──────────────────────────────────────────────────

  const executeSend = async (
    recipient: string,
    amount: bigint,
    currency: string,
    smsText: string,
    useHSP: boolean,
    queueId?: string,
    attempt = 1,
  ) => {
    if (!wallet.isConnected || !wallet.isCorrectNetwork) return;

    try {
      const signer   = await getSigner();
      const contract = getContract(signer);
      let tx;

      if (useHSP) {
        pushMessage({ id: uid(), type: "system", text: "🔐 Approving HSP spend..." });
        const hsp       = getHspContract(signer);
        const approveTx = await hsp.approve(await contract.getAddress(), amount);
        await approveTx.wait();
        pushMessage({ id: uid(), type: "system", text: "🛰 Sending HSP payment..." });
        tx = await contract.logPaymentHSP(recipient, amount, currency, smsText);
      } else {
        pushMessage({ id: uid(), type: "system", text: "🛰 Sending HSK payment..." });
        tx = await contract.logPaymentHSK(recipient, amount, currency, smsText, { value: amount });
      }

      pushMessage({ id: uid(), type: "system", text: `TX: ${formatAddress(tx.hash)} — confirming...` });
      const receipt   = await tx.wait();
      const confirmed = receipt?.status === 1;
      const tokenTag  = useHSP ? "HSP" : "HSK";

      if (confirmed) {
        if (queueId) dequeue(queueId);
        track({ type: "tx_success", token: useHSP ? "HSP" : "HSK", amount: ethers.formatEther(amount), ts: Date.now() });
        pushMessage({
          id: uid(), type: "received",
          text: `✓ Payment settled on HashKey Chain!\n${tokenTag} → ${formatAddress(recipient)}\nTX: ${formatAddress(tx.hash)}`,
          link: { href: getExplorerTxLink(tx.hash), label: "View on explorer" },
        });
      } else {
        throw new Error("Transaction reverted on-chain");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      track({ type: "tx_error", reason: msg, ts: Date.now() });

      if (attempt < MAX_RETRIES) {
        track({ type: "tx_retry", attempt, ts: Date.now() });
        pushMessage({ id: uid(), type: "system", text: `${t(locale, "retrying")} (${attempt}/${MAX_RETRIES})` });
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        if (queueId) incrementAttempts(queueId);
        return executeSend(recipient, amount, currency, smsText, useHSP, queueId, attempt + 1);
      }

      // Queue for offline retry
      const queued = enqueue({
        smsText,
        recipient,
        amount: amount.toString(),
        currency,
        token: useHSP ? "HSP" : "HSK",
      });

      pushMessage({
        id: uid(), type: "error",
        text: `${t(locale, "txFailed")}\n${msg.slice(0, 120)}`,
        retryPayload: queued,
      });
    }
  };

  const handleSend = async (parsed: ParsedIntent) => {
    pushMessage({ id: uid(), type: "system", text: "⏳ Broadcasting transaction..." });

    const recipient = parsed.recipient && isValidAddress(parsed.recipient)
      ? parsed.recipient : DEMO_RECIPIENT;
    const currency  = parsed.currency ?? "HSP";
    const useHSP    = currency !== "HSK";

    if (!wallet.isConnected) {
      pushMessage({ id: uid(), type: "received", text: "Connect your MetaMask wallet to broadcast on-chain." });
      return;
    }
    if (!wallet.isCorrectNetwork) {
      pushMessage({ id: uid(), type: "received", text: "Wrong network. Switch to HashKey Chain Testnet." });
      return;
    }
    if (!isOnline) {
      const queued = enqueue({
        smsText: parsed.explanation ?? "",
        recipient,
        amount: toTokenUnits(parsed.amount, currency).toString(),
        currency,
        token: useHSP ? "HSP" : "HSK",
      });
      pushMessage({
        id: uid(), type: "error",
        text: t(locale, "offlineQueued"),
        retryPayload: queued,
      });
      return;
    }

    await executeSend(
      recipient,
      toTokenUnits(parsed.amount, currency),
      currency,
      parsed.explanation ?? "",
      useHSP,
    );
  };

  // ── Flush offline queue ──────────────────────────────────────────────────────

  const flushQueue = async () => {
    if (!wallet.isConnected || !wallet.isCorrectNetwork) return;
    const queue = getQueue();
    if (!queue.length) return;
    pushMessage({ id: uid(), type: "system", text: `Back online — retrying ${queue.length} queued payment(s)...` });
    for (const item of queue) {
      await executeSend(
        item.recipient,
        BigInt(item.amount),
        item.currency,
        item.smsText,
        item.token === "HSP",
        item.id,
      );
    }
  };

  // ── Manual retry from bubble ─────────────────────────────────────────────────

  const handleRetry = async (payload: QueuedPayment) => {
    dequeue(payload.id);
    await executeSend(
      payload.recipient,
      BigInt(payload.amount),
      payload.currency,
      payload.smsText,
      payload.token === "HSP",
    );
  };

  // ── Main submit ──────────────────────────────────────────────────────────────

  const handleSubmit = async (text: string) => {
    const smsText = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!smsText || loading) return;

    setLoading(true);
    setInput("");
    pushMessage({ id: uid(), type: "sent", text: smsText });
    pushMessage({ id: uid(), type: "system", text: "Pesa AI is thinking..." });

    try {
      const parsed = await parseIntent(smsText);

      track({
        type: "parse_success",
        action: parsed.action,
        language: parsed.detectedLanguage,
        confidence: parsed.confidence,
        ts: Date.now(),
      });

      // Low confidence — ask for clarification
      if (parsed.confidence < MIN_CONFIDENCE) {
        pushMessage({
          id: uid(), type: "received",
          text: `I'm not sure I understood that (${(parsed.confidence * 100).toFixed(0)}% confidence).\n${parsed.explanation}\n\nCould you rephrase? Example: SEND 10 HSP TO 0x...`,
        });
        return;
      }

      pushMessage({
        id: uid(), type: "received",
        text: `${parsed.explanation}\n${(parsed.confidence * 100).toFixed(0)}% · ${parsed.detectedLanguage}`,
      });

      if (parsed.action === "SEND")    await handleSend(parsed);
      if (parsed.action === "CHECK")   await handleCheckBalance();
      if (parsed.action === "HISTORY") await handleHistory();
      if (parsed.action === "UNKNOWN") {
        pushMessage({
          id: uid(), type: "received",
          text: "I didn't understand that command. Try:\n• SEND 10 HSP TO 0x...\n• CHECK BALANCE\n• HISTORY",
        });
      }
    } catch (err) {
      track({ type: "parse_error", error: err instanceof Error ? err.message : "Unknown", ts: Date.now() });
      pushMessage({ id: uid(), type: "error", text: `Error: ${err instanceof Error ? err.message : "Unexpected error"}` });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const examples = [
    "SEND 10 HSP TO 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "SEND 5 HSK TO 0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "Ohereza 50 HSP kuri 0xABC123def456abc123def456abc123def456abcd",
    "CHECK BALANCE",
    "HISTORY",
  ];

  return (
    <div className="rounded-[28px] border border-pesa-border bg-gradient-to-b from-[#121212] to-[#0a0a0a] p-3 shadow-2xl">
      <div className="rounded-2xl border border-pesa-border bg-black/30 p-3">

        {/* Header */}
        <div className="mb-3 flex items-center justify-between rounded-lg border border-pesa-border bg-pesa-card px-3 py-2 text-sm">
          <span className="font-semibold">Pesa AI</span>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                offline
              </span>
            )}
            <span className="text-xs text-pesa-accent">PayFi · HSP</span>
          </div>
        </div>

        {/* Example chips */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex.slice(0, 160))}
              className="rounded-full border border-pesa-border px-2 py-1 text-xs text-pesa-muted hover:border-pesa-accent hover:text-pesa-accent transition"
            >
              {ex.length > 26 ? `${ex.slice(0, 26)}…` : ex}
            </button>
          ))}
        </div>

        {/* Message area */}
        <div
          ref={messageAreaRef}
          className="sms-scroll h-80 overflow-y-auto rounded-xl bg-[#0d1117] p-3 sm:h-96"
        >
          {messages.map((msg) => (
            <Bubble key={msg.id} message={msg} onRetry={handleRetry} />
          ))}
          {loading && (
            <div className="my-2 flex justify-start">
              <div className="rounded-2xl border border-pesa-border bg-pesa-card px-3 py-2 text-sm">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pesa-terminal" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pesa-terminal [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-pesa-terminal [animation-delay:240ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 160))}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(input); }}
              placeholder={t(locale, "inputPlaceholder")}
              className="w-full rounded-lg border border-pesa-border bg-pesa-card px-3 py-2 text-sm outline-none focus:border-pesa-accent"
            />
            <p className={`mt-1 text-right text-xs ${charsLeft < 20 ? "text-pesa-accent" : "text-pesa-muted"}`}>
              {charsLeft}/160
            </p>
          </div>
          <button
            onClick={() => void handleSubmit(input)}
            disabled={!input.trim() || loading}
            className="rounded-lg bg-pesa-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-60 active:scale-95 transition"
          >
            {t(locale, "sendBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
