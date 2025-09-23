import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BrowserLambdaStack } from '../lib/browser-lambda-stack';

// AAA pattern tests for CDK stack

describe('BrowserLambdaStack', () => {
  const baseEnv = { account: '123456789012', region: 'us-east-1' } as const;

  const makeStack = (
    overrides?: Partial<{
      envName: string;
      repo: string;
      lambdaName: string;
      imageTag: string;
    }>
  ) => {
    const app = new cdk.App();

    return new BrowserLambdaStack(app, 'TestStack', {
      env: baseEnv,
      description: 'Test stack',
      environmentName: overrides?.envName ?? 'dev',
      ecrRepoName: overrides?.repo ?? 'qlibin/browser-lambda',
      lambdaName: overrides?.lambdaName ?? 'browser-lambda-dev',
      imageTag: overrides?.imageTag ?? 'sha-abc',
      tags: { app: 'browser-lambda', env: overrides?.envName ?? 'dev' },
    });
  };

  test('synthesizes expected CloudFormation template (snapshot)', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', imageTag: 'sha-abc' });

    // Act
    const templateJson = Template.fromStack(stack).toJSON();

    // Assert
    expect(templateJson).toMatchSnapshot();
  });

  test('creates DockerImage Lambda with expected config', () => {
    // Arrange
    const stack = makeStack({ envName: 'dev', imageTag: 'latest' });

    // Act
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'browser-lambda-dev',
      MemorySize: 1024,
      Timeout: 300,
      Architectures: ['arm64'],
      Environment: {
        Variables: {
          NODE_ENV: 'production',
        },
      },
    });
  });

  test('grants least-privilege ECR pull permissions to execution role', () => {
    // Arrange
    const stack = makeStack();
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'ecr:GetAuthorizationToken',
            Resource: '*',
          }),
          Match.objectLike({
            Action: Match.arrayWith([
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
            ]),
          }),
        ]),
      },
    });
  });

  test('configures log retention for 30 days', () => {
    // Arrange
    const stack = makeStack();
    const template = Template.fromStack(stack);

    // Assert
    template.hasResourceProperties('Custom::LogRetention', {
      RetentionInDays: 30,
    });
  });
});
