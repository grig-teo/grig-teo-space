'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  locale: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const SESSION_STORAGE_KEY = 'ai_chat_session_id';

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

function labels(locale: string) {
  if (locale === 'ru') {
    return {
      title: 'AI помощник',
      input: 'Спросите о проектах, опыте или блоге...',
      send: 'Отправить',
      open: 'Открыть чат',
      close: 'Закрыть',
      welcome: 'Привет, я Gregory AI и могу ответить на ваши вопросы.',
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
    };
  }
  return {
    title: 'AI Assistant',
    input: 'Ask about projects, experience, or blog...',
    send: 'Send',
    open: 'Open chat',
    close: 'Close',
    welcome: 'Hi, i am Gregory AI can answer your questions',
  };
}

export function AssistantChatWidget({ locale }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState('');
  const text = useMemo(() => labels(locale), [locale]);

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
        messages?: Array<{ role?: 'user' | 'assistant'; content?: string }>;
      };
      const history = (data.messages ?? [])
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .map((item) => ({
          id: crypto.randomUUID(),
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
    if (!message || loading || !sessionId) {
      return;
    }

    setInput('');
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setLoading(true);

    try {
      const res = await fetch(`${apiPrefix()}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, locale, sessionId }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { answer?: string };
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.answer?.trim() || 'No answer returned.',
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            locale === 'ru'
              ? 'Не удалось получить ответ от AI. Попробуйте еще раз.'
              : locale === 'ro'
                ? 'Nu am putut obtine raspunsul AI. Incearca din nou.'
                : 'Could not get AI response. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed right-4 top-20 z-50 flex h-[min(26rem,calc(100dvh-6rem))] w-[min(92vw,22rem)] flex-col overflow-hidden border border-border bg-background shadow-xl">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <p className="text-sm font-semibold">{text.title}</p>
            <button
              type="button"
              aria-label={text.close}
              onClick={() => setOpen(false)}
              className="px-2 py-1 text-xs text-muted hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm"
          >
            <div className="max-w-[90%] bg-white/5 px-3 py-2 text-muted">{text.welcome}</div>
            {historyLoading ? <div className="text-xs text-muted">Loading history...</div> : null}
            {messages.map((item) => (
              <div
                key={item.id}
                id={`chat-msg-${item.id}`}
                className={`max-w-[90%] scroll-mt-2 px-3 py-2 ${
                  item.role === 'user'
                    ? 'ml-auto bg-accent/20 text-foreground'
                    : 'bg-white/5 text-foreground'
                }`}
              >
                {item.content}
              </div>
            ))}
            {loading ? <div className="text-xs text-muted">Thinking...</div> : null}
          </div>

          <div className="border-t border-border/60 p-2">
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
                placeholder={text.input}
                className="flex-1 border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent/70"
              />
              <button
                type="button"
                onClick={() => void submitMessage()}
                disabled={loading || !input.trim()}
                className="bg-accent px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
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
        className="fixed right-4 top-20 z-50 flex h-12 w-12 items-center justify-center bg-accent text-base font-semibold text-black shadow-lg hover:brightness-105"
      >
        AI
      </button>
    </>
  );
}
