"use client";

import type { FraudSignal } from "@/lib/contract";

type Props = {
  fraud: FraudSignal;
  onProceed: () => void;
  onCancel: () => void;
};

const LEVEL_CONFIG = {
  safe: {
    icon: "✅",
    color: "border-pesa-success/40 bg-pesa-success/5",
    titleColor: "text-pesa-success",
    title: "Looks safe",
  },
  warning: {
    icon: "⚠️",
    color: "border-yellow-500/40 bg-yellow-500/5",
    titleColor: "text-yellow-400",
    title: "Proceed with caution",
  },
  danger: {
    icon: "🚨",
    color: "border-red-500/40 bg-red-500/10",
    titleColor: "text-red-400",
    title: "High risk detected",
  },
};

export default function FraudShield({ fraud, onProceed, onCancel }: Props) {
  const cfg = LEVEL_CONFIG[fraud.level];

  // Safe with no flags — don't render anything, auto-proceed
  if (fraud.level === "safe" && fraud.flags.length === 0) return null;

  return (
    <div className={`mt-2 rounded-xl border p-4 ${cfg.color}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{cfg.icon}</span>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${cfg.titleColor}`}>
            {cfg.title}
            <span className="ml-2 text-xs font-normal opacity-70">
              Risk score: {fraud.score}/100
            </span>
          </p>

          {fraud.flags.length > 0 && (
            <ul className="mt-2 space-y-1">
              {fraud.flags.map((flag, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-pesa-muted">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs text-pesa-muted">{fraud.recommendation}</p>

          {/* Only show buttons for warning/danger */}
          {fraud.level !== "safe" && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={onCancel}
                className="rounded-lg border border-pesa-border px-3 py-1.5 text-xs font-semibold text-pesa-muted hover:text-pesa-text transition"
              >
                Cancel
              </button>
              <button
                onClick={onProceed}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition
                  ${fraud.level === "danger"
                    ? "border-red-500/60 text-red-400 hover:bg-red-500/10"
                    : "border-yellow-500/60 text-yellow-400 hover:bg-yellow-500/10"
                  }`}
              >
                {fraud.level === "danger" ? "Send anyway (risky)" : "Proceed"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
