import {
  ApiGatewayProxyEvent,
  ApiGatewayProxyResult,
  TelegramMessage,
  TelegramUpdate,
} from './types/telegram';
import { ok, error } from './utils/http';
import { isTelegramUpdate, safeJsonParse } from './utils/validation';
import { TelegramService } from './services/telegram.service';

function sanitizeEventForEcho(event: ApiGatewayProxyEvent): Record<string, unknown> {
  return {
    httpMethod: event.httpMethod,
    headers: event.headers ? Object.keys(event.headers) : [],
    requestContext: {
      requestId: event.requestContext?.requestId,
      stage: event.requestContext?.stage,
      httpMethod: event.requestContext?.httpMethod,
    },
    // Do NOT echo the body to avoid leaking potentially sensitive data
    body: null,
  };
}

function extractMessageInfo(message: TelegramMessage): {
  chatId: number;
  userFirstName: string;
  text: string;
} {
  const userFirstName = message.from?.first_name ?? 'User';
  const text = message.text ?? '[Non-text message]';
  return { chatId: message.chat.id, userFirstName, text };
}

export const handler = async (event: ApiGatewayProxyEvent): Promise<ApiGatewayProxyResult> => {
  // Basic structured start log without PII
  console.log('Lambda invoked');

  // Validate env
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    return error(500, 'Bot token not configured');
  }

  // Parse body
  const parsed = safeJsonParse<unknown>(event.body);
  if (!parsed.ok) {
    console.warn('Invalid JSON payload');
    // Validation failures: return 200 to prevent Telegram retries
    return ok('Webhook processed (invalid JSON)');
  }

  const updateUnknown = parsed.value;
  if (!isTelegramUpdate(updateUnknown)) {
    console.warn('Invalid webhook structure');
    return ok('Webhook processed (invalid structure)');
  }

  const update: TelegramUpdate = updateUnknown;

  if (!update.message) {
    console.log('Non-message update ignored');
    return ok('Webhook processed (non-message update)');
  }

  const info = extractMessageInfo(update.message);
  const replyText =
    `Hello ${info.userFirstName}! \u{1F44B}\n\n` +
    `AWS Lambda Event Echo:\n\u0060\u0060\u0060json\n${JSON.stringify(sanitizeEventForEcho(event), null, 2)}\n\u0060\u0060\u0060`;

  try {
    await TelegramService.sendMessage({ botToken, chatId: info.chatId, text: replyText });
  } catch (e) {
    // Network/service failures: log internally but do not leak details
    console.error('Failed to send Telegram message');
    return ok('Webhook processed (send failure)');
  }

  return ok('Webhook processed successfully');
};
