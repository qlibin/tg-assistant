import { handler } from '../src/index';
import { TelegramService, clearTelegramSecretCache } from '@tg-assistant/common';
import type { SqsEvent, SqsRecord, ResultMessage } from '@tg-assistant/common';

jest.mock('@tg-assistant/common', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual('@tg-assistant/common');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return { ...actual, TelegramService: { sendMessage: jest.fn() } };
});

function makeSqsRecord(body: string, messageId = 'msg-1'): SqsRecord {
  return {
    messageId,
    receiptHandle: 'handle',
    body,
    attributes: {},
    messageAttributes: {},
    md5OfBody: '',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:eu-central-1:123456789:result-queue',
    awsRegion: 'eu-central-1',
  };
}

function makeResultMessage(overrides?: Partial<ResultMessage>): ResultMessage {
  return {
    orderId: 'order-1',
    status: 'success',
    userId: 'user-1',
    chatId: 123,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Feedback Lambda SQS Handler', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearTelegramSecretCache();
    process.env.TELEGRAM_WEBHOOK_SECRET = 'TEST_WEBHOOK_SECRET';
    process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN';
    delete process.env.TELEGRAM_SECRET_ARN;
  });

  it('returns empty batchItemFailures for empty Records array', async () => {
    const event: SqsEvent = { Records: [] };
    const result = await handler(event);
    expect(result.batchItemFailures).toEqual([]);
  });

  it('processes a valid ResultMessage and sends Telegram message', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
      ok: true,
      result: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
    });

    const msg = makeResultMessage();
    const event: SqsEvent = { Records: [makeSqsRecord(JSON.stringify(msg))] };
    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        botToken: 'TEST_TOKEN',
        chatId: 123,
      })
    );
  });

  it('includes summary in message text for successful results', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
      ok: true,
      result: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
    });

    const msg = makeResultMessage({ result: { summary: 'Task completed' } });
    const event: SqsEvent = { Records: [makeSqsRecord(JSON.stringify(msg))] };
    await handler(event);

    const callArg = sendMock.mock.calls[0]?.[0] as { text: string };
    expect(callArg.text).toContain('Task completed');
  });

  it('includes error message for failed results', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
      ok: true,
      result: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
    });

    const msg = makeResultMessage({
      status: 'failure',
      error: { message: 'Timeout exceeded' },
    });
    const event: SqsEvent = { Records: [makeSqsRecord(JSON.stringify(msg))] };
    await handler(event);

    const callArg = sendMock.mock.calls[0]?.[0] as { text: string };
    expect(callArg.text).toContain('Timeout exceeded');
  });

  it('includes partial warning emoji for partial results', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage').mockResolvedValue({
      ok: true,
      result: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
    });

    const msg = makeResultMessage({ status: 'partial' });
    const event: SqsEvent = { Records: [makeSqsRecord(JSON.stringify(msg))] };
    await handler(event);

    const callArg = sendMock.mock.calls[0]?.[0] as { text: string };
    expect(callArg.text).toContain('\u26a0\ufe0f'); // Warning emoji
  });

  it('skips invalid ResultMessage records without retrying', async () => {
    const sendMock = jest.spyOn(TelegramService, 'sendMessage');

    const event: SqsEvent = { Records: [makeSqsRecord('{"invalid": true}')] };
    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips records with unparseable JSON without retrying', async () => {
    const event: SqsEvent = { Records: [makeSqsRecord('{not json')] };
    const result = await handler(event);

    // JSON parse failure is caught and added to batch failures for retry
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
  });

  it('adds record to batchItemFailures when TelegramService fails', async () => {
    jest.spyOn(TelegramService, 'sendMessage').mockRejectedValue(new Error('network error'));

    const msg = makeResultMessage();
    const event: SqsEvent = { Records: [makeSqsRecord(JSON.stringify(msg))] };
    const result = await handler(event);

    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
  });

  it('processes multiple records independently', async () => {
    const sendMock = jest
      .spyOn(TelegramService, 'sendMessage')
      .mockResolvedValueOnce({
        ok: true,
        result: { message_id: 1, chat: { id: 123, type: 'private' }, date: 0 },
      })
      .mockRejectedValueOnce(new Error('network error'));

    const msg1 = makeResultMessage({ orderId: 'order-1' });
    const msg2 = makeResultMessage({ orderId: 'order-2', chatId: 456 });
    const event: SqsEvent = {
      Records: [
        makeSqsRecord(JSON.stringify(msg1), 'msg-1'),
        makeSqsRecord(JSON.stringify(msg2), 'msg-2'),
      ],
    };
    const result = await handler(event);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-2' }]);
  });

  it('fails all records when bot token is missing', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const msg = makeResultMessage();
    const event: SqsEvent = {
      Records: [
        makeSqsRecord(JSON.stringify(msg), 'msg-1'),
        makeSqsRecord(JSON.stringify(msg), 'msg-2'),
      ],
    };
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(2);
  });

  it('fails all records when in production and TELEGRAM_SECRET_ARN is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.TELEGRAM_SECRET_ARN;
    delete process.env.TELEGRAM_BOT_TOKEN; // Ensure it doesn't fall back to bot token

    const msg = makeResultMessage();
    const event: SqsEvent = {
      Records: [
        makeSqsRecord(JSON.stringify(msg), 'msg-1'),
        makeSqsRecord(JSON.stringify(msg), 'msg-2'),
      ],
    };
    const result = await handler(event);

    expect(result.batchItemFailures).toHaveLength(2);
  });
});
