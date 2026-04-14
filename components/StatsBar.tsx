"use client";

import { useEffect, useState } from "react";
import { formatHSK, formatHSP, getContract, getProvider } from "@/lib/hashkey";
import { t, type Locale } from "@/lib/i18n";

type Stats = {
  totalTx: bigint;
  totalVolumeHSK: bigint;
  totalVolumeHSP: bigint;
};

export default function StatsBar({ locale }: { locale: Locale }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalTx: 0n,
    totalVolumeHSK: 0n,
    totalVolumeHSP: 0n,
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const contract = getContract(getProvider());
        const result = (await contract.getStats()) as [bigint, bigint, bigint, bigint];
        const [totalTx, , totalVolumeHSK, totalVolumeHSP] = result;
        if (mounted) setStats({ totalTx, totalVolumeHSK, totalVolumeHSP });
      } catch {
        if (mounted) setStats({ totalTx: 0n, totalVolumeHSK: 0n, totalVolumeHSP: 0n });
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <div className="mx-auto mt-3 w-full max-w-6xl px-4">
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-pesa-border bg-pesa-card/80 p-3 text-sm sm:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-pesa-border" />
          ))
        ) : (
          <>
            <div>
              {t(locale, "transactions")}:{" "}
              <span className="font-semibold text-pesa-accent">{stats.totalTx.toString()}</span>
            </div>
            <div>
              {t(locale, "hskVolume")}:{" "}
              <span className="text-pesa-muted">{formatHSK(stats.totalVolumeHSK)}</span>
            </div>
            <div>
              {t(locale, "hspVolume")}:{" "}
              <span className="font-semibold text-pesa-accent">{formatHSP(stats.totalVolumeHSP)}</span>
            </div>
            <div>
              Network:{" "}
              <span className="text-pesa-success">HashKey ✓</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
