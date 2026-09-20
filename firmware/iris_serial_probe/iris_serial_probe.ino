/**
 * Serial probe for Lafvin ESP32-S3 + CP210x (UART port).
 *
 * Your only COM is usually: Silicon Labs CP210x (COMx) on the UART Type-C.
 * That maps to Serial0, NOT Serial (USB CDC).
 *
 * Tools:
 *   Port: COM8 (CP210x)
 *   Monitor baud: 115200
 *   USB CDC On Boot: Disabled  (optional but simpler with CP210x-only)
 */

void setup() {
  Serial0.begin(115200);  // CP210x / UART port
  Serial.begin(115200);   // native USB CDC if enabled
  pinMode(LED_BUILTIN, OUTPUT);
  delay(1500);

  Serial0.println("=== probe on Serial0 / CP210x (use this COM) ===");
  Serial.println("=== probe on Serial / USB CDC ===");
  Serial0.flush();
  Serial.flush();
}

void loop() {
  static uint32_t n = 0;
  digitalWrite(LED_BUILTIN, n & 1);
  Serial0.printf("[CP210x/UART0] heartbeat %lu\n", n);
  Serial.printf("[USB-CDC] heartbeat %lu\n", n);
  Serial0.flush();
  Serial.flush();
  n++;
  delay(1000);
}
