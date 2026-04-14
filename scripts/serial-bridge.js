#!/usr/bin/env node
/**
 * Pesa AI — USB Serial Bridge
 *
 * Reads SMS events from ESP32 over USB serial,
 * forwards to local Pesa AI webhook,
 * sends reply back to ESP32 to deliver as SMS.
 *
 * Usage:
 *   npm install serialport
 *   node scripts/serial-bridge.js
 *
 * Make sure npm run dev is running on localhost:3000
 */

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const http = require("http");

// ── Config ────────────────────────────────────────────────────────────────────
const SERIAL_PORT  = process.env.SERIAL_PORT  || "/dev/ttyUSB0"; // Linux default
const BAUD_RATE    = parseInt(process.env.BAUD_RATE || "115200");
const PESA_AI_HOST = process.env.PESA_AI_HOST || "localhost";
const PESA_AI_PORT = parseInt(process.env.PESA_AI_PORT || "3000");
const WEBHOOK_SECRET = process.env.SMS_WEBHOOK_SECRET || "pesa-ai-secret-2026";

console.log("===========================================");
console.log("  Pesa AI — USB Serial Bridge");
console.log("===========================================");
console.log(`Serial : ${SERIAL_PORT} @ ${BAUD_RATE}`);
console.log(`Webhook: http://${PESA_AI_HOST}:${PESA_AI_PORT}/api/sms-webhook`);
console.log("");

// ── Open serial port ──────────────────────────────────────────────────────────
const port = new SerialPort({
  path: SERIAL_PORT,
  baudRate: BAUD_RATE,
});

const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

port.on("open", () => {
  console.log(`✅ Serial port open: ${SERIAL_PORT}`);
});

port.on("error", (err) => {
  console.error("❌ Serial error:", err.message);
  console.error("   Check SERIAL_PORT env var. Available ports:");
  SerialPort.list().then((ports) => {
    ports.forEach((p) => console.error("  ", p.path, p.manufacturer || ""));
  });
  process.exit(1);
});

// ── Send reply back to ESP32 ──────────────────────────────────────────────────
function sendReplyToEsp32(sender, message) {
  // Format: SMS_REPLY:<number>:<message>
  const line = `SMS_REPLY:${sender}:${message.replace(/\n/g, "\\n")}\n`;
  port.write(line, (err) => {
    if (err) console.error("❌ Serial write error:", err.message);
    else console.log(`📤 Reply sent to ESP32 for ${sender}`);
  });
}

// ── Call Pesa AI webhook ──────────────────────────────────────────────────────
function callPesaAI(sender, message) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ sender, message });

    const options = {
      hostname: PESA_AI_HOST,
      port:     PESA_AI_PORT,
      path:     "/api/sms-webhook",
      method:   "POST",
      headers: {
        "Content-Type":     "application/json",
        "Content-Length":   Buffer.byteLength(body),
        "x-webhook-secret": WEBHOOK_SECRET,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          console.log(`📬 Pesa AI response (${res.statusCode}):`, JSON.stringify(json).slice(0, 200));
          resolve(json.reply || "Pesa AI processed your request.");
        } catch {
          console.error("❌ JSON parse error:", data.slice(0, 100));
          resolve("Pesa AI error. Try again.");
        }
      });
    });

    req.on("error", (err) => {
      console.error("❌ HTTP error:", err.message);
      console.error("   Is npm run dev running on port 3000?");
      resolve("Connection error. Is the app running?");
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve("Timeout. Try again.");
    });

    req.write(body);
    req.end();
  });
}

// ── Parse incoming serial lines ───────────────────────────────────────────────
parser.on("data", async (line) => {
  line = line.trim();
  if (!line) return;

  // Log all lines for debugging
  if (!line.startsWith("SMS_EVENT:")) {
    console.log("[ESP32]", line);
    return;
  }

  // SMS_EVENT:{"sender":"+25761234567","message":"SEND 10 HSP TO 0x..."}
  try {
    const jsonStr = line.substring("SMS_EVENT:".length);
    const { sender, message } = JSON.parse(jsonStr);

    console.log("\n──────────────────────────────────────");
    console.log(`📥 SMS from: ${sender}`);
    console.log(`📥 Message : ${message}`);
    console.log("──────────────────────────────────────");

    const reply = await callPesaAI(sender, message);
    console.log(`💬 Reply   : ${reply}`);

    sendReplyToEsp32(sender, reply);
  } catch (err) {
    console.error("❌ Parse error:", err.message, "| Line:", line.slice(0, 100));
  }
});

console.log("🎧 Listening for SMS events from ESP32...");
console.log("   Press Ctrl+C to stop\n");
