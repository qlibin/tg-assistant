import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SCHEMA_VERSION, type OrderMessage } from '@qlibin/tg-assistant-contracts';

/** OrderMessage with schemaVersion optional — the service defaults it to SCHEMA_VERSION. */
export type SendOrderInput = Omit<OrderMessage, 'schemaVersion'> & {
  schemaVersion?: typeof SCHEMA_VERSION;
};

export class OrderQueueService {
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(queueUrl: string, client?: SQSClient) {
    this.queueUrl = queueUrl;
    this.client = client ?? new SQSClient();
  }

  async sendOrder(input: SendOrderInput): Promise<string> {
    const priority = input.priority ?? 'normal';

    const messageBody: OrderMessage = {
      ...input,
      priority,
      schemaVersion: input.schemaVersion ?? SCHEMA_VERSION,
    };

    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {
      TaskType: { DataType: 'String', StringValue: input.taskType },
      Priority: { DataType: 'String', StringValue: priority },
      UserId: { DataType: 'String', StringValue: input.userId },
    };

    if (input.correlationId) {
      messageAttributes.CorrelationId = {
        DataType: 'String',
        StringValue: input.correlationId,
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
