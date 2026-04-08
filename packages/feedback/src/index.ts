import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  SqsEvent,
  SqsBatchResponse,
  ResultMessageSchema,
  ResultMessage,
  Status,
  TelegramService,
  getTelegramSecrets,
  hasConfiguredSecretEnv,
  isProduction,
} from '@tg-assistant/common';

const cloudwatch = new CloudWatchClient({});

async function emitValidationFailureMetric(): Promise<void> {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: 'tg-assistant',
        MetricData: [
          {
            MetricName: 'FeedbackResultValidationFailed',
            Dimensions: [{ Name: 'Env', Value: process.env.ENVIRONMENT ?? 'unknown' }],
            Value: 1,
            Unit: 'Count',
          },
        ],
      })
    );
  } catch (err) {
    console.error('Failed to emit CloudWatch metric', err);
  }
}

const STATUS_EMOJI: Record<Status, string> = {
  success: '\u2705',
  partial: '\u26a0\ufe0f',
  failure: '\u274c',
  timeout: '\u23f1',
  'rate-limited': '\ud83d\udea6',
  cancelled: '\ud83d\udeab',
};

const NON_SUCCESS_STATUSES: ReadonlySet<Status> = new Set([
  'failure',
  'timeout',
  'rate-limited',
  'cancelled',
]);

function formatResultMessage(result: ResultMessage): string {
  const statusEmoji = STATUS_EMOJI[result.status];
  const lines: string[] = [`${statusEmoji} Task result (order ${result.orderId})`];

  if (result.taskType === 'echo') {
    const text = result.result.data?.['text'];
    lines.push('', `Echo: ${typeof text === 'string' ? text : '(no text)'}`);
    return lines.join('\n');
  }

  if (result.result.summary) {
    lines.push('', result.result.summary);
    return lines.join('\n');
  }

  if (NON_SUCCESS_STATUSES.has(result.status)) {
    const errorDetails = result.result.metadata?.errorDetails;
    if (errorDetails) {
      const message = errorDetails['message'];
      lines.push(
        '',
        `Error: ${typeof message === 'string' ? message : JSON.stringify(errorDetails)}`
      );
    } else {
      lines.push('', 'Error: Task failed');
    }
    return lines.join('\n');
  }

  lines.push('', `Task ${result.orderId} completed (${result.status})`);
  return lines.join('\n');
}

export const handler = async (event: SqsEvent): Promise<SqsBatchResponse> => {
  console.log(`Processing ${event.Records.length} SQS record(s)`);

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  if (isProduction() && !hasConfiguredSecretEnv()) {
    console.error('Missing TELEGRAM_SECRET_ARN in production');
    return {
      batchItemFailures: event.Records.map(r => ({ itemIdentifier: r.messageId })),
    };
  }

  const { botToken } = await getTelegramSecrets().catch(
    () => ({ botToken: '' }) as { botToken: string }
  );

  if (!botToken) {
    console.error('Missing Telegram bot token');
    return {
      batchItemFailures: event.Records.map(r => ({ itemIdentifier: r.messageId })),
    };
  }

  for (const record of event.Records) {
    try {
      const body: unknown = JSON.parse(record.body);
      const parsed = ResultMessageSchema.safeParse(body);

      if (!parsed.success) {
        console.error(`Invalid ResultMessage in record ${record.messageId}`);
        await emitValidationFailureMetric();
        // Invalid messages will never pass validation — don't retry
        continue;
      }

      const result = parsed.data;

      if (!result.chatId) {
        console.log(`Result ${result.orderId} has no chatId; skipping Telegram notification`);
        continue;
      }

      const text = formatResultMessage(result);

      await TelegramService.sendMessage({
        botToken,
        chatId: result.chatId,
        text,
      });

      console.log(`Sent feedback for order ${result.orderId}`);
    } catch {
      console.error(`Failed to process record ${record.messageId}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
