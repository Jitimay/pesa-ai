"use client";

import { useState } from "react";
import { getHspContract, getSigner } from "@/lib/hashkey";
import { track } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

type Props = {
  isConnected: boolean;
  isCorrectNetwork: boolean;
  locale: Locale;
  onClaimed?: () => void;
};

export default function FaucetButton({ isConnected, isCorrectNetwork, locale, onClaimed }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError]   = useState("");

  const claim = async () => {
    if (!isConnected || !isCorrectNetwork) return;
    setStatus("loading");
    setError("");
    try {
      const signer = await getSigner();
      const hsp    = getHspContract(signer);
      const tx     = await hsp.faucet();
      await tx.wait();
      setStatus("success");
      track({ type: "faucet_claim", ts: Date.now() });
      onClaimed?.();
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Faucet failed";
      // Cooldown error is expected
      setError(msg.includes("cooldown") ? "Cooldown active — try again in 24h" : msg.slice(0, 80));
      setStatus("error");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };

  if (!isConnected || !isCorrectNetwork) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={claim}
        disabled={status === "loading" || status === "success"}
        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition
          ${status === "success"
            ? "border-pesa-success/60 bg-pesa-success/10 text-pesa-success"
            : status === "error"
            ? "border-red-500/60 bg-red-500/10 text-red-400"
            : "border-pesa-accent/60 bg-pesa-card text-pesa-accent hover:bg-pesa-accent/10"
          } disabled:opacity-60`}
      >
        {status === "loading" ? t(locale, "gettingHsp")
          : status === "success" ? t(locale, "hspClaimed")
          : status === "error"   ? (error || "Error")
          : t(locale, "getHsp")}
      </button>
    </div>
  );
}
