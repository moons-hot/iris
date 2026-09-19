/**
 * WebSerial transport for the Iris Key.
 *
 * The browser is a pipe: it forwards server-issued nonces to the board and
 * returns the board's signature. It never holds a device secret and never
 * decides whether a response is valid.
 */

export interface KeyHello {
  deviceId: string;
  fw: string;
  provisioned: boolean;
}

export type KeyState =
  | "idle"
  | "authenticated"
  | "limited"
  | "denied"
  | "emergency"
  | "confirm";

interface DeviceLine {
  type?: string;
  kind?: string;
  deviceId?: string;
  nonce?: string;
  hmac?: string;
  pressed?: boolean;
  error?: string;
  message?: string;
  fw?: string;
  provisioned?: boolean;
  state?: string;
}

export function webSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class IrisKey {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = "";
  private pending: Array<(line: DeviceLine) => boolean> = [];
  private onDisconnect?: () => void;

  async connect(onDisconnect?: () => void): Promise<KeyHello> {
    if (!webSerialSupported()) {
      throw new Error("This browser does not support WebSerial. Use Chrome or Edge.");
    }
    this.onDisconnect = onDisconnect;

    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this.port = port;

    const writable = port.writable;
    const readable = port.readable;
    if (!writable || !readable) throw new Error("Serial port is not readable/writable.");

    this.writer = writable.getWriter();
    this.reader = readable.getReader();
    void this.readLoop();

    const hello = await this.request({ cmd: "HELLO" }, (line) => line.type === "hello");
    if (!hello.deviceId) throw new Error("Iris Key did not identify itself.");
    return {
      deviceId: hello.deviceId,
      fw: hello.fw ?? "unknown",
      provisioned: hello.provisioned ?? false,
    };
  }

  async disconnect(): Promise<void> {
    try {
      await this.reader?.cancel();
    } catch {
      // already closed
    }
    try {
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      // already closed
    }
    this.port = null;
    this.writer = null;
    this.reader = null;
  }

  get connected(): boolean {
    return this.port !== null;
  }

  /** Asks the board to sign a server-issued nonce. */
  async sign(nonce: string, kind: "challenge" | "presence"): Promise<string> {
    const line = await this.request(
      { cmd: kind === "challenge" ? "CHALLENGE" : "PRESENCE", nonce },
      (candidate) =>
        candidate.type === "response" &&
        candidate.kind === kind &&
        candidate.nonce === nonce,
      kind === "presence" ? 2500 : 8000,
    );
    if (!line.hmac) throw new Error("Iris Key returned no signature.");
    return line.hmac;
  }

  /** Blocks until the clinician presses the button on the board. */
  async confirm(nonce: string, timeoutMs = 22_000): Promise<string> {
    const line = await this.request(
      { cmd: "CONFIRM", nonce },
      (candidate) => candidate.type === "confirm",
      timeoutMs,
    );
    if (!line.pressed || !line.hmac) {
      throw new Error(
        line.error === "timeout"
          ? "No confirmation press on the Iris Key."
          : "Confirmation failed.",
      );
    }
    return line.hmac;
  }

  async setState(state: KeyState): Promise<void> {
    if (!this.writer) return;
    try {
      await this.write({ cmd: "STATE", state });
    } catch {
      // Cosmetic only: never fail a clinical action because an LED did not update.
    }
  }

  private async request(
    payload: Record<string, unknown>,
    match: (line: DeviceLine) => boolean,
    timeoutMs = 8000,
  ): Promise<DeviceLine> {
    const result = new Promise<DeviceLine>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = this.pending.filter((entry) => entry !== handler);
        reject(new Error("Iris Key did not respond in time."));
      }, timeoutMs);

      const handler = (line: DeviceLine): boolean => {
        if (line.type === "error") {
          clearTimeout(timer);
          reject(new Error(line.message ?? "Iris Key reported an error."));
          return true;
        }
        if (!match(line)) return false;
        clearTimeout(timer);
        resolve(line);
        return true;
      };

      this.pending.push(handler);
    });

    await this.write(payload);
    return result;
  }

  private async write(payload: Record<string, unknown>): Promise<void> {
    if (!this.writer) throw new Error("Iris Key is not connected.");
    const encoded = new TextEncoder().encode(`${JSON.stringify(payload)}\n`);
    await this.writer.write(encoded);
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;
        this.buffer += decoder.decode(value, { stream: true });

        let newline = this.buffer.indexOf("\n");
        while (newline >= 0) {
          const raw = this.buffer.slice(0, newline).trim();
          this.buffer = this.buffer.slice(newline + 1);
          if (raw.startsWith("{")) this.dispatch(raw);
          newline = this.buffer.indexOf("\n");
        }
      }
    } catch {
      // Unplugged mid-read: treated as loss of presence.
    } finally {
      this.port = null;
      this.onDisconnect?.();
    }
  }

  private dispatch(raw: string): void {
    let line: DeviceLine;
    try {
      line = JSON.parse(raw) as DeviceLine;
    } catch {
      return;
    }
    this.pending = this.pending.filter((handler) => !handler(line));
  }
}
