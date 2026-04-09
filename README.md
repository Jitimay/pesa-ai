# Pesa AI

**Tagline:** Send money with a text. Settled on-chain.

**Track:** PayFi — HashKey Chain On-Chain Horizon Hackathon 2026

Pesa AI is a full-stack Web3 dApp that simulates SMS-based payments for the unbanked.
Users type natural-language commands in English, French, Kirundi, or Swahili.
Groq AI parses the intent, and payments are settled using **HSP (HashKey Settlement Protocol)**
on HashKey Chain testnet.

## Live Demo

- Vercel: `https://your-vercel-demo-link.vercel.app`

## Tech Stack

- Next.js 14 · TypeScript 5 · Tailwind 3.4
- Solidity 0.8.20 · Hardhat 2.22 · ethers v6
- Groq llama3-8b-8192

## HashKey Chain Testnet

| Field       | Value                              |
|-------------|------------------------------------|
| RPC URL     | `https://testnet.hsk.xyz`          |
| Chain ID    | `133` (`0x85`)                     |
| Explorer    | `https://testnet-explorer.hsk.xyz` |
| Gas Token   | HSK                                |
| PayFi Token | HSP (HashKey Settlement Protocol)  |

## Quick Start

```bash
git clone <your-repo-url> && cd pesa-ai
npm install
cp .env.local.example .env.local
# Fill in GROQ_API_KEY and PRIVATE_KEY
npx hardhat run scripts/deploy.js --network hashkeyTestnet
# Copy printed addresses into .env.local
npm run dev
```

## Contracts

| Contract | Description                                      |
|----------|--------------------------------------------------|
| PesaAI   | Main payment logger — accepts HSP + HSK          |
| PesaHSP  | Testnet HSP stand-in with public faucet (1000 HSP/day) |

After deploying, update `.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=<PesaAI address>
NEXT_PUBLIC_HSP_TOKEN_ADDRESS=<PesaHSP address>
```

> When the official HSP token address is available, call `setHspToken(address)` on PesaAI
> (owner only) to point to the real token without redeploying.

## Payment Flow

```
User SMS → Groq AI → ParsedIntent
  ├── SEND (HSP)  → approve HSP → logPaymentHSP → HSP transferred to recipient
  ├── SEND (HSK)  → logPaymentHSK → HSK forwarded to recipient
  ├── CHECK       → reads HSK + HSP balances on-chain
  └── HISTORY     → fetches user's payment records from contract
```

## Project Structure

```
pesa-ai/
├── contracts/
│   ├── PesaAI.sol       # Main contract (HSP + HSK payments)
│   └── PesaHSP.sol      # Testnet HSP token with faucet
├── scripts/deploy.js
├── hardhat.config.js
├── app/
│   ├── api/parse-intent/route.ts
│   ├── page.tsx
│   └── layout.tsx
├── components/
│   ├── SMSTerminal.tsx  # Main interaction widget
│   ├── WalletConnect.tsx
│   ├── TransactionFeed.tsx
│   ├── StatsBar.tsx
│   ├── NetworkGuard.tsx
│   └── HowItWorks.tsx
├── lib/
│   ├── hashkey.ts       # Chain config, ABIs, helpers
│   └── contract.ts      # TypeScript types
└── .env.local.example
```

## Team

- **Josue** (Spatium Lapis / Burundi)

## License

MIT
# pesa-ai
