/**
 * SMS event store — module-level singleton that survives Next.js hot reloads.
 * Uses globalThis to persist across module re-evaluations in dev mode.
 */

import type { SmsEvent } from "@/app/api/sms-webhook/route";

const MAX_EVENTS = 50;

// Attach to globalThis so hot-reload doesn't wipe it
const g = globalThis as typeof globalThis & {
  __pesaAiSmsEvents?: SmsEvent[];
};

if (!g.__pesaAiSmsEvents) {
  g.__pesaAiSmsEvents = [];
}

const store = g.__pesaAiSmsEvents;

export function pushEvent(ev: SmsEvent) {
  store.push(ev);
  if (store.length > MAX_EVENTS) store.shift();
}

export function getEvents(): SmsEvent[] {
  return [...store].reverse(); // newest first
}

export function updateEventStatus(
  id: string,
  status: SmsEvent["status"],
  txHash?: string,
) {
  const ev = store.find((e) => e.id === id);
  if (ev) {
    ev.status = status;
    if (txHash) ev.txHash = txHash;
  }
}
