import {
  SqsEvent,
  SqsBatchResponse,
  ResultMessageSchema,
  ResultMessage,
  TelegramService,
  getTelegramSecrets,
  hasConfiguredSecretEnv,
  isProduction,
} from '@tg-assistant/common';

function formatResultMessage(result: ResultMessage): string {
  const statusEmoji =
    result.status === 'success'
      ? '\u2705'
      : result.status === 'partial'
        ? '\u26a0\ufe0f'
        : '\u274c';

  const lines: string[] = [`${statusEmoji} Task result (order ${result.orderId})`];

  if (result.result?.summary) {
    lines.push('', result.result.summary);
  }

  if (result.error) {
    lines.push('', `Error: ${result.error.message}`);
  }

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
        // Invalid messages will never pass validation — don't retry
        continue;
      }

      const result = parsed.data;
      const text = formatResultMessage(result);

      await TelegramService.sendMessage({
        botToken,
        chatId: result.chatId,
        text,
      });

      console.log(`Sent feedback for order ${result.orderId} to chat ${result.chatId}`);
    } catch {
      console.error(`Failed to process record ${record.messageId}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
