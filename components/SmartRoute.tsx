"use client";

import type { RouteOption } from "@/lib/contract";

type Props = {
  route: RouteOption;
  amount: number | null;
  currency: string | null;
};

const ROUTE_ICONS: Record<RouteOption["id"], string> = {
  hsp_direct:      "🟡",
  hsk_direct:      "💎",
  stablecoin_swap: "🔄",
};

export default function SmartRoute({ route, amount, currency }: Props) {
  const icon = ROUTE_ICONS[route.id];
  const timeLabel = route.estimatedTimeSeconds < 10
    ? `~${route.estimatedTimeSeconds}s`
    : `~${Math.round(route.estimatedTimeSeconds / 60)}min`;

  return (
    <div className="mt-2 rounded-xl border border-pesa-accent/30 bg-pesa-accent/5 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-pesa-accent">
        <span>⚡ Smart Route</span>
        {route.recommended && (
          <span className="rounded-full bg-pesa-accent/20 px-2 py-0.5 text-pesa-accent">
            Recommended
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-pesa-text">{route.label}</p>
          <p className="text-xs text-pesa-muted">{route.reason}</p>
        </div>
        <div className="text-right text-xs">
          <p className="text-pesa-success">~${route.estimatedFeeUSD.toFixed(4)} fee</p>
          <p className="text-pesa-muted">{timeLabel}</p>
        </div>
      </div>

      {amount && currency && (
        <div className="mt-2 border-t border-pesa-border/50 pt-2 text-xs text-pesa-muted">
          Sending {amount} {currency} via {route.label}
        </div>
      )}
    </div>
  );
}
