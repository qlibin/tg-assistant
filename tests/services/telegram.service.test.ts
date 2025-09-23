import https from 'https';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import type { IncomingMessage } from 'http';
import { TelegramService } from '../../src/services/telegram.service';

jest.mock('https');

type HttpsRequestCallback = (res: IncomingMessage) => void;

class MockIncomingMessage extends Readable {
  public statusCode?: number;
  // we only need minimal implementation for tests
  _read(): void {
    // no-op
  }
}

interface ClientRequestLike extends EventEmitter {
  write: (chunk: unknown) => void;
  end: () => void;
  destroy: () => void;
  setTimeout: (ms: number, cb?: () => void) => void;
}

function mockHttpsResponse(statusCode: number, body: string): IncomingMessage {
  const res = new MockIncomingMessage();
  res.statusCode = statusCode;
  setImmediate(() => {
    res.emit('data', Buffer.from(body));
    res.emit('end');
  });
  return res as unknown as IncomingMessage;
}

describe('TelegramService.sendMessage', () => {
  const requestMock = https.request as unknown as jest.Mock<
    ClientRequestLike,
    [unknown, HttpsRequestCallback]
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('succeeds on 200 ok=true', async () => {
    requestMock.mockImplementation((_options: unknown, cb: HttpsRequestCallback) => {
      const req: ClientRequestLike = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
        setTimeout: jest.fn(),
      });
      const res = mockHttpsResponse(200, JSON.stringify({ ok: true, result: {} }));
      cb(res);
      return req;
    });

    const res = await TelegramService.sendMessage({ botToken: 'T', chatId: 1, text: 'hi' });
    expect(res.ok).toBe(true);
  });

  it('fails on 4xx without retry', async () => {
    let callCount = 0;
    requestMock.mockImplementation((_options: unknown, cb: HttpsRequestCallback) => {
      callCount++;
      const req: ClientRequestLike = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn?.() ?? (() => {}),
      });
      const res = mockHttpsResponse(400, JSON.stringify({ ok: false, description: 'bad' }));
      process.nextTick(() => cb(res));
      return req;
    });

    await expect(
      TelegramService.sendMessage({ botToken: 'T', chatId: 1, text: 'hi' })
    ).rejects.toThrow(/400/);
    expect(callCount).toBe(1);
  });

  it('retries once on 5xx and then succeeds', async () => {
    let call = 0;
    requestMock.mockImplementation((_options: unknown, cb: HttpsRequestCallback) => {
      const req: ClientRequestLike = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn?.() ?? (() => {}),
      });
      call++;
      if (call === 1) {
        const res = mockHttpsResponse(500, JSON.stringify({ ok: false, description: 'err' }));
        cb(res);
      } else {
        const res = mockHttpsResponse(200, JSON.stringify({ ok: true, result: {} }));
        cb(res);
      }
      return req;
    });

    const res = await TelegramService.sendMessage({ botToken: 'T', chatId: 1, text: 'hi' });
    expect(res.ok).toBe(true);
    expect(call).toBe(2);
  });

  it('times out properly', async () => {
    requestMock.mockImplementation((_options: unknown, _cb: HttpsRequestCallback) => {
      // mark as used to satisfy lint
      void _options;
      void _cb;
      const req: ClientRequestLike = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
        setTimeout: jest.fn(() => {
          setImmediate(() => (req as EventEmitter).emit('timeout'));
        }),
      });
      return req;
    });

    await expect(
      TelegramService.sendMessage({ botToken: 'T', chatId: 1, text: 'hi', timeoutMs: 10 })
    ).rejects.toThrow(/timeout/i);
  });

  it('handles malformed JSON response', async () => {
    requestMock.mockImplementation((_options: unknown, cb: HttpsRequestCallback) => {
      const req: ClientRequestLike = Object.assign(new EventEmitter(), {
        write: jest.fn(),
        end: jest.fn(),
        setTimeout: jest.fn(),
        destroy: jest.fn?.() ?? (() => {}),
      });
      const res = mockHttpsResponse(200, 'not-json');
      process.nextTick(() => cb(res));
      return req;
    });

    await expect(
      TelegramService.sendMessage({ botToken: 'T', chatId: 1, text: 'hi' })
    ).rejects.toThrow(/Malformed|Unexpected token/);
  });
});
