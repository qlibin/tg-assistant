/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  clearTelegramWebhookSecretCache,
  ConfigError,
  getTelegramWebhookSecret,
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

describe('telegram-secret util', () => {
  const originalEnv = process.env;
  let mockClient: jest.Mocked<SecretsManagerClient>;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_WEBHOOK_SECRET_ARN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.NODE_ENV;
    clearTelegramWebhookSecretCache();
    // Construct a minimal mocked client with a jest.fn send method
    mockClient = { send: jest.fn() } as unknown as jest.Mocked<SecretsManagerClient>;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('hasConfiguredSecretEnv returns false when neither env var is set', () => {
    // Arrange

    // Act
    const result = hasConfiguredSecretEnv();

    // Assert
    expect(result).toBe(false);
  });

  test('falls back to TELEGRAM_WEBHOOK_SECRET when ARN is not set', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET = 'local-secret';

    // Act
    const secret = await getTelegramWebhookSecret(mockClient);

    // Assert
    expect(secret).toBe('local-secret');
    expect((mockClient.send as unknown as jest.Mock).mock.calls.length).toBe(0);
  });

  test('requires TELEGRAM_WEBHOOK_SECRET_ARN in production if no fallback', async () => {
    // Arrange
    process.env.NODE_ENV = 'production';

    // Act / Assert
    await expect(getTelegramWebhookSecret(mockClient)).rejects.toBeInstanceOf(ConfigError);
  });

  test('reads secret from Secrets Manager when ARN is set and caches it', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';

    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({ webhookSecret: 'from-sm' }) });

    // Act
    const first = await getTelegramWebhookSecret(mockClient);
    const second = await getTelegramWebhookSecret(mockClient);

    // Assert
    expect(first).toBe('from-sm');
    expect(second).toBe('from-sm');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCallArg = (GetSecretValueCommand as unknown as jest.Mock).mock.calls[0][0];
    expect(firstCallArg).toEqual({ SecretId: process.env.TELEGRAM_WEBHOOK_SECRET_ARN });
  });

  test('throws SecretNotFoundError when SecretString is empty', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: undefined });

    // Act / Assert
    await expect(getTelegramWebhookSecret(mockClient)).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  test('throws SecretMalformedError when secret JSON is malformed', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: '{ not-json' });

    // Act / Assert
    await expect(getTelegramWebhookSecret(mockClient)).rejects.toBeInstanceOf(SecretMalformedError);
  });

  test('throws SecretMalformedError when webhookSecret key is missing or empty', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;
    sendMock.mockResolvedValueOnce({ SecretString: JSON.stringify({}) });

    // Act / Assert
    await expect(getTelegramWebhookSecret(mockClient)).rejects.toBeInstanceOf(SecretMalformedError);
  });

  test('throws SecretNotFoundError in non-production when neither ARN nor fallback is set', async () => {
    // Arrange: no env vars and not production

    // Act / Assert
    await expect(getTelegramWebhookSecret(mockClient)).rejects.toBeInstanceOf(SecretNotFoundError);
  });

  test('cache works for fallback env and avoids AWS client usage', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET = 'local-secret';

    // Act
    const first = await getTelegramWebhookSecret(mockClient);
    // Remove env to ensure second call still returns from cache
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    const second = await getTelegramWebhookSecret(mockClient);

    // Assert
    expect(first).toBe('local-secret');
    expect(second).toBe('local-secret');
    // Ensure the AWS client was not invoked
    expect((mockClient.send as unknown as jest.Mock).mock.calls.length).toBe(0);
  });

  test('in-flight concurrency is deduplicated for ARN path', async () => {
    // Arrange
    process.env.TELEGRAM_WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:abc';
    const sendMock = mockClient.send as unknown as jest.Mock;

    let resolveFn: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
      resolveFn = resolve;
    });

    sendMock.mockImplementationOnce(async () => {
      await gate; // block until we resolve
      return { SecretString: JSON.stringify({ webhookSecret: 'from-sm-concurrent' }) };
    });

    // Act: fire two requests without awaiting the first immediately
    const p1 = getTelegramWebhookSecret(mockClient);
    const p2 = getTelegramWebhookSecret(mockClient);
    resolveFn?.();
    const [s1, s2] = await Promise.all([p1, p2]);

    // Assert
    expect(s1).toBe('from-sm-concurrent');
    expect(s2).toBe('from-sm-concurrent');
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
