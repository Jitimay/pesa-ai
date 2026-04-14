// ============================================
// Pesa AI — ESP32 LilyGO TTGO T-Call
// Hardware: SIM800H GSM modem (onboard)
// Mode: USB Serial bridge to PC
// Flow: SMS → ESP32 → USB → Node bridge → Pesa AI
// ============================================

#include <HardwareSerial.h>

// ── Pin definitions (TTGO T-Call v1.3 / v1.4) ────────────────────────────────
#define MODEM_RST      5
#define MODEM_PWKEY    4
#define MODEM_POWER_ON 23
#define MODEM_TX       27
#define MODEM_RX       26

HardwareSerial SerialAT(1);

#define SMS_MAX_LEN 160

// ─────────────────────────────────────────────
// SMS QUEUE — handles bursts during processing
// ─────────────────────────────────────────────
#define QUEUE_SIZE 5
struct SMSItem { String sender; String body; };
SMSItem smsQueue[QUEUE_SIZE];
int qHead = 0, qTail = 0;

bool enqueueMsg(String sender, String body) {
  int next = (qTail + 1) % QUEUE_SIZE;
  if (next == qHead) return false; // full
  smsQueue[qTail] = {sender, body};
  qTail = next;
  return true;
}

bool dequeueMsg(SMSItem &item) {
  if (qHead == qTail) return false; // empty
  item = smsQueue[qHead];
  qHead = (qHead + 1) % QUEUE_SIZE;
  return true;
}

// ─────────────────────────────────────────────
// AT HELPERS
// ─────────────────────────────────────────────
void sendAT(String cmd, int waitMs = 1000) {
  while (SerialAT.available()) SerialAT.read(); // flush
  SerialAT.println(cmd);
  delay(waitMs);
}

String readAT(int timeoutMs = 2000) {
  String resp = "";
  unsigned long t = millis();
  while (millis() - t < timeoutMs) {
    while (SerialAT.available()) resp += (char)SerialAT.read();
  }
  resp.trim();
  return resp;
}

// ─────────────────────────────────────────────
// SEND SMS (auto multi-part for long replies)
// ─────────────────────────────────────────────
void sendSMS(String number, String message) {
  int total = message.length();
  int parts = (total + SMS_MAX_LEN - 1) / SMS_MAX_LEN;
  for (int i = 0; i < parts; i++) {
    String part = message.substring(
      i * SMS_MAX_LEN,
      min((i + 1) * SMS_MAX_LEN, total)
    );
    if (parts > 1) part = "(" + String(i+1) + "/" + String(parts) + ") " + part;
    SerialAT.println("AT+CMGS=\"" + number + "\"");
    delay(500);
    SerialAT.print(part);
    delay(200);
    SerialAT.write(26); // Ctrl+Z
    delay(3500);
    Serial.println("[SMS_SENT] to=" + number + " part=" + String(i+1) + "/" + String(parts));
  }
}

// ─────────────────────────────────────────────
// JSON ESCAPE
// ─────────────────────────────────────────────
String jsonEscape(String s) {
  s.replace("\\", "\\\\");
  s.replace("\"", "\\\"");
  s.replace("\n", " ");
  s.replace("\r", "");
  s.replace("\t", " ");
  return s;
}

// ─────────────────────────────────────────────
// FORWARD TO PC BRIDGE via USB Serial
// Bridge reads lines starting with SMS_EVENT:
// ─────────────────────────────────────────────
void forwardToBridge(String sender, String message) {
  Serial.println(
    "SMS_EVENT:{\"sender\":\"" + jsonEscape(sender) +
    "\",\"message\":\"" + jsonEscape(message) + "\"}"
  );
}

// ─────────────────────────────────────────────
// READ REPLY FROM BRIDGE
// Bridge sends: SMS_REPLY:<number>:<message>
// ─────────────────────────────────────────────
void checkBridgeReply() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (!line.startsWith("SMS_REPLY:")) return;

  String payload = line.substring(10); // after "SMS_REPLY:"
  int sep = payload.indexOf(':');
  if (sep < 0) return;

  String number  = payload.substring(0, sep);
  String message = payload.substring(sep + 1);
  message.replace("\\n", "\n");

  Serial.println("[BRIDGE] Sending reply to " + number);
  sendSMS(number, message);
}

// ─────────────────────────────────────────────
// PROCESS INCOMING SMS
// ─────────────────────────────────────────────
void processCommand(String sender, String msg) {
  msg.trim();
  Serial.println("[SMS_IN] from=" + sender + " msg=" + msg);

  String lower = msg;
  lower.toLowerCase();

  // Local shortcuts — no bridge needed
  if (lower == "help" || lower == "?" || lower == "aide" || lower == "ubufasha") {
    sendSMS(sender,
      "Pesa AI: Ohereza amabwiriza mu Kirundi, Igifaransa, Icongereza canke Kiswahili.\n"
      "Urugero: OHEREZA 10 HSP KU 0x...\n"
      "Andika STOP guhagarika."
    );
    return;
  }

  if (lower == "stop") {
    sendSMS(sender, "Unsubscribed from Pesa AI. Send any message to reactivate.");
    return;
  }

  // Acknowledge immediately
  sendSMS(sender, "Pesa AI irakiriye ubutumwa bwawe. Tegereza...");

  // Forward to PC bridge — bridge calls Pesa AI and sends back SMS_REPLY
  forwardToBridge(sender, msg);
}

// ─────────────────────────────────────────────
// MODEM INIT
// ─────────────────────────────────────────────
void initModem() {
  pinMode(MODEM_PWKEY,    OUTPUT);
  pinMode(MODEM_RST,      OUTPUT);
  pinMode(MODEM_POWER_ON, OUTPUT);
  digitalWrite(MODEM_PWKEY,    LOW);
  digitalWrite(MODEM_RST,      HIGH);
  digitalWrite(MODEM_POWER_ON, HIGH);

  Serial.println("[MODEM] Powering up...");
  delay(3000);
  SerialAT.begin(115200, SERIAL_8N1, MODEM_RX, MODEM_TX);
  delay(3000);

  sendAT("AT");              Serial.println("[AT]  " + readAT());
  sendAT("AT+CPIN?");        Serial.println("[SIM] " + readAT());
  sendAT("AT+CFUN=1", 2000);
  sendAT("AT+CNMP=13");      // GSM only
  sendAT("AT+CSCS=\"GSM\""); // Fix encoding for special chars
  sendAT("AT+COPS?");        Serial.println("[OPR] " + readAT());

  Serial.print("[MODEM] Waiting for GSM network");
  for (int i = 0; i < 40; i++) {
    sendAT("AT+CREG?", 500);
    String resp = readAT(800);
    Serial.print(".");
    if (resp.indexOf(",1") >= 0 || resp.indexOf(",5") >= 0) {
      Serial.println(" OK");
      break;
    }
    delay(1500);
  }

  sendAT("AT+CSQ");                      Serial.println("[SIG] " + readAT());
  sendAT("AT+CMGF=1");                   // Text mode
  sendAT("AT+CNMI=1,2,0,0,0");          // Push new SMS to serial
  sendAT("AT+CMGDA=\"DEL ALL\"", 3000);  // Clear old messages

  Serial.println("[MODEM] READY");
}

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n==========================================");
  Serial.println("  Pesa AI — ESP32 SMS Bridge (USB mode)");
  Serial.println("  HashKey Chain PayFi");
  Serial.println("==========================================\n");
  initModem();
  Serial.println("[PESA_AI] Ready. Waiting for SMS...\n");
}

// ─────────────────────────────────────────────
// LOOP — non-blocking SMS reader with queue
// ─────────────────────────────────────────────
void loop() {
  // Check if bridge sent a reply to forward as SMS
  checkBridgeReply();

  // Read incoming AT lines from modem
  while (SerialAT.available()) {
    String line = SerialAT.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;

    // Log non-CMT lines for debugging
    if (!line.startsWith("+CMT:")) {
      Serial.println("[AT] " + line);
      continue;
    }

    // Extract sender: +CMT: "+25078xxx","","date"
    int q1 = line.indexOf('"') + 1;
    int q2 = line.indexOf('"', q1);
    String sender = line.substring(q1, q2);

    // Read message body (next line, wait up to 3s)
    String body = "";
    unsigned long t = millis();
    while (millis() - t < 3000) {
      if (SerialAT.available()) {
        body = SerialAT.readStringUntil('\n');
        body.trim();
        break;
      }
      delay(10);
    }

    if (body.length() > 0) {
      if (!enqueueMsg(sender, body)) {
        Serial.println("[WARN] Queue full — dropping from " + sender);
        sendSMS(sender, "Busy. Please try again in a moment.");
      }
    }
  }

  // Process one queued SMS per loop iteration
  SMSItem item;
  if (dequeueMsg(item)) {
    processCommand(item.sender, item.body);
  }
}
