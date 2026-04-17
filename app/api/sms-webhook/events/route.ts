import { NextResponse } from "next/server";
import { getEvents } from "@/lib/sms-store";

/**
 * GET /api/sms-webhook/events
 * Polled by the UI every 3s to show live incoming SMS events.
 */
export async function GET() {
  return NextResponse.json({ events: getEvents() });
}
