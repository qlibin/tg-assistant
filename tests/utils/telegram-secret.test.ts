/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  clearTelegramSecretCache,
  ConfigError,
  getTelegramSecrets,
  getTelegramWebhookSecret,
  getTelegramBotToken,
  hasConfiguredSecretEnv,
  SecretMalformedError,
  SecretNotFoundError,
} from '../../src/utils/telegram-secret';

jest.mock('@aws-sdk/client-secrets-manager', () => {
  const actual = jest.requireActual('@aws-sdk/client-secrets-manager');
  return {
    ...actual,
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: jest.fn(),
    })),
    GetSecretValueCommand: jest.fn().mockImplementation(input => ({ input })),
  };
});

describe('telegram-secret util (unified)', () => {
  const originalEnv = process.env;
  let mockClient: jest.Mocked<SecretsManagerClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_SECRET_ARN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.NODE_ENV;
    clearTelegramSecretCache();
    // Construct a minimal mocked client with a jest.fn send method
    mockClient = { send: jest.fn() } as unknown as jest.Mocked<SecretsManagerClient>;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('hasConfiguredSecretEnv returns false when neither env var is set', () => {
    // Act
    const result = hasConfiguredSecretEnv();
    // Assert
    expect(result).toBe(false);
  });

  test('falls back to TELEGRAM_WEBHOOK_SECRET and TELEGRAM_BOT_TOKEN when ARN is not set', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET = 'local-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'local-token';

    // Act
    const secrets = await getTelegramSecrets(mockClient);

    // Assert
    expect(secrets.webhookSecret).toBe('local-secret');
    expect(secrets.botToken).toBe('local-token');
    expect((mockClient.send as unknown as jest.Mock).mock.calls.length).toBe(0);
  });

  test('requires TELEGRAM_SECRET_ARN in production if no fallbacks', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';

    // Act / Assert
    await expect(getTelegramSecrets(mockClient)).rejects.toBeInstanceOf(ConfigError);
  });

  test('reads secret from Secrets Manager when ARN is set and caches it', async () => {
    // Arrange
    process.env.TELEGRAM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';

    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({
      SecretString: JSON.stringify({ webhookSecret: 'from-sm', botToken: 'from-sm-token' }),
    });

    // Act
    const first = await getTelegramSecrets(mockClient);
    const second = await getTelegramSecrets(mockClient);

    // Assert
    expect(first.webhookSecret).toBe('from-sm');
    expect(first.botToken).toBe('from-sm-token');
    expect(second.webhookSecret).toBe('from-sm');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCallArg = (GetSecretValueCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(firstCallArg).toEqual({ SecretId: process.env.TELEGRAM_SECRET_ARN });
  });

  test('throws SecretNotFoundError when SecretString is empty', async () => {
    // Arrange
    process.env.TELEGRAM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: undefined });

    // Act / Assert
    await expect(getTelegramSecrets(mockClient)).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  test('throws SecretMalformedError when secret JSON is malformed', async () => {
    // Arrange
    process.env.TELEGRAM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: '{ not-json' });

    // Act / Assert
    await expect(getTelegramSecrets(mockClient)).rejects.toBeInstanceOf(SecretMalformedError);
  });

  test('throws SecretMalformedError when webhookSecret or botToken is missing/empty', async () => {
    // Arrange
    process.env.TELEGRAM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({ webhookSecret: '' }) });

    // Act / Assert
    await expect(getTelegramSecrets(mockClient)).rejects.toBeInstanceOf(SecretMalformedError);
  });

  test('throws SecretNotFoundError in non-production when neither ARN nor both fallbacks are set', async () => {
    // Act / Assert
    await expect(getTelegramSecrets(mockClient)).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  test('cache works for fallback env and avoids AWS client usage', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET = 'local-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'local-token';

    // Act
    const first = await getTelegramSecrets(mockClient);
    // Remove env to ensure second call still returns from cache
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    const second = await getTelegramSecrets(mockClient);

    // Assert
    expect(first.webhookSecret).toBe('local-secret');
    expect(first.botToken).toBe('local-token');
    expect(second.webhookSecret).toBe('local-secret');
    // Ensure the AWS client was not invoked
    expect((mockClient.send as unknown as jest.Mock).mock.calls.length).toBe(0);
  });

  test('in-flight concurrency is deduplicated for ARN path', async () => {
    // Arrange
    process.env.TELEGRAM_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;

    let resolveFn: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      resolveFn = resolve;
    });

    sendMock.mockImplementationOnce(async () => {
      await gate; // block until we resolve
      return {
        SecretString: JSON.stringify({ webhookSecret: 'from-sm-concurrent', botToken: 't' }),
      };
    });

    // Act: fire two requests without awaiting the first immediately
    const p1 = getTelegramSecrets(mockClient);
    const p2 = getTelegramSecrets(mockClient);
    resolveFn?.();
    const [s1, s2] = await Promise.all([p1, p2]);

    // Assert
    expect(s1.webhookSecret).toBe('from-sm-concurrent');
    expect(s2.webhookSecret).toBe('from-sm-concurrent');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test('getters return individual values', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET = 'local-secret';
    process.env.TELEGRAM_BOT_TOKEN = 'local-token';

    // Act
    const webhook = await getTelegramWebhookSecret(mockClient);
    const token = await getTelegramBotToken(mockClient);

    // Assert
    expect(webhook).toBe('local-secret');
    expect(token).toBe('local-token');
  });
});
