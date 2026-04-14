"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import type { SmsEvent } from "@/app/api/sms-webhook/route";
import type { WalletState } from "@/lib/contract";
import {
  formatAddress, formatHSK, formatHSP,
  getContract, getHspContract, getExplorerTxLink, getSigner, isValidAddress,
} from "@/lib/hashkey";

type Props = { wallet: WalletState };

const DEMO_RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const POLL_INTERVAL  = 3000;

function statusBadge(status: SmsEvent["status"]) {
  const map: Record<SmsEvent["status"], { label: string; cls: string }> = {
    pending:    { label: "Pending",    cls: "bg-pesa-border text-pesa-muted" },
    processing: { label: "Processing", cls: "bg-pesa-accent/20 text-pesa-accent" },
    settled:    { label: "Settled ✓",  cls: "bg-pesa-success/20 text-pesa-success" },
    failed:     { label: "Failed",     cls: "bg-red-500/20 text-red-400" },
    cancelled:  { label: "Cancelled",  cls: "bg-pesa-border text-pesa-muted" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function fraudBadge(level?: string) {
  if (!level || level === "safe") return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      level === "danger" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"
    }`}>
      {level === "danger" ? "🚨 High Risk" : "⚠️ Warning"}
    </span>
  );
}

export default function LiveSmsTerminal({ wallet }: Props) {
  const [events, setEvents]     = useState<SmsEvent[]>([]);
  const [settling, setSettling] = useState<string | null>(null);
  const [error, setError]       = useState("");
  const [open, setOpen]         = useState(true);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);
  const seenIds  = useRef<Set<string>>(new Set());
  const listRef  = useRef<HTMLDivElement>(null);

  // ── Poll for new SMS events ─────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res  = await fetch("/api/sms-webhook/events");
      if (!res.ok) return;
      const data = (await res.json()) as { events: SmsEvent[] };
      setEvents(data.events);
      setLastPoll(new Date());
      // Scroll to top on new event
      const newIds = data.events.filter((e) => !seenIds.current.has(e.id));
      if (newIds.length > 0) {
        newIds.forEach((e) => seenIds.current.add(e.id));
        setOpen(true); // auto-expand on new SMS
        if (listRef.current) listRef.current.scrollTop = 0;
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  // ── Settle a pending SMS payment on-chain ───────────────────────────────────
  const settle = async (event: SmsEvent) => {
    if (!wallet.isConnected || !wallet.isCorrectNetwork) {
      setError("Connect wallet and switch to HashKey Testnet first.");
      return;
    }
    if (!event.parsed || event.parsed.action !== "SEND") return;

    setSettling(event.id);
    setError("");

    try {
      const p         = event.parsed;
      const currency  = p.currency ?? "HSP";
      const useHSP    = currency !== "HSK";
      const recipient = p.recipient && isValidAddress(p.recipient) ? p.recipient : DEMO_RECIPIENT;

      // Convert amount
      let amount: bigint;
      if (currency === "HSP" || currency === "HSK") {
        const val = p.amount && p.amount > 0 ? p.amount : 1;
        amount = ethers.parseEther(val.toFixed(6));
      } else {
        const val = p.amount && p.amount > 0 ? p.amount : 1;
        const hsp = currency === "FBU" ? val * 0.00035 : val;
        amount = ethers.parseEther(Math.max(hsp, 0.000001).toFixed(6));
      }

      const signer   = await getSigner();
      const contract = getContract(signer);
      let tx;

      if (useHSP) {
        const hsp = getHspContract(signer);
        await (await hsp.approve(await contract.getAddress(), amount)).wait();
        tx = await contract.logPaymentHSP(recipient, amount, currency, event.message);
      } else {
        tx = await contract.logPaymentHSK(recipient, amount, currency, event.message, { value: amount });
      }

      const receipt = await tx.wait();
      const ok      = receipt?.status === 1;

      // Report back to server
      await fetch("/api/sms-webhook/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id:     event.id,
          txHash: tx.hash,
          status: ok ? "settled" : "failed",
        }),
      });

      await poll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg.slice(0, 120));
      await fetch("/api/sms-webhook/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, status: "failed" }),
      });
      await poll();
    } finally {
      setSettling(null);
    }
  };

  const cancel = async (event: SmsEvent) => {
    await fetch("/api/sms-webhook/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: event.id, status: "cancelled" }),
    });
    await poll();
  };

  const pendingCount = events.filter((e) => e.status === "pending" && e.parsed?.action === "SEND").length;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-8">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-pesa-border bg-pesa-card px-4 py-3 text-sm font-medium hover:border-pesa-accent/50 transition"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <span>Live SMS Terminal</span>
          <span className="text-xs text-pesa-muted">— Real incoming SMS from ESP32</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-pesa-accent px-2 py-0.5 text-xs font-bold text-black">
              {pendingCount} pending
            </span>
          )}
        </span>
        <span className="text-pesa-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-pesa-border bg-pesa-card">
          {/* Connection info */}
          <div className="flex items-center gap-2 border-b border-pesa-border px-4 py-2 text-xs text-pesa-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-pesa-success animate-pulseSoft" />
            <span>Live — polling every 3s</span>
            {lastPoll && (
              <span className="text-pesa-border">
                last: {lastPoll.toLocaleTimeString()}
              </span>
            )}
            <span className="ml-auto">
              <code className="text-pesa-accent">POST /api/sms-webhook</code>
            </span>
          </div>

          {error && (
            <div className="mx-4 mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Event list */}
          <div ref={listRef} className="sms-scroll max-h-[480px] overflow-y-auto p-4 space-y-3">
            {events.length === 0 ? (
              <div className="rounded-lg border border-dashed border-pesa-border p-8 text-center text-pesa-muted">
                <p className="text-2xl">📱</p>
                <p className="mt-2 text-sm">Waiting for real SMS from your ESP32...</p>
                <p className="mt-1 text-xs">
                  Configure your Andasy.io server to POST to{" "}
                  <code className="text-pesa-accent">/api/sms-webhook</code>
                </p>
              </div>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className={`rounded-xl border p-4 transition ${
                    ev.status === "settled"
                      ? "border-pesa-success/30 bg-pesa-success/5"
                      : ev.status === "failed"
                      ? "border-red-500/30 bg-red-500/5"
                      : ev.status === "cancelled"
                      ? "border-pesa-border bg-pesa-border/10 opacity-60"
                      : "border-pesa-border bg-pesa-card/50"
                  }`}
                >
                  {/* Top row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-pesa-accent">{ev.sender}</span>
                    {statusBadge(ev.status)}
                    {fraudBadge(ev.parsed?.fraud?.level)}
                    <span className="ml-auto text-xs text-pesa-muted">
                      {new Date(ev.receivedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Raw SMS */}
                  <p className="mt-2 rounded-lg bg-[#0d1117] px-3 py-2 font-mono text-sm text-pesa-text">
                    {ev.message}
                  </p>

                  {/* AI parse result */}
                  {ev.parsed && (
                    <div className="mt-2 space-y-1 text-xs text-pesa-muted">
                      <p>
                        <span className="text-pesa-accent">AI:</span>{" "}
                        {ev.parsed.explanation}
                        <span className="ml-2 opacity-60">
                          {(ev.parsed.confidence * 100).toFixed(0)}% · {ev.parsed.detectedLanguage}
                        </span>
                      </p>
                      {ev.parsed.action === "SEND" && (
                        <p>
                          <span className="text-pesa-accent">Payment:</span>{" "}
                          {ev.parsed.amount ?? "?"} {ev.parsed.currency ?? "HSP"}
                          {" → "}
                          {ev.parsed.recipient
                            ? isValidAddress(ev.parsed.recipient)
                              ? formatAddress(ev.parsed.recipient)
                              : ev.parsed.recipient
                            : "demo address"}
                        </p>
                      )}
                      {ev.parsed.route && (
                        <p>
                          <span className="text-pesa-accent">Route:</span>{" "}
                          {ev.parsed.route.label} · ~${ev.parsed.route.estimatedFeeUSD.toFixed(4)} fee
                        </p>
                      )}
                      {ev.parsed.fraud && ev.parsed.fraud.flags.length > 0 && (
                        <p className="text-yellow-400">
                          ⚠️ {ev.parsed.fraud.flags.join(" · ")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Settled tx link */}
                  {ev.txHash && (
                    <a
                      href={getExplorerTxLink(ev.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block text-xs text-pesa-accent hover:underline"
                    >
                      ✓ TX: {formatAddress(ev.txHash)} ↗ explorer
                    </a>
                  )}

                  {/* Action buttons for pending SEND */}
                  {ev.status === "pending" && ev.parsed?.action === "SEND" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void settle(ev)}
                        disabled={settling === ev.id}
                        className="rounded-lg bg-pesa-accent px-4 py-1.5 text-xs font-bold text-black disabled:opacity-60 transition hover:opacity-90 active:scale-95"
                      >
                        {settling === ev.id ? "Sending..." : "✓ Confirm & Pay on-chain"}
                      </button>
                      <button
                        onClick={() => void cancel(ev)}
                        disabled={settling === ev.id}
                        className="rounded-lg border border-pesa-border px-3 py-1.5 text-xs text-pesa-muted hover:text-pesa-text transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Setup instructions */}
          <div className="border-t border-pesa-border px-4 py-3 text-xs text-pesa-muted">
            <p className="font-semibold text-pesa-text mb-1">ESP32 / Andasy.io setup:</p>
            <p>In your Python server, after parsing the SMS, POST to:</p>
            <code className="mt-1 block rounded bg-[#0d1117] px-2 py-1 text-pesa-accent">
              POST [your-app-url]/api/sms-webhook
            </code>
            <code className="mt-1 block rounded bg-[#0d1117] px-2 py-1 text-pesa-muted">
              {`{ "sender": "+25761234567", "message": "SEND 10 HSP TO 0x..." }`}
            </code>
            <p className="mt-1">Add header: <code className="text-pesa-accent">x-webhook-secret: YOUR_SECRET</code></p>
          </div>
        </div>
      )}
    </section>
  );
}
