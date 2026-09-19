"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { IrisKey, webSerialSupported, type KeyState } from "@/lib/iris-key";

const PRESENCE_INTERVAL_MS = 3000;

export interface Actor {
  id: string;
  name: string;
  role: string;
  department: string;
}

export interface SessionState {
  status: "locked" | "connecting" | "authenticated" | "terminated";
  actor: Actor | null;
  sessionId: string | null;
  deviceId: string | null;
  deviceLabel: string | null;
  simulated: boolean;
  message: string | null;
  breakGlassUntil: string | null;
}

const INITIAL: SessionState = {
  status: "locked",
  actor: null,
  sessionId: null,
  deviceId: null,
  deviceLabel: null,
  simulated: false,
  message: null,
  breakGlassUntil: null,
};

interface VerifyResponse {
  sessionId: string;
  presenceNonce: string;
  simulated: boolean;
  actor: Actor;
  device: { id: string; label: string };
  error?: string;
}

interface PresenceResponse {
  alive: boolean;
  nextNonce?: string;
  reason?: string;
  breakGlassUntil?: string | null;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

/**
 * Owns the whole hardware session lifecycle: challenge-response on plug-in, a
 * signed beat every few seconds, and immediate teardown when the key stops
 * answering.
 */
const subscribeNever = () => () => undefined;

export function useIrisSession() {
  const [state, setState] = useState<SessionState>(INITIAL);

  // WebSerial only exists in the browser, so the server snapshot is false and
  // the client corrects it after hydration instead of mismatching.
  const serialSupported = useSyncExternalStore(
    subscribeNever,
    webSerialSupported,
    () => false,
  );
  const keyRef = useRef<IrisKey | null>(null);
  const nonceRef = useRef<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const simulatedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHeartbeat = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const terminate = useCallback(
    (message: string) => {
      stopHeartbeat();
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      nonceRef.current = null;
      if (sessionId) {
        // Fire and forget: the server also expires the session on its own.
        void fetch("/api/session/end", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, reason: "DEVICE_REMOVED" }),
          keepalive: true,
        });
      }
      void keyRef.current?.setState("idle");
      setState({ ...INITIAL, status: "terminated", message });
    },
    [stopHeartbeat],
  );

  const beat = useCallback(async () => {
    const sessionId = sessionRef.current;
    const nonce = nonceRef.current;
    if (!sessionId || !nonce) return;

    try {
      const signature = simulatedRef.current
        ? undefined
        : await keyRef.current?.sign(nonce, "presence");

      const result = await postJson<PresenceResponse>("/api/session/presence", {
        sessionId,
        response: signature,
        simulate: simulatedRef.current,
      });

      if (!result.alive) {
        terminate(result.reason ?? "Session ended.");
        return;
      }
      nonceRef.current = result.nextNonce ?? null;
      setState((previous) =>
        previous.breakGlassUntil === (result.breakGlassUntil ?? null)
          ? previous
          : { ...previous, breakGlassUntil: result.breakGlassUntil ?? null },
      );
    } catch (error) {
      terminate(
        error instanceof Error
          ? `Hardware presence lost. ${error.message}`
          : "Hardware presence lost.",
      );
    }
  }, [terminate]);

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    timerRef.current = setInterval(() => void beat(), PRESENCE_INTERVAL_MS);
  }, [beat, stopHeartbeat]);

  const connect = useCallback(async () => {
    setState({ ...INITIAL, status: "connecting", message: "Waiting for Iris Key..." });
    try {
      const key = new IrisKey();
      keyRef.current = key;
      const hello = await key.connect(() => terminate("Iris Key unplugged."));

      const challenge = await postJson<{
        challengeId: string;
        nonce: string;
        deviceLabel: string;
      }>("/api/auth/challenge", { deviceId: hello.deviceId });

      const signature = await key.sign(challenge.nonce, "challenge");
      const verified = await postJson<VerifyResponse>("/api/auth/verify", {
        challengeId: challenge.challengeId,
        response: signature,
      });

      sessionRef.current = verified.sessionId;
      nonceRef.current = verified.presenceNonce;
      simulatedRef.current = false;
      await key.setState("authenticated");

      setState({
        status: "authenticated",
        actor: verified.actor,
        sessionId: verified.sessionId,
        deviceId: verified.device.id,
        deviceLabel: verified.device.label,
        simulated: false,
        message: null,
        breakGlassUntil: null,
      });
      startHeartbeat();
    } catch (error) {
      setState({
        ...INITIAL,
        status: "locked",
        message: error instanceof Error ? error.message : "Could not authenticate.",
      });
    }
  }, [startHeartbeat, terminate]);

  /** Fallback path when no board is plugged in. Every event is tagged simulated. */
  const connectSimulated = useCallback(
    async (deviceId: string) => {
      setState({
        ...INITIAL,
        status: "connecting",
        message: `Simulating ${deviceId}...`,
      });
      try {
        const challenge = await postJson<{ challengeId: string; nonce: string }>(
          "/api/auth/challenge",
          { deviceId, simulated: true },
        );
        const verified = await postJson<VerifyResponse>("/api/auth/verify", {
          challengeId: challenge.challengeId,
          simulate: true,
        });

        sessionRef.current = verified.sessionId;
        nonceRef.current = verified.presenceNonce;
        simulatedRef.current = true;

        setState({
          status: "authenticated",
          actor: verified.actor,
          sessionId: verified.sessionId,
          deviceId: verified.device.id,
          deviceLabel: verified.device.label,
          simulated: true,
          message: null,
          breakGlassUntil: null,
        });
        startHeartbeat();
      } catch (error) {
        setState({
          ...INITIAL,
          status: "locked",
          message: error instanceof Error ? error.message : "Could not authenticate.",
        });
      }
    },
    [startHeartbeat],
  );

  const signOut = useCallback(async () => {
    terminate("Signed out.");
    await keyRef.current?.disconnect();
    keyRef.current = null;
    setState({ ...INITIAL, message: "Signed out." });
  }, [terminate]);

  const confirmOnDevice = useCallback(
    async (nonce: string): Promise<string | null> => {
      if (simulatedRef.current || !keyRef.current?.connected) return null;
      return keyRef.current.confirm(nonce);
    },
    [],
  );

  const setKeyState = useCallback(async (keyState: KeyState) => {
    await keyRef.current?.setState(keyState);
  }, []);

  useEffect(() => stopHeartbeat, [stopHeartbeat]);

  return {
    state,
    connect,
    connectSimulated,
    signOut,
    confirmOnDevice,
    setKeyState,
    simulated: simulatedRef,
    serialSupported,
  };
}
