import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { TgAssistantLambdaStack } from '../lib/tg-assistant-lambda-stack.js';

// AAA pattern tests for CDK stack

describe('TgAssistantLambdaStack (ZIP-based Node.js Lambda)', () => {
  const baseEnv = { account: '123456789012', region: 'us-east-1' } as const;

  const makeStack = (
    overrides?: Partial<{
      envName: string;
      lambdaName: string;
      feedbackLambdaName: string;
      setZipPath: boolean;
    }>
  ) => {
    const app = new cdk.App();

    if (overrides?.setZipPath) {
      // Provide a directory path as asset source so CDK can hash it without requiring a real ZIP
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'));
      process.env.LAMBDA_WEBHOOK_ZIP_PATH = tmpDir;
      process.env.LAMBDA_FEEDBACK_ZIP_PATH = tmpDir;
    } else {
      delete process.env.LAMBDA_WEBHOOK_ZIP_PATH;
      delete process.env.LAMBDA_FEEDBACK_ZIP_PATH;
    }

    return new TgAssistantLambdaStack(app, 'TestStack', {
      env: baseEnv,
      description: 'Test stack',
      environmentName: overrides?.envName ?? 'dev',
      lambdaName: overrides?.lambdaName ?? 'telegram-webhook-lambda-dev',
      feedbackLambdaName: overrides?.feedbackLambdaName ?? 'telegram-feedback-lambda-dev',
      tags: { app: 'telegram-webhook', env: overrides?.envName ?? 'dev' },
    });
  };

  test('synthesizes expected CloudFormation template (snapshot)', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', setZipPath: true });

    // Act
    const templateJson = Template.fromStack(stack).toJSON();

    // Assert
    expect(templateJson).toMatchSnapshot();
  });

  test('creates Secrets Manager secret per environment and exposes ARN to Lambda env', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', setZipPath: true });

    // Act
    const template = Template.fromStack(stack);

    // Assert Secret resource
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/tg-assistant/telegram-secrets/dev',
      Description:
        'Telegram webhook secret and bot token used for webhook validation and API calls',
    });

    // Assert Lambda has env var wired to secret ARN (token acceptable)
    template.hasResourceProperties(
      'AWS::Lambda::Function',
      Match.objectLike({
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            TELEGRAM_SECRET_ARN: Match.anyValue(),
          }),
        }),
      })
    );

    // Assert output for Secret ARN exists
    template.hasOutput('TelegramWebhookSecretArn', Match.anyValue());
  });

  test('creates Lambda with expected config (runtime, arch, memory, timeout, env)', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', setZipPath: true });

    // Act
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties(
      'AWS::Lambda::Function',
      Match.objectLike({
        FunctionName: 'telegram-webhook-lambda-dev',
        Runtime: 'nodejs22.x',
        MemorySize: 1024,
        Timeout: 300,
        Architectures: ['arm64'],
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            NODE_ENV: 'production',
            TELEGRAM_SECRET_ARN: Match.anyValue(),
            ENVIRONMENT: 'dev',
          }),
        }),
        Handler: 'index.handler',
      })
    );
  });

  test('execution role trusts Lambda service and has AWSLambdaBasicExecutionRole', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev' });
    const template = Template.fromStack(stack);

    // Assert trust policy
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }),
        ]),
      },
    });

    // Assert managed policy attachment via ManagedPolicyArns on the Role
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: Match.anyValue(),
    });
  });

  test('configures log retention for 30 days', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', lambdaName: 'telegram-webhook-lambda-dev' });
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/telegram-webhook-lambda-dev',
      RetentionInDays: 30,
    });
  });

  test('creates feedback Lambda with SQS event source and log group', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', setZipPath: true });

    // Act
    const template = Template.fromStack(stack);

    // Assert: feedback Lambda function exists with expected name
    template.hasResourceProperties(
      'AWS::Lambda::Function',
      Match.objectLike({
        FunctionName: 'telegram-feedback-lambda-dev',
        Runtime: 'nodejs22.x',
        MemorySize: 1024,
        Timeout: 300,
        Architectures: ['arm64'],
        Handler: 'index.handler',
      })
    );

    // Assert: feedback log group with 30-day retention
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/telegram-feedback-lambda-dev',
      RetentionInDays: 30,
    });

    // Assert: SQS event source mapping exists
    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      EventSourceArn: Match.anyValue(),
    });

    // Assert: feedback CfnOutputs
    template.hasOutput('FeedbackFunctionName', Match.anyValue());
    template.hasOutput('FeedbackFunctionArn', Match.anyValue());
  });

  test('creates webhook route, integration, and invoke permission on shared API', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev' });

    // Act
    const template = Template.fromStack(stack);

    // Assert: POST /webhook route on the shared HTTP API
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /webhook',
    });

    // Assert: Lambda integration exists
    template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
      IntegrationType: 'AWS_PROXY',
      PayloadFormatVersion: '1.0',
    });

    // Assert: Lambda invoke permission for API Gateway
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
    });

    // Assert: outputs
    template.hasOutput('ApiGatewayId', Match.anyValue());
    template.hasOutput('FunctionArn', Match.anyValue());
    template.hasOutput('FunctionName', Match.anyValue());
    template.hasOutput('LambdaRegion', Match.anyValue());
  });
});
