/*
  Unified secret retrieval utility for Telegram webhook secret and bot token.
  - Reads TELEGRAM_SECRET_ARN when provided and fetches from AWS Secrets Manager.
  - Fallbacks for local dev: TELEGRAM_WEBHOOK_SECRET and TELEGRAM_BOT_TOKEN.
  - Caches the resolved values for warm Lambda invocations.
  - Strong typing, no any, and safe error messages without leaking secret values.
*/

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export class ConfigError extends Error {
  readonly code = 'CONFIG_ERROR' as const;
}

export class SecretNotFoundError extends Error {
  readonly code = 'SECRET_NOT_FOUND' as const;
}

export class SecretMalformedError extends Error {
  readonly code = 'SECRET_MALFORMED' as const;
}

export interface TelegramSecretsShape {
  webhookSecret: string;
  botToken: string;
  [k: string]: unknown;
}

export interface TelegramSecretsResolved {
  webhookSecret: string;
  botToken: string;
}

let cachedSecrets: TelegramSecretsResolved | undefined;
let inFlight: Promise<TelegramSecretsResolved> | undefined;

function parseSecretString(secretString: string): TelegramSecretsResolved {
  try {
    const parsed = JSON.parse(secretString) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new SecretMalformedError('Secret JSON is not an object');
    }
    const shape = parsed as TelegramSecretsShape;
    const webhookSecret = typeof shape.webhookSecret === 'string' ? shape.webhookSecret.trim() : '';
    const botToken = typeof shape.botToken === 'string' ? shape.botToken.trim() : '';
    if (webhookSecret.length === 0) {
      throw new SecretMalformedError('webhookSecret missing or empty');
    }
    if (botToken.length === 0) {
      throw new SecretMalformedError('botToken missing or empty');
    }
    return { webhookSecret, botToken };
  } catch (e) {
    if (e instanceof SecretMalformedError) {
      throw e;
    }
    throw new SecretMalformedError('Failed to parse secret JSON');
  }
}

export function isProduction(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

export async function getTelegramSecrets(
  client?: SecretsManagerClient
): Promise<TelegramSecretsResolved> {
  if (cachedSecrets) {
    return cachedSecrets;
  }
  if (inFlight) {
    return inFlight;
  }

  const exec = async (): Promise<TelegramSecretsResolved> => {
    const arn = process.env.TELEGRAM_SECRET_ARN;
    const fallbackWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;
    const fallbackToken = process.env.TELEGRAM_BOT_TOKEN;

    if (arn && arn.trim().length > 0) {
      const sm = client ?? new SecretsManagerClient({});
      const cmd = new GetSecretValueCommand({ SecretId: arn });
      const resp = await sm.send(cmd);
      const secretString = resp.SecretString;
      if (!secretString) {
        throw new SecretNotFoundError('SecretString is empty');
      }
      const resolved = parseSecretString(secretString);
      cachedSecrets = resolved;
      return resolved;
    }

    // Local fallbacks
    if (
      fallbackWebhook &&
      fallbackWebhook.trim().length > 0 &&
      fallbackToken &&
      fallbackToken.trim().length > 0
    ) {
      const resolved: TelegramSecretsResolved = {
        webhookSecret: fallbackWebhook,
        botToken: fallbackToken,
      };
      cachedSecrets = resolved;
      return resolved;
    }

    // Neither ARN nor both fallbacks present
    if (isProduction()) {
      throw new ConfigError('TELEGRAM_SECRET_ARN is required in production');
    }
    throw new SecretNotFoundError('Telegram secrets not fully configured');
  };

  inFlight = exec().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

export async function getTelegramWebhookSecret(client?: SecretsManagerClient): Promise<string> {
  const s = await getTelegramSecrets(client);
  return s.webhookSecret;
}

export async function getTelegramBotToken(client?: SecretsManagerClient): Promise<string> {
  const s = await getTelegramSecrets(client);
  return s.botToken;
}

export function clearTelegramSecretCache(): void {
  cachedSecrets = undefined;
  inFlight = undefined;
}

export function hasConfiguredSecretEnv(): boolean {
  const arn = process.env.TELEGRAM_SECRET_ARN;
  const fallbackWebhook = process.env.TELEGRAM_WEBHOOK_SECRET;
  const fallbackToken = process.env.TELEGRAM_BOT_TOKEN;
  return (
    Boolean(arn && arn.trim()) ||
    (Boolean(fallbackWebhook && fallbackWebhook.trim()) &&
      Boolean(fallbackToken && fallbackToken.trim()))
  );
}
