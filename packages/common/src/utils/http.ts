import { ApiGatewayProxyResult } from '../types/telegram';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function ok(message: string): ApiGatewayProxyResult {
  return {
    statusCode: 200,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify({ success: true, message, timestamp: new Date().toISOString() }),
  };
}

export function error(statusCode: number, errorMessage: string): ApiGatewayProxyResult {
  return {
    statusCode,
    headers: { ...JSON_HEADERS },
    body: JSON.stringify({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }),
  };
}
