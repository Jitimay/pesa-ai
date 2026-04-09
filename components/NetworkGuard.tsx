"use client";

import { t, type Locale } from "@/lib/i18n";

type NetworkGuardProps = {
  show: boolean;
  onSwitch: () => void;
  locale: Locale;
};

export default function NetworkGuard({ show, onSwitch, locale }: NetworkGuardProps) {
  if (!show) return null;

  return (
    <div className="sticky top-[72px] z-40 mx-auto w-full max-w-6xl px-4">
      <div className="mt-2 flex items-center justify-between rounded-xl border border-pesa-accent/60 bg-pesa-accent/10 px-4 py-3 text-sm text-pesa-accent">
        <p>⚠ {t(locale, "wrongNetwork")}</p>
        <button
          onClick={onSwitch}
          className="rounded-md border border-pesa-accent px-3 py-1 text-xs font-semibold hover:bg-pesa-accent/20"
        >
          {t(locale, "switchBtn")}
        </button>
      </div>
    </div>
  );
}
