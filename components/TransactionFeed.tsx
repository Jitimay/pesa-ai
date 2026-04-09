"use client";

import { useEffect, useState } from "react";
import { EventLog } from "ethers";
import {
  formatHSK,
  formatHSP,
  formatAddress,
  getContract,
  getExplorerTxLink,
  getProvider,
} from "@/lib/hashkey";
import { t, type Locale } from "@/lib/i18n";

type FeedRow = {
  txId: string;
  sender: string;
  recipient: string;
  amount: string;
  currency: string;
  timestamp: bigint;
  transactionHash: string;
  token: number; // 0 = HSK, 1 = HSP
};

function timeAgo(unixSeconds: bigint): string {
  const delta = Math.max(1, Math.floor(Date.now() / 1000) - Number(unixSeconds));
  if (delta < 60)    return `${delta}s ago`;
  if (delta < 3600)  return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function TransactionFeed({ locale }: { locale: Locale }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState<FeedRow[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const provider = getProvider();
        const contract = getContract(provider);
        const logs     = await contract.queryFilter(
          contract.filters.PaymentLogged(),
          -4000,
        );

        const mapped = logs
          .slice(-10)
          .reverse()
          .filter((log): log is EventLog => "args" in log)
          .map((log) => {
            const args = log.args as unknown as {
              txId: bigint;
              sender: string;
              recipient: string;
              amount: bigint;
              currency: string;
              smsIntent: string;
              timestamp: bigint;
              token: number;
            };
            return {
              txId:            args.txId.toString(),
              sender:          args.sender,
              recipient:       args.recipient,
              amount:          args.amount.toString(),
              currency:        args.currency,
              timestamp:       args.timestamp,
              transactionHash: log.transactionHash,
              token:           Number(args.token),
            };
          });

        if (mounted) setRows(mapped);
      } catch {
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    const id = setInterval(() => void load(), 15000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20">
      <h2 className="text-2xl font-semibold">{t(locale, "liveActivity")}</h2>
      <div className="mt-4 rounded-xl border border-pesa-border bg-pesa-card p-4">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-pesa-border" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-pesa-border p-8 text-center text-pesa-muted">
            <p className="text-2xl">📭</p>
            <p className="mt-2">{t(locale, "noTxYet")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const isHSP    = row.token === 1;
              const amtLabel = isHSP
                ? formatHSP(BigInt(row.amount))
                : formatHSK(BigInt(row.amount));
              const badge    = isHSP ? "HSP" : "HSK";
              const badgeCls = isHSP
                ? "bg-pesa-accent/20 text-pesa-accent"
                : "bg-pesa-success/20 text-pesa-success";

              return (
                <div
                  key={row.transactionHash}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-pesa-border px-3 py-2 text-sm"
                >
                  <span className="rounded bg-pesa-border px-2 py-0.5 text-pesa-muted">
                    #{row.txId}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeCls}`}>
                    {badge}
                  </span>
                  <span>{formatAddress(row.sender)}</span>
                  <span className="text-pesa-muted">→</span>
                  <span>{formatAddress(row.recipient)}</span>
                  <span className="text-pesa-accent">{amtLabel}</span>
                  <span className="text-pesa-muted">{timeAgo(row.timestamp)}</span>
                  <a
                    href={getExplorerTxLink(row.transactionHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-pesa-accent hover:underline"
                  >
                    ↗ explorer
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
