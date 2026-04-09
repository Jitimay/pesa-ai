// ── Offline payment queue ─────────────────────────────────────────────────────
// Persists pending payments to localStorage so they survive page refreshes.

export type QueuedPayment = {
  id: string;
  smsText: string;
  recipient: string;
  amount: string;   // wei/token units as string (bigint serialized)
  currency: string;
  token: "HSP" | "HSK";
  queuedAt: number;
  attempts: number;
};

const KEY = "pesa_ai_queue";

export function getQueue(): QueuedPayment[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as QueuedPayment[];
  } catch {
    return [];
  }
}

export function enqueue(payment: Omit<QueuedPayment, "id" | "queuedAt" | "attempts">): QueuedPayment {
  const item: QueuedPayment = {
    ...payment,
    id:       crypto.randomUUID(),
    queuedAt: Date.now(),
    attempts: 0,
  };
  const queue = getQueue();
  queue.push(item);
  localStorage.setItem(KEY, JSON.stringify(queue));
  return item;
}

export function dequeue(id: string) {
  const queue = getQueue().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function incrementAttempts(id: string) {
  const queue = getQueue().map((p) =>
    p.id === id ? { ...p, attempts: p.attempts + 1 } : p,
  );
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function clearQueue() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
