'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  locale: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const SESSION_STORAGE_KEY = 'ai_chat_session_id';

/** Recording cap: a voice question is a sentence or two, not a monologue. */
const MAX_RECORDING_MS = 30_000;

/** Container preference per browser. Chromium and Firefox record WebM/Opus,
 *  Safari only MP4/AAC; the backend's decoder handles either. */
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

/** BCP-47 tag per site locale so the browser picks a matching voice. */
const SPEECH_LANG: Record<string, string> = { en: 'en-US', ru: 'ru-RU', ro: 'ro-RO' };

function apiPrefix(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  return configured ? `${configured}/api` : '/api';
}

function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) {
    return existing;
  }
  const sessionId = crypto.randomUUID();
  localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  return sessionId;
}

/** First recording container this browser will actually produce. */
function pickAudioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') {
    return undefined;
  }
  return AUDIO_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

/** File extension for a recorded MIME type — the recognizer sniffs the suffix. */
function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Last-resort markdown strip before handing text to the synthesizer. The
 *  server already flattens voice replies; this covers error strings. */
function plainForSpeech(text: string): string {
  return text
    .replace(/`{1,3}|[*_~#]{1,3}/g, '')
    .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function labels(locale: string) {
  if (locale === 'ru') {
    return {
      title: 'AI помощник',
      input: 'Спросите о проектах, опыте или блоге...',
      send: 'Отправить',
      open: 'Открыть чат',
      close: 'Закрыть',
      welcome: 'Привет, я Gregory AI и могу ответить на ваши вопросы.',
      limitReached: 'Вы использовали все 3 вопроса на сегодня. Возвращайтесь завтра!',
      questionsLeft: (n: number) => `Осталось вопросов: ${n} из 3`,
      voice: 'Голосовой вопрос',
      stopVoice: 'Остановить запись',
      recording: 'Слушаю... нажмите, чтобы отправить',
      transcribing: 'Распознаю...',
      speaking: 'Говорю...',
      stopSpeaking: 'стоп',
      voiceLeft: (n: number) => `Голосовых вопросов: ${n}`,
      voiceLimitReached: 'Голосовые вопросы на сегодня закончились.',
      micDenied: 'Не удалось получить доступ к микрофону. Проверьте разрешение в браузере.',
      notHeard: 'Не расслышал. Попробуйте ещё раз, ближе к микрофону.',
      voiceError: 'Не удалось связаться с голосовым помощником. Попробуйте ещё раз.',
    };
  }
  if (locale === 'ro') {
    return {
      title: 'Asistent AI',
      input: 'Intreaba despre proiecte, experienta sau blog...',
      send: 'Trimite',
      open: 'Deschide chat',
      close: 'Inchide',
      welcome: 'Salut, sunt Gregory AI si pot raspunde la intrebarile tale.',
      limitReached: 'Ai folosit toate cele 3 intrebari de azi. Revino maine!',
      questionsLeft: (n: number) => `Intrebari ramase: ${n} din 3`,
      voice: 'Intrebare vocala',
      stopVoice: 'Opreste inregistrarea',
      recording: 'Ascult... apasa pentru a trimite',
      transcribing: 'Transcriu...',
      speaking: 'Vorbesc...',
      stopSpeaking: 'stop',
      voiceLeft: (n: number) => `Intrebari vocale: ${n}`,
      voiceLimitReached: 'Ai folosit toate intrebarile vocale de azi.',
      micDenied: 'Nu am putut accesa microfonul. Verifica permisiunea din browser.',
      notHeard: 'Nu am inteles. Incearca din nou, mai aproape de microfon.',
      voiceError: 'Nu am putut contacta asistentul vocal. Incearca din nou.',
    };
  }
  return {
    title: 'AI Assistant',
    input: 'Ask about projects, experience, or blog...',
    send: 'Send',
    open: 'Open chat',
    close: 'Close',
    welcome: 'Hi, i am Gregory AI can answer your questions',
    limitReached: "You've used all 3 questions for today. Come back tomorrow!",
    questionsLeft: (n: number) => `Questions left: ${n} of 3`,
    voice: 'Ask by voice',
    stopVoice: 'Stop recording',
    recording: 'Listening... tap to send',
    transcribing: 'Transcribing...',
    speaking: 'Speaking...',
    stopSpeaking: 'stop',
    voiceLeft: (n: number) => `Voice questions left: ${n}`,
    voiceLimitReached: "You've used all your voice questions for today.",
    micDenied: 'I could not access the microphone. Check the browser permission and retry.',
    notHeard: "I didn't catch that. Try again a little closer to the mic.",
    voiceError: 'Could not reach the voice assistant. Please try again.',
  };
}

type VoiceLabels = ReturnType<typeof labels>;

/** Reads replies aloud through the browser's speech synthesizer. */
function useSpeech(locale: string) {
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      const spoken = plainForSpeech(text);
      if (!spoken) {
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = SPEECH_LANG[locale] ?? 'en-US';
      // Voice lists can still be empty on the first call, in which case the
      // browser falls back to its default voice for the requested language.
      const prefix = utterance.lang.slice(0, 2).toLowerCase();
      const match = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.replace('_', '-').toLowerCase().startsWith(prefix));
      if (match) {
        utterance.voice = match;
      }
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [locale],
  );

  // Silence the synthesizer if the widget goes away mid-sentence.
  useEffect(() => stop, [stop]);

  return { speaking, speak, stop };
}

type RecorderOptions = {
  maxMs: number;
  onClip: (blob: Blob, mime: string) => void;
  onError: () => void;
};

/** Push-to-talk recorder. `start` opens the mic, `stop` closes it and hands the
 *  clip to `onClip`; a timer stops a forgotten recording at `maxMs`. */
function useVoiceRecorder({ maxMs, onClip, onError }: RecorderOptions) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  // The recorder's event handlers outlive the render that created them, so the
  // callbacks are read through refs to avoid calling a stale closure.
  const onClipRef = useRef(onClip);
  const onErrorRef = useRef(onError);
  onClipRef.current = onClip;
  onErrorRef.current = onError;

  // Detected after mount: SSR has no MediaRecorder, and deciding during render
  // would change the markup between the server and client passes.
  useEffect(() => {
    setSupported(pickAudioMime() !== undefined);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(
    (cancel = false) => {
      cancelledRef.current = cancel;
      clearTimer();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
    [clearTimer],
  );

  const start = useCallback(async () => {
    const mime = pickAudioMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (cancelledRef.current) {
          return;
        }
        onClipRef.current(new Blob(chunksRef.current, { type: mime }), mime);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      timerRef.current = window.setTimeout(() => stop(false), maxMs);
    } catch {
      // Permission denied or no input device.
      onErrorRef.current();
    }
  }, [maxMs, stop]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      clearTimer();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    },
    [clearTimer],
  );

  return { recording, supported, start, stop };
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M18 11a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.91V19H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.09A6 6 0 0 0 18 11Z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

/** Pulsing dot used for the listening/transcribing states. */
function LiveDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}

export function AssistantChatWidget({ locale }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [limitReached, setLimitReached] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceRemaining, setVoiceRemaining] = useState<number | null>(null);
  const [voiceLimitReached, setVoiceLimitReached] = useState(false);
  const text = useMemo(() => labels(locale), [locale]);
  const { speaking, speak, stop: stopSpeaking } = useSpeech(locale);

  const append = useCallback((role: ChatMessage['role'], content: string) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, content }]);
  }, []);

  const sendVoiceClip = useCallback(
    async (blob: Blob, mime: string) => {
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append('audio', blob, `voice.${extensionFor(mime)}`);
        form.append('locale', locale);
        form.append('sessionId', sessionId);
        const res = await fetch(`${apiPrefix()}/ai/voice`, { method: 'POST', body: form });

        // 429 = per-IP voice quota reached. The turn was spent, so lock the mic.
        if (res.status === 429) {
          setVoiceLimitReached(true);
          setVoiceRemaining(0);
          append('assistant', text.voiceLimitReached);
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as {
          transcript?: string;
          answer?: string;
          remaining?: number;
        };
        if (typeof data.remaining === 'number') {
          setVoiceRemaining(data.remaining);
          if (data.remaining === 0) {
            setVoiceLimitReached(true);
          }
        }

        const transcript = data.transcript?.trim() ?? '';
        if (!transcript) {
          append('assistant', text.notHeard);
          return;
        }
        append('user', transcript);

        const answer = data.answer?.trim() ?? '';
        append('assistant', answer || text.voiceError);
        if (answer) {
          speak(answer);
        }
      } catch {
        append('assistant', text.voiceError);
      } finally {
        setTranscribing(false);
      }
    },
    [append, locale, sessionId, speak, text],
  );

  const { recording, supported: voiceSupported, start, stop } = useVoiceRecorder({
    maxMs: MAX_RECORDING_MS,
    onClip: (blob, mime) => void sendVoiceClip(blob, mime),
    onError: () => append('assistant', text.micDenied),
  });

  const voiceDisabled = transcribing || loading || voiceLimitReached;

  function toggleRecording() {
    if (recording) {
      stop();
      return;
    }
    stopSpeaking();
    void start();
  }

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  const loadHistory = useCallback(async () => {
    if (!sessionId) {
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `${apiPrefix()}/ai/chat/history?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        messages?: Array<{ role?: 'user' | 'assistant'; content?: string; createdAt?: string }>;
      };
      const history = (data.messages ?? [])
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({
          id: `${item.role}-${item.createdAt ?? ''}`,
          role: item.role as 'user' | 'assistant',
          content: item.content?.trim() ?? '',
        }))
        .filter((item) => item.content);
      setMessages(history);
    } finally {
      setHistoryLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open && sessionId) {
      void loadHistory();
    }
  }, [open, sessionId, loadHistory]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks the last assistant message we've already scrolled to, so we only
  // auto-scroll on a *new* answer (not on every messages update).
  const lastAnswerIdRef = useRef<string | null>(null);

  // (a) Opening the chat scrolls to the bottom (after history finishes loading).
  useEffect(() => {
    if (!open || historyLoading) {
      return;
    }
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    // Mark the existing last assistant message as "seen" so the new-answer
    // effect below doesn't immediately re-scroll to its start on open.
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    lastAnswerIdRef.current = lastAssistant?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, historyLoading]);

  // (b) When a new assistant answer arrives while the chat is open, scroll
  // the message to the top of the scroll area so the answer starts in view.
  useEffect(() => {
    if (!open) {
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') {
      return;
    }
    if (lastAnswerIdRef.current === last.id) {
      return;
    }
    lastAnswerIdRef.current = last.id;
    const node = document.getElementById(`chat-msg-${last.id}`);
    node?.scrollIntoView({ block: 'start' });
  }, [open, messages]);

  async function submitMessage() {
    const message = input.trim();
    if (!message || loading || !sessionId || limitReached) {
      return;
    }

    stopSpeaking();
    setInput('');
    append('user', message);
    setLoading(true);

    try {
      const res = await fetch(`${apiPrefix()}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, locale, sessionId }),
      });

      // 429 = per-IP question limit reached. Show the quota message and lock
      // the input until the window resets.
      if (res.status === 429) {
        setLimitReached(true);
        setRemaining(0);
        append('assistant', text.limitReached);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as { answer?: string; remaining?: number };
      if (typeof data.remaining === 'number') {
        setRemaining(data.remaining);
        if (data.remaining === 0) {
          setLimitReached(true);
        }
      }
      append('assistant', data.answer?.trim() || 'No answer returned.');
    } catch {
      append(
        'assistant',
        locale === 'ru'
          ? 'Не удалось получить ответ от AI. Попробуйте еще раз.'
          : locale === 'ro'
            ? 'Nu am putut obtine raspunsul AI. Incearca din nou.'
            : 'Could not get AI response. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed right-4 top-20 z-50 flex h-[min(26rem,calc(100dvh-6rem))] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="font-mono text-sm font-semibold">{text.title}</p>
            <button
              type="button"
              aria-label={text.close}
              onClick={() => {
                stopSpeaking();
                stop(true);
                setOpen(false);
              }}
              className="rounded px-2 py-1 text-xs text-muted transition-colors hover:text-accent"
            >
              ✕
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm"
          >
            <div className="max-w-[90%] bg-foreground/5 px-3 py-2 text-muted">{text.welcome}</div>
            {historyLoading ? <div className="text-xs text-muted">Loading history...</div> : null}
            {messages.map((item) => (
              <div
                key={item.id}
                id={`chat-msg-${item.id}`}
                className={`max-w-[90%] scroll-mt-2 px-3 py-2 ${
                  item.role === 'user'
                    ? 'ml-auto bg-accent/20 text-foreground'
                    : 'bg-foreground/5 text-foreground'
                }`}
              >
                {item.role === 'assistant' ? (
                  <div className="chat-md">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {item.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  item.content
                )}
              </div>
            ))}
            {loading ? <div className="text-xs text-muted">Thinking...</div> : null}
          </div>

          <div className="border-t border-border p-2">
            <div className="mb-1 flex items-center justify-between gap-2 px-1 text-[10px] text-muted">
              <span>
                {[
                  !limitReached && remaining !== null && remaining > 0
                    ? text.questionsLeft(remaining)
                    : null,
                  !voiceLimitReached && voiceRemaining !== null
                    ? text.voiceLeft(voiceRemaining)
                    : null,
                  voiceLimitReached ? text.voiceLimitReached : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {recording || transcribing || speaking ? (
                <span className="flex shrink-0 items-center gap-1.5">
                  {recording || transcribing ? <LiveDot /> : null}
                  {recording ? text.recording : null}
                  {transcribing ? text.transcribing : null}
                  {speaking ? text.speaking : null}
                  {speaking ? (
                    <button
                      type="button"
                      onClick={stopSpeaking}
                      className="underline transition-colors hover:text-accent"
                    >
                      {text.stopSpeaking}
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitMessage();
                  }
                }}
                placeholder={limitReached ? text.limitReached : text.input}
                disabled={limitReached}
                className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/70 disabled:cursor-not-allowed disabled:opacity-50"
              />
              {voiceSupported ? (
                <button
                  type="button"
                  onClick={toggleRecording}
                  disabled={voiceDisabled}
                  aria-label={recording ? text.stopVoice : text.voice}
                  title={
                    voiceLimitReached
                      ? text.voiceLimitReached
                      : recording
                        ? text.stopVoice
                        : text.voice
                  }
                  className={`flex items-center justify-center rounded border px-2.5 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    recording
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  {recording ? <StopIcon /> : <MicIcon />}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void submitMessage()}
                disabled={loading || !input.trim() || limitReached}
                className="rounded bg-accent px-3 py-2 font-mono text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {text.send}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={text.open}
        className="fixed right-4 top-20 z-50 flex h-12 w-12 items-center justify-center bg-accent text-base font-semibold text-background shadow-lg hover:brightness-105"
      >
        AI
      </button>
    </>
  );
}
