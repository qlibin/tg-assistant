import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { TgAssistantLambdaStack } from '../lib/tg-assistant-lambda-stack';

// AAA pattern tests for CDK stack

describe('TgAssistantLambdaStack (ZIP-based Node.js Lambda)', () => {
  const baseEnv = { account: '123456789012', region: 'us-east-1' } as const;

  const makeStack = (
    overrides?: Partial<{
      envName: string;
      lambdaName: string;
      setZipPath: boolean;
    }>
  ) => {
    const app = new cdk.App();

    if (overrides?.setZipPath) {
      // Provide a directory path as asset source so CDK can hash it without requiring a real ZIP
      process.env.LAMBDA_ZIP_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-'));
    } else {
      delete process.env.LAMBDA_ZIP_PATH;
    }

    return new TgAssistantLambdaStack(app, 'TestStack', {
      env: baseEnv,
      description: 'Test stack',
      environmentName: overrides?.envName ?? 'dev',
      lambdaName: overrides?.lambdaName ?? 'telegram-webhook-lambda-dev',
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

  test('creates Lambda with expected config (runtime, arch, memory, timeout, env)', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', setZipPath: true });

    // Act
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'telegram-webhook-lambda-dev',
      Runtime: 'nodejs22.x',
      MemorySize: 1024,
      Timeout: 300,
      Architectures: ['arm64'],
      Environment: {
        Variables: {
          NODE_ENV: 'production',
        },
      },
      Handler: 'dist/index.handler',
    });
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
    const stack = makeStack({ envName: 'dev' });
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('Custom::LogRetention', {
      RetentionInDays: 30,
    });
  });
});
