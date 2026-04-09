"use client";

import { useEffect, useState } from "react";
import { formatHSK, formatHSP, getContract, getProvider } from "@/lib/hashkey";
import type { Locale } from "@/lib/i18n";
import { t } from "@/lib/i18n";

// Static impact numbers (real-world context for judges)
const UNBANKED_BILLIONS = 1.4;
const AVG_BANK_FEE_PCT  = 6.3;  // World Bank avg remittance fee %
const PESA_FEE_PCT      = 0.1;  // on-chain gas only
const COUNTRIES         = ["🇧🇮", "🇰🇪", "🇷🇼", "🇹🇿", "🇨🇩", "🇺🇬"];

type ChainStats = {
  totalTx: bigint;
  totalVolumeHSK: bigint;
  totalVolumeHSP: bigint;
};

type ImpactDashboardProps = {
  locale: Locale;
};

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const step  = value / 40;
    let current = 0;
    const id = setInterval(() => {
      current = Math.min(current + step, value);
      setDisplay(Math.floor(current));
      if (current >= value) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [value]);

  return <span>{display.toLocaleString()}{suffix}</span>;
}

export default function ImpactDashboard({ locale }: ImpactDashboardProps) {
  const [stats, setStats] = useState<ChainStats>({
    totalTx: 0n,
    totalVolumeHSK: 0n,
    totalVolumeHSP: 0n,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const contract = getContract(getProvider());
        const result   = (await contract.getStats()) as [bigint, bigint, bigint, bigint];
        const [totalTx, , totalVolumeHSK, totalVolumeHSP] = result;
        if (mounted) setStats({ totalTx, totalVolumeHSK, totalVolumeHSP });
      } catch {
        // silently fail — show zeros
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const feeSaved = (AVG_BANK_FEE_PCT - PESA_FEE_PCT).toFixed(1);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <span className="text-2xl">🌍</span>
        <h2 className="text-2xl font-semibold">{t(locale, "impactTitle")}</h2>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* On-chain transactions */}
        <div className="rounded-xl border border-pesa-border bg-pesa-card p-4">
          <p className="text-xs uppercase tracking-wide text-pesa-muted">
            {t(locale, "transactions")}
          </p>
          <p className="mt-2 text-3xl font-bold text-pesa-accent">
            {loading ? "—" : <AnimatedNumber value={Number(stats.totalTx)} />}
          </p>
          <p className="mt-1 text-xs text-pesa-muted">on HashKey Chain</p>
        </div>

        {/* HSP volume */}
        <div className="rounded-xl border border-pesa-border bg-pesa-card p-4">
          <p className="text-xs uppercase tracking-wide text-pesa-muted">
            {t(locale, "hspVolume")}
          </p>
          <p className="mt-2 text-2xl font-bold text-pesa-accent">
            {loading ? "—" : formatHSP(stats.totalVolumeHSP)}
          </p>
          <p className="mt-1 text-xs text-pesa-muted">PayFi settled</p>
        </div>

        {/* Countries */}
        <div className="rounded-xl border border-pesa-border bg-pesa-card p-4">
          <p className="text-xs uppercase tracking-wide text-pesa-muted">
            {t(locale, "impactCountries")}
          </p>
          <p className="mt-2 text-3xl font-bold text-pesa-success">
            <AnimatedNumber value={COUNTRIES.length} />
          </p>
          <div className="mt-1 flex flex-wrap gap-0.5 text-sm">
            {COUNTRIES.map((f) => <span key={f}>{f}</span>)}
          </div>
        </div>

        {/* Fee saved */}
        <div className="rounded-xl border border-pesa-border bg-pesa-card p-4">
          <p className="text-xs uppercase tracking-wide text-pesa-muted">
            {t(locale, "impactSaved")}
          </p>
          <p className="mt-2 text-3xl font-bold text-pesa-success">
            ~{feeSaved}%
          </p>
          <p className="mt-1 text-xs text-pesa-muted">
            vs {AVG_BANK_FEE_PCT}% bank avg
          </p>
        </div>
      </div>

      {/* Market context banner */}
      <div className="mt-4 rounded-xl border border-pesa-accent/20 bg-pesa-accent/5 px-4 py-3 text-sm">
        <span className="text-pesa-accent font-semibold">
          {UNBANKED_BILLIONS}B unbanked people
        </span>
        <span className="text-pesa-muted">
          {" "}pay avg {AVG_BANK_FEE_PCT}% to send money home.
          Pesa AI settles the same payment on HashKey Chain for ~{PESA_FEE_PCT}% in gas.
        </span>
      </div>

      {/* HSK volume row */}
      {!loading && stats.totalVolumeHSK > 0n && (
        <div className="mt-3 rounded-lg border border-pesa-border bg-pesa-card/50 px-4 py-2 text-sm text-pesa-muted">
          HSK volume: {formatHSK(stats.totalVolumeHSK)}
        </div>
      )}
    </section>
  );
}
