"use client";

import { useEffect, useState } from "react";
import { formatHSK, getContract, getProvider } from "@/lib/hashkey";
import type { Locale } from "@/lib/i18n";

type Stats = {
  totalTx: bigint;
  totalVolumeHSK: bigint;
};

type Props = {
  locale: Locale;
};

export default function StatsBar({ locale: _locale }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({ totalTx: 0n, totalVolumeHSK: 0n });

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const contract = getContract(getProvider());
        const [totalTx, _contractBalance, totalVolumeHSK] = (await contract.getStats()) as [
          bigint,
          bigint,
          bigint,
        ];

        if (mounted) {
          setStats({ totalTx, totalVolumeHSK });
        }
      } catch (_err) {
        if (mounted) {
          setStats({ totalTx: 0n, totalVolumeHSK: 0n });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => void load(), 30000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mx-auto mt-3 w-full max-w-6xl px-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-pesa-border bg-pesa-card/80 p-3 text-sm sm:grid-cols-3">
        {loading ? (
          <>
            <div className="h-8 animate-pulse rounded bg-pesa-border" />
            <div className="h-8 animate-pulse rounded bg-pesa-border" />
            <div className="h-8 animate-pulse rounded bg-pesa-border" />
          </>
        ) : (
          <>
            <div>Total Transactions: {stats.totalTx.toString()}</div>
            <div>Total Volume: {formatHSK(stats.totalVolumeHSK)}</div>
            <div>Network: HashKey Testnet ✓</div>
          </>
        )}
      </div>
    </div>
  );
}
