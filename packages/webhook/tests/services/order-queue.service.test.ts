import { SendMessageCommand, SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { OrderQueueService, type SendOrderInput } from '../../src/services/order-queue.service';

const QUEUE_URL = 'https://sqs.eu-central-1.amazonaws.com/123456789012/test-order-queue';

function makeOrder(overrides?: Partial<SendOrderInput>): SendOrderInput {
  return {
    orderId: 'order-001',
    taskType: 'playwright-scraping',
    payload: { url: 'https://example.com' },
    userId: '42',
    timestamp: '2026-03-27T00:00:00Z',
    ...overrides,
  };
}

function getSentInput(sendMock: jest.Mock): SendMessageCommandInput {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const command = sendMock.mock.calls[0]![0] as SendMessageCommand;
  return command.input;
}

describe('OrderQueueService', () => {
  let sendMock: jest.Mock;
  let service: OrderQueueService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock = jest.fn().mockResolvedValue({ MessageId: 'msg-123' });
    // Inject a lightweight mock client with only the `send` method
    service = new OrderQueueService(QUEUE_URL, { send: sendMock } as never);
  });

  test('sends order to SQS and returns MessageId', async () => {
    const order = makeOrder();

    const messageId = await service.sendOrder(order);

    expect(messageId).toBe('msg-123');
    expect(sendMock).toHaveBeenCalledTimes(1);

    const input = getSentInput(sendMock);
    expect(input.QueueUrl).toBe(QUEUE_URL);

    const body = JSON.parse(input.MessageBody!) as SendOrderInput;
    expect(body.orderId).toBe('order-001');
    expect(body.taskType).toBe('playwright-scraping');
  });

  test('sets correct message attributes', async () => {
    const order = makeOrder({
      priority: 'high',
      correlationId: 'corr-001',
    });

    await service.sendOrder(order);

    const input = getSentInput(sendMock);
    const attrs = input.MessageAttributes!;

    expect(attrs.TaskType).toEqual({ DataType: 'String', StringValue: 'playwright-scraping' });
    expect(attrs.Priority).toEqual({ DataType: 'String', StringValue: 'high' });
    expect(attrs.UserId).toEqual({ DataType: 'String', StringValue: '42' });
    expect(attrs.CorrelationId).toEqual({ DataType: 'String', StringValue: 'corr-001' });
  });

  test('omits CorrelationId attribute when not provided', async () => {
    const order = makeOrder();

    await service.sendOrder(order);

    const input = getSentInput(sendMock);
    expect(input.MessageAttributes!.CorrelationId).toBeUndefined();
  });

  test('defaults priority to normal in both body and attribute', async () => {
    const order = makeOrder();

    await service.sendOrder(order);

    const input = getSentInput(sendMock);
    const body = JSON.parse(input.MessageBody!) as SendOrderInput;
    expect(body.priority).toBe('normal');
    expect(input.MessageAttributes!.Priority).toEqual({
      DataType: 'String',
      StringValue: 'normal',
    });
  });

  test('defaults schemaVersion to 1.0.0 when not provided', async () => {
    const order = makeOrder();

    await service.sendOrder(order);

    const input = getSentInput(sendMock);
    const body = JSON.parse(input.MessageBody!) as SendOrderInput;
    expect(body.schemaVersion).toBe('1.0.0');
  });

  test('throws when SQS returns no MessageId', async () => {
    sendMock.mockResolvedValue({});

    await expect(service.sendOrder(makeOrder())).rejects.toThrow('SQS returned no MessageId');
  });

  test('propagates SQS client errors', async () => {
    sendMock.mockRejectedValue(new Error('SQS unavailable'));

    await expect(service.sendOrder(makeOrder())).rejects.toThrow('SQS unavailable');
  });
});
