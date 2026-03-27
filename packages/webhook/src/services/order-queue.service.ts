import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { OrderMessage } from '@tg-assistant/common';

export const SCHEMA_VERSION = '1.0.0';

export class OrderQueueService {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(queueUrl: string, client?: SQSClient) {
    this.queueUrl = queueUrl;
    this.client = client ?? new SQSClient();
  }

  async sendOrder(order: OrderMessage): Promise<string> {
    const messageBody: OrderMessage = {
      ...order,
      schemaVersion: order.schemaVersion ?? SCHEMA_VERSION,
    };

    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
      TaskType: { DataType: 'String', StringValue: order.taskType },
      Priority: { DataType: 'String', StringValue: order.priority ?? 'normal' },
      UserId: { DataType: 'String', StringValue: order.userId },
    };

    if (order.correlationId) {
      messageAttributes.CorrelationId = {
        DataType: 'String',
        StringValue: order.correlationId,
      };
    }

    const command = new SendMessageCommand({
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: messageAttributes,
    });

    const response = await this.client.send(command);

    if (!response.MessageId) {
      throw new Error('SQS returned no MessageId');
    }

    return response.MessageId;
  }
}
