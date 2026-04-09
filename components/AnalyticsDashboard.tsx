"use client";

import { useEffect, useState } from "react";
import { getSummary, type AnalyticsSummary } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n";

type Props = { locale: Locale };

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 text-pesa-muted">{label}</span>
      <div className="flex-1 rounded-full bg-pesa-border h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-pesa-muted">{value}</span>
    </div>
  );
}

export default function AnalyticsDashboard({ locale: _locale }: Props) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [open, setOpen]       = useState(false);

  useEffect(() => {
    if (open) setSummary(getSummary());
  }, [open]);

  const maxLang   = summary ? Math.max(...Object.values(summary.languageBreakdown), 1) : 1;
  const maxAction = summary ? Math.max(...Object.values(summary.actionBreakdown), 1) : 1;

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-pesa-border bg-pesa-card px-4 py-3 text-sm font-medium hover:border-pesa-accent/50 transition"
      >
        <span className="flex items-center gap-2">
          <span>📊</span>
          <span>Session Analytics</span>
        </span>
        <span className="text-pesa-muted">{open ? "▲" : "▼"}</span>
      </button>

      {open && summary && (
        <div className="mt-2 rounded-xl border border-pesa-border bg-pesa-card p-4">
          {/* Top metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm mb-4">
            <div className="rounded-lg bg-pesa-border/40 p-3">
              <p className="text-xs text-pesa-muted">AI Parses</p>
              <p className="text-xl font-bold text-pesa-accent">{summary.totalParses}</p>
            </div>
            <div className="rounded-lg bg-pesa-border/40 p-3">
              <p className="text-xs text-pesa-muted">Success Rate</p>
              <p className="text-xl font-bold text-pesa-success">{summary.successRate}%</p>
            </div>
            <div className="rounded-lg bg-pesa-border/40 p-3">
              <p className="text-xs text-pesa-muted">Avg Confidence</p>
              <p className="text-xl font-bold text-pesa-accent">{summary.avgConfidence}%</p>
            </div>
            <div className="rounded-lg bg-pesa-border/40 p-3">
              <p className="text-xs text-pesa-muted">Tx (24h)</p>
              <p className="text-xl font-bold text-pesa-success">{summary.last24hTx}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Language breakdown */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pesa-muted">
                Language Breakdown
              </p>
              <div className="space-y-2">
                {Object.entries(summary.languageBreakdown).map(([lang, count]) => (
                  <Bar key={lang} label={lang} value={count} max={maxLang} color="bg-pesa-accent" />
                ))}
                {Object.keys(summary.languageBreakdown).length === 0 && (
                  <p className="text-xs text-pesa-muted">No data yet</p>
                )}
              </div>
            </div>

            {/* Action breakdown */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-pesa-muted">
                Command Breakdown
              </p>
              <div className="space-y-2">
                {Object.entries(summary.actionBreakdown).map(([action, count]) => (
                  <Bar key={action} label={action} value={count} max={maxAction} color="bg-pesa-success" />
                ))}
                {Object.keys(summary.actionBreakdown).length === 0 && (
                  <p className="text-xs text-pesa-muted">No data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Bottom row */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-pesa-muted border-t border-pesa-border pt-3">
            <span>HSP settled: <span className="text-pesa-accent">{summary.hspVolume.toFixed(2)}</span></span>
            <span>HSK settled: <span className="text-pesa-muted">{summary.hskVolume.toFixed(4)}</span></span>
            <span>Retries: <span className="text-pesa-muted">{summary.retries}</span></span>
            <span>Faucet claims: <span className="text-pesa-accent">{summary.faucetClaims}</span></span>
            <span>Tx errors: <span className={summary.txErrors > 0 ? "text-red-400" : "text-pesa-muted"}>{summary.txErrors}</span></span>
          </div>
        </div>
      )}
    </section>
  );
}
