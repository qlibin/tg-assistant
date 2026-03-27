// Public API for @tg-assistant/common

// Types
export type {
  ApiGatewayProxyEvent,
  ApiGatewayProxyResult,
  TelegramUser,
  TelegramChat,
  TelegramMessage,
  TelegramUpdate,
  TelegramApiResponseOk,
  TelegramApiResponseErr,
  TelegramApiResponse,
  TelegramSentMessage,
} from './types/telegram';

// HTTP helpers
export { ok, error } from './utils/http';

// Validation
export { safeJsonParse, isTelegramUpdate } from './utils/validation';
export type { ParseResult } from './utils/validation';

// Telegram secrets
export {
  getTelegramSecrets,
  getTelegramWebhookSecret,
  getTelegramBotToken,
  clearTelegramSecretCache,
  hasConfiguredSecretEnv,
  isProduction,
  ConfigError,
  SecretNotFoundError,
  SecretMalformedError,
} from './utils/telegram-secret';
export type { TelegramSecretsShape, TelegramSecretsResolved } from './utils/telegram-secret';

// SQS types and schemas
export type {
  SqsMessageAttribute,
  SqsRecord,
  SqsEvent,
  SqsBatchResponse,
  TaskType,
  OrderMessage,
  ResultMessage,
} from './types/sqs';
export { TaskTypeSchema, OrderMessageSchema, ResultMessageSchema } from './types/sqs';

// Services
export { TelegramService } from './services/telegram.service';
export type { SendMessageParams } from './services/telegram.service';
