import { isTelegramUpdate, safeJsonParse } from '../../src/utils/validation';
import type { TelegramUpdate } from '../../src/types/telegram';

describe('validation utils', () => {
  test('safeJsonParse returns ok on valid JSON', () => {
    const res = safeJsonParse<{ a: number }>(JSON.stringify({ a: 1 }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.a).toBe(1);
    }
  });

  test('safeJsonParse returns error on invalid JSON', () => {
    const res = safeJsonParse('{');
    expect(res.ok).toBe(false);
  });

  test('isTelegramUpdate true on minimal valid object', () => {
    const obj: unknown = { update_id: 1234 } satisfies Partial<TelegramUpdate>;
    expect(isTelegramUpdate(obj)).toBe(true);
  });

  test('isTelegramUpdate false on missing update_id', () => {
    expect(isTelegramUpdate({})).toBe(false);
  });

  test('isTelegramUpdate validates message.chat.id when present', () => {
    const valid = {
      update_id: 1,
      message: { chat: { id: 5, type: 'private' }, date: 0, message_id: 2 },
    };
    const invalid = { update_id: 1, message: { chat: { id: 'x' } } } as unknown;
    expect(isTelegramUpdate(valid)).toBe(true);
    expect(isTelegramUpdate(invalid)).toBe(false);
  });
});

// Additional branch coverage tests
describe('validation utils - additional branches', () => {
  test('safeJsonParse returns error on null body', () => {
    const res = safeJsonParse(null);
    expect(res.ok).toBe(false);
  });

  test('isTelegramUpdate treats null message as non-message update (valid)', () => {
    const obj = { update_id: 1, message: null } as unknown;
    expect(isTelegramUpdate(obj)).toBe(true);
  });

  test('isTelegramUpdate false when message is non-object', () => {
    const obj = { update_id: 1, message: 123 } as unknown;
    expect(isTelegramUpdate(obj)).toBe(false);
  });

  test('isTelegramUpdate false when chat missing', () => {
    const obj = { update_id: 1, message: { message_id: 2 } } as unknown;
    expect(isTelegramUpdate(obj)).toBe(false);
  });
});
