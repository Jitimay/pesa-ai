import { ethers } from "ethers";

// ── Chain config ─────────────────────────────────────────────────────────────

export const CHAIN_ID     = 133;
export const CHAIN_ID_HEX = "0x85";
export const RPC_URL      = "https://testnet.hsk.xyz";
export const EXPLORER_URL = "https://testnet-explorer.hsk.xyz";

export const CONTRACT_ADDRESS   = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS   || "";
export const HSP_TOKEN_ADDRESS  = process.env.NEXT_PUBLIC_HSP_TOKEN_ADDRESS  || "";

// ── PesaAI ABI ───────────────────────────────────────────────────────────────

export const PESA_AI_ABI = [
  // constructor
  { type: "constructor", inputs: [{ name: "_hspToken", type: "address" }], stateMutability: "nonpayable" },

  // events
  {
    type: "event", name: "PaymentLogged", anonymous: false,
    inputs: [
      { indexed: true,  name: "txId",      type: "uint256" },
      { indexed: true,  name: "sender",    type: "address" },
      { indexed: true,  name: "recipient", type: "address" },
      { indexed: false, name: "amount",    type: "uint256" },
      { indexed: false, name: "currency",  type: "string"  },
      { indexed: false, name: "smsIntent", type: "string"  },
      { indexed: false, name: "timestamp", type: "uint256" },
      { indexed: false, name: "token",     type: "uint8"   },
    ],
  },

  // logPaymentHSK
  {
    type: "function", name: "logPaymentHSK", stateMutability: "payable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount",    type: "uint256" },
      { name: "currency",  type: "string"  },
      { name: "smsIntent", type: "string"  },
    ],
    outputs: [],
  },

  // logPaymentHSP
  {
    type: "function", name: "logPaymentHSP", stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount",    type: "uint256" },
      { name: "currency",  type: "string"  },
      { name: "smsIntent", type: "string"  },
    ],
    outputs: [],
  },

  // getPayment
  {
    type: "function", name: "getPayment", stateMutability: "view",
    inputs:  [{ name: "txId", type: "uint256" }],
    outputs: [{
      components: [
        { name: "sender",    type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount",    type: "uint256" },
        { name: "currency",  type: "string"  },
        { name: "smsIntent", type: "string"  },
        { name: "parsedBy",  type: "string"  },
        { name: "timestamp", type: "uint256" },
        { name: "txId",      type: "uint256" },
        { name: "token",     type: "uint8"   },
      ],
      name: "", type: "tuple",
    }],
  },

  // getUserPayments
  {
    type: "function", name: "getUserPayments", stateMutability: "view",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },

  // getUserPaymentRecords
  {
    type: "function", name: "getUserPaymentRecords", stateMutability: "view",
    inputs:  [{ name: "user", type: "address" }],
    outputs: [{
      components: [
        { name: "sender",    type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount",    type: "uint256" },
        { name: "currency",  type: "string"  },
        { name: "smsIntent", type: "string"  },
        { name: "parsedBy",  type: "string"  },
        { name: "timestamp", type: "uint256" },
        { name: "txId",      type: "uint256" },
        { name: "token",     type: "uint8"   },
      ],
      name: "", type: "tuple[]",
    }],
  },

  // getRecentPayments
  {
    type: "function", name: "getRecentPayments", stateMutability: "view",
    inputs:  [{ name: "count", type: "uint256" }],
    outputs: [{
      components: [
        { name: "sender",    type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount",    type: "uint256" },
        { name: "currency",  type: "string"  },
        { name: "smsIntent", type: "string"  },
        { name: "parsedBy",  type: "string"  },
        { name: "timestamp", type: "uint256" },
        { name: "txId",      type: "uint256" },
        { name: "token",     type: "uint8"   },
      ],
      name: "", type: "tuple[]",
    }],
  },

  // getStats
  {
    type: "function", name: "getStats", stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "totalTx",           type: "uint256" },
      { name: "contractBalanceHSK",type: "uint256" },
      { name: "totalVolumeHSK",    type: "uint256" },
      { name: "totalVolumeHSP",    type: "uint256" },
    ],
  },

  // setHspToken
  {
    type: "function", name: "setHspToken", stateMutability: "nonpayable",
    inputs:  [{ name: "_hspToken", type: "address" }],
    outputs: [],
  },

  // hspToken
  {
    type: "function", name: "hspToken", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },

  // owner
  {
    type: "function", name: "owner", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },

  // withdraw
  {
    type: "function", name: "withdraw", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
] as const;

// ── HSP ERC-20 ABI (minimal) ─────────────────────────────────────────────────

export const HSP_ABI = [
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "allowance", stateMutability: "view",
    inputs:  [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs:  [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "faucet", stateMutability: "nonpayable",
    inputs: [], outputs: [],
  },
  {
    type: "function", name: "decimals", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function", name: "symbol", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "string" }],
  },
] as const;

// ── Provider / signer / contract helpers ─────────────────────────────────────

export function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export async function getSigner() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("MetaMask is not installed");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

export function getContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  if (!CONTRACT_ADDRESS) throw new Error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS");
  return new ethers.Contract(CONTRACT_ADDRESS, PESA_AI_ABI, signerOrProvider);
}

export function getHspContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  if (!HSP_TOKEN_ADDRESS) throw new Error("Missing NEXT_PUBLIC_HSP_TOKEN_ADDRESS");
  return new ethers.Contract(HSP_TOKEN_ADDRESS, HSP_ABI, signerOrProvider);
}

// ── Format helpers ────────────────────────────────────────────────────────────

export function formatAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatHSK(wei: bigint) {
  const value = Number(ethers.formatEther(wei));
  return `${value.toFixed(value < 1 ? 4 : 3)} HSK`;
}

export function formatHSP(units: bigint) {
  const value = Number(ethers.formatEther(units)); // 18 decimals
  return `${value.toFixed(value < 1 ? 4 : 2)} HSP`;
}

export function isValidAddress(str: string) {
  return ethers.isAddress(str);
}

export function getExplorerTxLink(txHash: string) {
  return `${EXPLORER_URL}/tx/${txHash}`;
}

export function getExplorerAddressLink(addr: string) {
  return `${EXPLORER_URL}/address/${addr}`;
}

// ── Window.ethereum type augmentation ────────────────────────────────────────

declare global {
  interface EthereumProvider extends ethers.Eip1193Provider {
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  }
  interface Window {
    ethereum?: EthereumProvider;
  }
}
