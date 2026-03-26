import { TelegramUpdate } from '../types/telegram';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: Error };

export function safeJsonParse<T>(text: string | null | undefined): ParseResult<T> {
  if (text === null || text === undefined) {
    return { ok: false, error: new Error('Empty body') };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown as T };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e : new Error('Invalid JSON') };
  }
}

export function isTelegramUpdate(input: unknown): input is TelegramUpdate {
  if (typeof input !== 'object' || input === null) {
    return false;
  }
  const maybe = input as Record<string, unknown>;
  if (!('update_id' in maybe)) {
    return false;
  }
  if (typeof maybe.update_id !== 'number') {
    return false;
  }
  // message optional but if present, must have chat.id
  if ('message' in maybe && maybe.message !== undefined && maybe.message !== null) {
    const msg = maybe.message as Record<string, unknown>;
    if (typeof msg !== 'object') {
      return false;
    }
    const chat = msg.chat as Record<string, unknown> | undefined;
    if (!chat || typeof chat !== 'object') {
      return false;
    }
    if (typeof chat.id !== 'number') {
      return false;
    }
  }
  return true;
}
