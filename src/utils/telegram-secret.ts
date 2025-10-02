/*
  Secret retrieval utility for Telegram webhook secret.
  - Reads TELEGRAM_WEBHOOK_SECRET_ARN when provided and fetches from AWS Secrets Manager.
  - Fallback: TELEGRAM_WEBHOOK_SECRET plaintext env var (local dev only).
  - Caches the resolved secret for warm Lambda invocations.
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

export interface TelegramSecretJsonShape {
  webhookSecret: string;
  [k: string]: unknown;
}

let cachedSecret: string | undefined;
let inFlight: Promise<string> | undefined;

function parseSecretString(secretString: string): string {
  try {
    const parsed = JSON.parse(secretString) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      throw new SecretMalformedError('Secret JSON is not an object');
    }
    const val = (parsed as TelegramSecretJsonShape).webhookSecret;
    if (typeof val !== 'string' || val.trim().length === 0) {
      throw new SecretMalformedError('webhookSecret missing or empty');
    }
    return val;
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

export async function getTelegramWebhookSecret(client?: SecretsManagerClient): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }
  if (inFlight) {
    return inFlight;
  }

  const exec = async (): Promise<string> => {
    const arn = process.env.TELEGRAM_WEBHOOK_SECRET_ARN;
    const fallback = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (arn && arn.trim().length > 0) {
      const sm = client ?? new SecretsManagerClient({});
      const cmd = new GetSecretValueCommand({ SecretId: arn });
      const resp = await sm.send(cmd);
      const secretString = resp.SecretString;
      if (!secretString) {
        throw new SecretNotFoundError('SecretString is empty');
      }
      const resolved = parseSecretString(secretString);
      cachedSecret = resolved;
      return resolved;
    }

    if (fallback && fallback.trim().length > 0) {
      cachedSecret = fallback;
      return fallback;
    }

    // Neither ARN nor fallback present
    if (isProduction()) {
      throw new ConfigError('TELEGRAM_WEBHOOK_SECRET_ARN is required in production');
    }
    throw new SecretNotFoundError('Webhook secret not configured');
  };

  inFlight = exec().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

export function clearTelegramWebhookSecretCache(): void {
  cachedSecret = undefined;
  inFlight = undefined;
}

export function hasConfiguredSecretEnv(): boolean {
  const arn = process.env.TELEGRAM_WEBHOOK_SECRET_ARN;
  const fallback = process.env.TELEGRAM_WEBHOOK_SECRET;
  return Boolean(arn && arn.trim()) || Boolean(fallback && fallback.trim());
}
