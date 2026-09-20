export function stitchSpeechResults(finals: string[], interim = ""): string {
  return [...finals, interim]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function speechRecognitionCtor(): BrowserSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  return (
    speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
  );
}

export function browserSttAvailable() {
  return speechRecognitionCtor() !== null;
}

export type BrowserSttSession = {
  stop: () => Promise<string>;
};

/**
 * Chrome / Edge Web Speech API. Runs on the laptop mic in parallel with ESP
 * capture so we still get a transcript when Grok STT returns empty audio.
 */
export function startBrowserStt(options?: {
  onPartial?: (text: string) => void;
}): BrowserSttSession | null {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  rec.lang = "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  const finals: string[] = [];
  let interim = "";
  let stopped = false;
  let settle: ((text: string) => void) | null = null;

  const currentText = () => stitchSpeechResults(finals, interim);

  rec.onresult = (event) => {
    interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const piece = result?.[0]?.transcript?.trim() ?? "";
      if (!piece) continue;
      if (result?.isFinal) finals.push(piece);
      else interim = piece;
    }
    options?.onPartial?.(currentText());
  };

  rec.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    console.warn("[iris browser stt]", event.error);
  };

  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
      } catch {
        // Chrome throws if start() is called too quickly after onend.
      }
      return;
    }
    settle?.(currentText());
  };

  try {
    rec.start();
  } catch (error) {
    console.warn("[iris browser stt] start failed", error);
    return null;
  }

  return {
    stop: () =>
      new Promise((resolve) => {
        if (stopped) {
          resolve(currentText());
          return;
        }
        stopped = true;
        settle = resolve;
        try {
          rec.stop();
        } catch {
          resolve(currentText());
          return;
        }
        window.setTimeout(() => resolve(currentText()), 1200);
      }),
  };
}
