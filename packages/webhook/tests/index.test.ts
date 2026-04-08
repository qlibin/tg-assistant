import { handler } from '../src/index';
import { TelegramService, clearTelegramSecretCache } from '@tg-assistant/common';
import type { ApiGatewayProxyEvent, TelegramSentMessage } from '@tg-assistant/common';
import { OrderQueueService } from '../src/services/order-queue.service';

jest.mock('@tg-assistant/common', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual('@tg-assistant/common');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { ...actual, TelegramService: { sendMessage: jest.fn() } };
});

jest.mock('../src/services/order-queue.service');

const MockOrderQueueService = OrderQueueService as jest.MockedClass<typeof OrderQueueService>;

function makeTelegramUpdate(text: string, updateId = 1, userId = 9) {
  return {
    update_id: updateId,
    message: {
      message_id: 2,
      chat: { id: 123, type: 'private' },
      date: 0,
      from: { id: userId, first_name: 'John' },
      text,
    },
  };
}

function makeEvent(body: unknown): ApiGatewayProxyEvent {
  return { body: JSON.stringify(body), headers: null } as unknown as ApiGatewayProxyEvent;
}

describe('Lambda Telegram Webhook Handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearTelegramSecretCache();
    // Default env fallbacks for local development per unified secret util
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN';
    process.env.ORDER_QUEUE_URL = 'https://sqs.eu-central-1.amazonaws.com/123/order-queue';
    delete process.env.TELEGRAM_SECRET_ARN;
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

  describe('/echo command', () => {
    let sendOrderMock: jest.Mock;
    let sendMsgMock: jest.SpyInstance;

    beforeEach(() => {
      sendOrderMock = jest.fn<Promise<string>, []>().mockResolvedValue('msg-id-1');
      MockOrderQueueService.mockImplementation(
        () => ({ sendOrder: sendOrderMock }) as unknown as OrderQueueService
      );
      sendMsgMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
        ok: true,
        result: {
          message_id: 1,
          chat: { id: 123, type: 'private' },
          date: 0,
        } as TelegramSentMessage,
      });
    });

    it('sends order and ack for /echo command', async () => {
      const res = await handler(makeEvent(makeTelegramUpdate('/echo hello')));

      expect(res.statusCode).toBe(200);
      expect(sendOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'echo',
          chatId: 123,
          correlationId: 'tg-update-1',
          payload: { parameters: { text: 'hello' } },
        })
      );
      const ackCall = (sendMsgMock.mock.calls as Array<[{ text: string }]>)[0];
      expect(ackCall?.[0].text).toContain('Processing');
    });

    it('routes /echo@botname to the echo branch', async () => {
      const res = await handler(makeEvent(makeTelegramUpdate('/echo@mybot hello', 2)));

      expect(res.statusCode).toBe(200);
      expect(sendOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'echo',
          correlationId: 'tg-update-2',
          payload: { parameters: { text: 'hello' } },
        })
      );
    });

    it('uses update_id as correlationId prefix', async () => {
      await handler(makeEvent(makeTelegramUpdate('/echo test', 42)));

      expect(sendOrderMock).toHaveBeenCalledWith(
        expect.objectContaining({ correlationId: 'tg-update-42' })
      );
    });

    it('returns 200 and sends apology when ORDER_QUEUE_URL is missing', async () => {
      delete process.env.ORDER_QUEUE_URL;

      const res = await handler(makeEvent(makeTelegramUpdate('/echo hello')));

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('order queue unavailable');
      expect(sendOrderMock).not.toHaveBeenCalled();
      const msgCalls = sendMsgMock.mock.calls as Array<[{ text: string }]>;
      expect(msgCalls[0]?.[0].text).toContain('Sorry');
    });

    it('returns 200 and sends apology when sendOrder throws', async () => {
      sendOrderMock.mockRejectedValue(new Error('SQS error'));

      const res = await handler(makeEvent(makeTelegramUpdate('/echo hello')));

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('order dispatch failed');
      const msgCalls = sendMsgMock.mock.calls as Array<[{ text: string }]>;
      // First call is the ack, second is the apology after sendOrder throws
      expect(msgCalls[1]?.[0].text).toContain('Sorry');
    });

    it('non-/echo message still calls TelegramService directly', async () => {
      const res = await handler(makeEvent(makeTelegramUpdate('Hi there')));

      expect(res.statusCode).toBe(200);
      expect(sendOrderMock).not.toHaveBeenCalled();
      expect(sendMsgMock).toHaveBeenCalledTimes(1);
    });
  });
});
