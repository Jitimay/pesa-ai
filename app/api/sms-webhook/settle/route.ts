import { NextResponse } from "next/server";
import { updateEventStatus } from "../route";

/**
 * POST /api/sms-webhook/settle
 * Called by the UI after the wallet successfully submits the on-chain tx.
 * Body: { id: string, txHash: string, status: "settled" | "failed" | "cancelled" }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      txHash?: string;
      status?: "settled" | "failed" | "cancelled";
    };

    if (!body.id || !body.status) {
      return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }

    updateEventStatus(body.id, body.status, body.txHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
