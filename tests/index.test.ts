import { handler } from '../src/index';
import { TelegramService } from '../src/services/telegram.service';
import type { ApiGatewayProxyEvent, TelegramSentMessage } from '../src/types/telegram';

jest.mock('../src/services/telegram.service');

describe('Lambda Telegram Webhook Handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Default env
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN';
  });

  it('returns 500 when TELEGRAM_BOT_TOKEN is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const event: ApiGatewayProxyEvent = {
      body: '{}',
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(500);
  });

  it('returns 200 on invalid JSON', async () => {
    const event: ApiGatewayProxyEvent = {
      body: '{',
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const parsed: { success: boolean } = JSON.parse(res.body) as { success: boolean };
    expect(parsed.success).toBe(true);
  });

  it('returns 200 on invalid structure', async () => {
    const event: ApiGatewayProxyEvent = {
      body: JSON.stringify({ foo: 'bar' }),
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });

  it('ignores non-message updates', async () => {
    const update = { update_id: 1234 };
    const event: ApiGatewayProxyEvent = {
      body: JSON.stringify(update),
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });

  it('processes message updates and calls TelegramService', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
      ok: true,
      result: { message_id: 1, chat: { id: 1, type: 'private' }, date: 0 } as TelegramSentMessage,
    });
    const update = {
      update_id: 1,
      message: {
        message_id: 2,
        chat: { id: 123, type: 'private' },
        date: 0,
        from: { id: 9, first_name: 'John' },
        text: 'Hi',
      },
    };
    const event: ApiGatewayProxyEvent = {
      body: JSON.stringify(update),
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalled();
  });

  it('returns 200 when TelegramService fails (to prevent retries)', async () => {
    jest.spyOn(TelegramService, 'sendMessage').mockRejectedValue(new Error('net'));
    const update = {
      update_id: 1,
      message: { message_id: 2, chat: { id: 123, type: 'private' }, date: 0 },
    };
    const event: ApiGatewayProxyEvent = {
      body: JSON.stringify(update),
      headers: null,
    } as unknown as ApiGatewayProxyEvent;
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
  });
});
