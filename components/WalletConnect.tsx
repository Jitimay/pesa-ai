"use client";

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CHAIN_ID, CHAIN_ID_HEX, formatAddress, getHspContract } from "@/lib/hashkey";
import type { WalletState } from "@/lib/contract";
import { t, type Locale } from "@/lib/i18n";
import { track } from "@/lib/analytics";

type Props = {
  wallet: WalletState;
  onWalletChange: (next: WalletState) => void;
  locale: Locale;
};

const defaultState: WalletState = {
  isConnected: false,
  address: null,
  isCorrectNetwork: false,
  balanceHSK: null,
  balanceHSP: null,
};

async function fetchBalances(
  provider: ethers.BrowserProvider,
  address: string,
  chainId: number,
): Promise<WalletState> {
  // Fetch HSK and HSP in parallel — faster, independent failures
  const [hskRaw, hspBalance] = await Promise.all([
    provider.getBalance(address),
    (async (): Promise<string> => {
      try {
        const hsp = getHspContract(provider);
        const raw = (await hsp.balanceOf(address)) as bigint;
        // Use formatUnits for precision safety on large values
        const formatted = ethers.formatUnits(raw, 18);
        const num = parseFloat(formatted);
        return `${num.toFixed(num < 1 ? 4 : 2)} HSP`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // Distinguish "not deployed yet" from "real zero"
        if (msg.includes("Missing NEXT_PUBLIC_HSP_TOKEN_ADDRESS")) return "— HSP";
        return "0.00 HSP";
      }
    })(),
  ]);

  const hskFormatted = ethers.formatUnits(hskRaw, 18);
  const hskNum = parseFloat(hskFormatted);

  return {
    isConnected: true,
    address,
    isCorrectNetwork: chainId === CHAIN_ID,
    balanceHSK: `${hskNum.toFixed(hskNum < 1 ? 4 : 3)} HSK`,
    balanceHSP: hspBalance,
  };
}

export default function WalletConnect({ wallet, onWalletChange, locale }: Props) {
  const [hasMetaMask, setHasMetaMask] = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [isBusy, setIsBusy]           = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]             = useState("");

  // ── Refresh wallet state ────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    setIsRefreshing(true);
    try {
      const provider  = new ethers.BrowserProvider(window.ethereum);
      const accounts  = (await provider.send("eth_accounts", [])) as string[];
      if (!accounts.length) {
        onWalletChange(defaultState);
        return;
      }
      const network = await provider.getNetwork();
      const state   = await fetchBalances(provider, accounts[0], Number(network.chainId));
      onWalletChange(state);
    } catch {
      onWalletChange(defaultState);
    } finally {
      setIsRefreshing(false);
    }
  }, [onWalletChange]);

  // ── Mount: detect MetaMask + subscribe to events ────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const detected = Boolean(window.ethereum);
    setHasMetaMask(detected);
    if (!detected) return;

    void refresh();

    // Store stable references so removeListener works correctly
    const onAccountsChanged = () => void refresh();
    const onChainChanged    = () => void refresh();

    window.ethereum!.on?.("accountsChanged", onAccountsChanged);
    window.ethereum!.on?.("chainChanged",    onChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged",    onChainChanged);
    };
  }, [refresh]);

  // ── Close menu on outside click ─────────────────────────────────────────────
  useEffect(() => {
    if (!showMenu) return;
    const close = () => setShowMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showMenu]);

  // ── Connect ─────────────────────────────────────────────────────────────────
  const connectWallet = async () => {
    if (!window.ethereum) return;
    setIsBusy(true);
    setError("");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      const network  = await provider.getNetwork();
      const state    = await fetchBalances(provider, accounts[0], Number(network.chainId));
      onWalletChange(state);
      track({ type: "wallet_connect", ts: Date.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      // -32002 = MetaMask already has a pending request open
      if (msg.includes("-32002") || msg.includes("already pending")) {
        setError("MetaMask has a pending request. Open MetaMask and approve or reject it first.");
      } else if (!msg.toLowerCase().includes("user rejected")) {
        setError(msg.slice(0, 80));
      }
    } finally {
      setIsBusy(false);
    }
  };

  // ── Switch network ──────────────────────────────────────────────────────────
  const switchNetwork = async () => {
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
      // Refresh after switch so state updates immediately
      await refresh();
    } catch { /* user rejected */ }
  };

  // ── Disconnect ──────────────────────────────────────────────────────────────
  const disconnect = () => {
    onWalletChange(defaultState);
    setShowMenu(false);
  };

  // ── No MetaMask ─────────────────────────────────────────────────────────────
  if (!hasMetaMask) {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-pesa-accent/60 bg-pesa-card px-4 py-2 text-sm font-medium text-pesa-accent"
      >
        {t(locale, "installMeta")}
      </a>
    );
  }

  // ── Not connected ───────────────────────────────────────────────────────────
  if (!wallet.isConnected) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={connectWallet}
          disabled={isBusy}
          className="rounded-lg border border-pesa-accent bg-pesa-card px-4 py-2 text-sm font-semibold text-pesa-accent shadow-glow transition hover:bg-pesa-accent/10 active:scale-95 disabled:opacity-60"
        >
          {isBusy ? t(locale, "connecting") : t(locale, "connectWallet")}
        </button>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }

  // ── Connected ───────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Main pill — tap to open menu */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
        className="rounded-lg border border-pesa-border bg-pesa-card px-4 py-2 text-sm text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${isRefreshing ? "bg-pesa-accent animate-pulse" : "bg-pesa-success animate-pulseSoft"}`} />
          <span className="font-medium">{formatAddress(wallet.address!)}</span>
        </div>
        <div className="mt-0.5 flex gap-3 text-xs text-pesa-muted">
          <span>{isRefreshing ? "updating..." : (wallet.balanceHSK ?? "...")}</span>
          {!isRefreshing && wallet.balanceHSP !== "— HSP" && (
            <span className="text-pesa-accent">{wallet.balanceHSP ?? "..."}</span>
          )}
        </div>
      </button>

      {/* Dropdown menu — works on both mouse and touch */}
      {showMenu && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-pesa-border bg-pesa-card shadow-xl"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {!wallet.isCorrectNetwork && (
            <button
              onClick={switchNetwork}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-pesa-accent hover:bg-pesa-accent/10 rounded-t-xl"
            >
              ⚠ Switch to HashKey Testnet
            </button>
          )}
          <button
            onClick={() => { void refresh(); setShowMenu(false); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-pesa-muted hover:text-pesa-text hover:bg-pesa-border/40"
          >
            ↺ Refresh balance
          </button>
          <button
            onClick={disconnect}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 rounded-b-xl border-t border-pesa-border"
          >
            ✕ {t(locale, "disconnect")}
          </button>
        </div>
      )}
    </div>
  );
}
