import { Injectable, Logger } from '@nestjs/common';

/**
 * Speech-to-text through the compose-local faster-whisper sidecar.
 *
 * The sidecar (`backend/scripts/whisper_server.py`) is a CPU service that only
 * listens on the compose network — the backend is its only client. It is shared
 * by note transcription (health) and the public voice chat.
 */
@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);

  /**
   * Transcribes an audio buffer. Returns null when the clip is silent,
   * undecodable, or the sidecar is down: callers have nothing useful to do
   * with those cases beyond asking the user to try again, so they are not
   * distinguished.
   */
  async transcribe(audio: Buffer, filename = 'audio.wav'): Promise<string | null> {
    const base = (process.env.WHISPER_BASE_URL?.trim() || 'http://whisper:8000').replace(
      /\/+$/,
      '',
    );
    try {
      const form = new FormData();
      // Copied into a plain Uint8Array: a Node Buffer's backing store is typed
      // as ArrayBufferLike (which includes SharedArrayBuffer) and so is not a
      // legal BlobPart without a cast.
      form.append('file', new Blob([new Uint8Array(audio)]), filename);
      const response = await fetch(`${base}/transcribe`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Whisper sidecar returned ${response.status}`);
        return null;
      }
      const payload = (await response.json()) as { text?: string };
      return payload.text?.trim() || null;
    } catch (error) {
      this.logger.warn(`Whisper transcription failed: ${String(error)}`);
      return null;
    }
  }
}

/**
 * Timeout for one transcription. `small` on CPU decodes several times faster
 * than realtime, but the container also has a small CPU share, so a long clip
 * on a busy box gets a generous ceiling rather than a tight one.
 */
const TRANSCRIBE_TIMEOUT_MS = 300_000;
