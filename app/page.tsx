"use client";

import { useEffect, useState } from "react";
import AnalyticsDashboard  from "@/components/AnalyticsDashboard";
import FaucetButton        from "@/components/FaucetButton";
import HowItWorks          from "@/components/HowItWorks";
import ImpactDashboard     from "@/components/ImpactDashboard";
import LiveSmsTerminal     from "@/components/LiveSmsTerminal";
import LocaleSwitcher      from "@/components/LocaleSwitcher";
import NetworkGuard        from "@/components/NetworkGuard";
import SMSTerminal         from "@/components/SMSTerminal";
import StatsBar            from "@/components/StatsBar";
import TransactionFeed     from "@/components/TransactionFeed";
import WalletConnect       from "@/components/WalletConnect";
import type { WalletState } from "@/lib/contract";
import { CHAIN_ID_HEX }    from "@/lib/hashkey";
import { type Locale }     from "@/lib/i18n";
import { t }               from "@/lib/i18n";
import { track }           from "@/lib/analytics";

const initialWalletState: WalletState = {
  isConnected: false,
  address: null,
  isCorrectNetwork: false,
  balanceHSK: null,
  balanceHSP: null,
};

export default function HomePage() {
  const [wallet, setWallet] = useState<WalletState>(initialWalletState);
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    track({ type: "page_view", locale, ts: Date.now() });
  }, [locale]);

  const handleSwitchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CHAIN_ID_HEX,
          chainName: "HashKey Chain Testnet",
          rpcUrls: ["https://testnet.hsk.xyz"],
          nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
          blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
        }],
      });
    } catch { /* user rejected */ }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-pesa-border bg-black/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-lg">
            <span className="text-pesa-accent">●</span>
            <span>pesa·ai</span>
            <span className="hidden rounded-full border border-pesa-accent/40 px-2 py-0.5 text-xs text-pesa-accent sm:inline">
              PayFi
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <LocaleSwitcher locale={locale} onChange={setLocale} />
            <FaucetButton
              isConnected={wallet.isConnected}
              isCorrectNetwork={wallet.isCorrectNetwork}
              locale={locale}
            />
            <WalletConnect wallet={wallet} onWalletChange={setWallet} locale={locale} />
          </div>
        </div>
      </header>

      <NetworkGuard
        show={wallet.isConnected && !wallet.isCorrectNetwork}
        onSwitch={handleSwitchNetwork}
        locale={locale}
      />

      <StatsBar locale={locale} />

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-2 lg:py-14">
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
            {t(locale, "tagline")}
          </h1>
          <p className="mt-4 text-lg text-pesa-muted">
            {t(locale, "subtitle")}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-pesa-border bg-pesa-card px-3 py-1 text-sm">
              ⚡ {t(locale, "poweredBy")}
            </span>
            <span className="rounded-full border border-pesa-accent/40 bg-pesa-accent/10 px-3 py-1 text-sm text-pesa-accent">
              🟡 HSP PayFi
            </span>
            <span className="rounded-full border border-pesa-border bg-pesa-card px-3 py-1 text-sm">
              ⛓ {t(locale, "network")}
            </span>
          </div>
          <p className="mt-3 text-sm text-pesa-muted">{t(locale, "langSupport")}</p>
        </div>
        <SMSTerminal wallet={wallet} locale={locale} />
      </section>

      <ImpactDashboard locale={locale} />
      <HowItWorks locale={locale} />
      <LiveSmsTerminal wallet={wallet} />
      <TransactionFeed locale={locale} />
      <AnalyticsDashboard locale={locale} />

      {/* Footer */}
      <footer className="border-t border-pesa-border py-8 text-center text-sm text-pesa-muted">
        <p>Pesa AI — HashKey Chain On-Chain Horizon Hackathon 2026 · PayFi Track</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-pesa-accent">
          <a href="https://testnet-explorer.hsk.xyz" target="_blank" rel="noreferrer">
            Explorer
          </a>
          <a href="https://github.com" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://dorahacks.io/hackathon/2045" target="_blank" rel="noreferrer">
            DoraHacks
          </a>
        </div>
        <p className="mt-3 text-xs">
          Pesa (پيسه) — money in Swahili, Kirundi & Urdu
        </p>
      </footer>
    </main>
  );
}
