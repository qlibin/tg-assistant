// Minimal Telegram and API Gateway types used by the handler
// Strict typing: no any

export interface ApiGatewayProxyEvent {
  // Only the fields we access in the handler
  httpMethod?: string;
  headers?: Record<string, string | undefined> | null;
  body: string | null;
  requestContext?: {
    requestId?: string;
    stage?: string;
    httpMethod?: string;
  };
}

export interface ApiGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// Telegram Update & Message minimal types
export interface TelegramUser {
  id: number; // user id is numeric but can exceed 32-bit range
  is_bot?: boolean;
  first_name?: string;
  last_name?: string | null;
  username?: string | null;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  // Other update types are ignored
}

// Telegram Bot API sendMessage response
export interface TelegramApiResponseOk<T> {
  ok: true;
  result: T;
}

export interface TelegramApiResponseErr {
  ok: false;
  error_code?: number;
  description?: string;
}

export type TelegramApiResponse<T> = TelegramApiResponseOk<T> | TelegramApiResponseErr;

export type TelegramSentMessage = TelegramMessage;
