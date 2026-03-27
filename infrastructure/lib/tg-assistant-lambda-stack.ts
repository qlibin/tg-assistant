import * as path from 'path';
import { fileURLToPath } from 'url';
import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  HttpApi,
  HttpMethod,
  HttpRoute,
  HttpRouteKey,
  PayloadFormatVersion,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface TgAssistantLambdaStackProps extends StackProps {
  environmentName: string;
  webhookLambdaName: string;
  feedbackLambdaName: string;
  tags?: Record<string, string>;
}

export class TgAssistantLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: TgAssistantLambdaStackProps) {
    super(scope, id, props);

    const { environmentName, webhookLambdaName, feedbackLambdaName } = props;

    // Execution role for Lambda (least privilege: basic execution role)
    const webhookExecRole = new iam.Role(this, 'WebhookLambdaExecutionRole', {
      roleName: `telegram-webhook-lambda-role-${environmentName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Lambda to write logs',
    });

    webhookExecRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Choose code source: use pre-built ZIP when provided by CI, otherwise fallback to local asset
    // We use a stable path to avoid 'fromInline' vs 'fromAsset' structural noise in diffs.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const webhookZipPath =
      process.env.LAMBDA_WEBHOOK_ZIP_PATH || path.join(__dirname, '../test/fixtures');
    const feedbackZipPath =
      process.env.LAMBDA_FEEDBACK_ZIP_PATH || path.join(__dirname, '../test/fixtures');
    const webhookCode = lambda.Code.fromAsset(webhookZipPath);
    const feedbackCode = lambda.Code.fromAsset(feedbackZipPath);
    const handler = 'index.handler';

    // Create or reference the unified Telegram secrets per environment
    const secretName = `/tg-assistant/telegram-secrets/${environmentName}`;
    const telegramWebhookSecret = new secretsmanager.Secret(this, 'TelegramWebhookSecret', {
      secretName,
      description:
        'Telegram webhook secret and bot token used for webhook validation and API calls',
      generateSecretString: {
        // Placeholder; actual values should be updated out-of-band as per runbook
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'placeholder',
        passwordLength: 16,
        excludePunctuation: true,
      },
    });

    const webhookFn = new lambda.Function(this, 'WebhookFunction', {
      functionName: webhookLambdaName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(300),
      role: webhookExecRole,
      code: webhookCode,
      handler,
      environment: {
        NODE_ENV: 'production',
        TELEGRAM_SECRET_ARN: telegramWebhookSecret.secretArn,
        ENVIRONMENT: environmentName,
      },
      logGroup: new logs.LogGroup(this, 'WebhookFunctionLogGroup', {
        logGroupName: `/aws/lambda/${webhookLambdaName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // Grant Lambda permission to read the secret value
    telegramWebhookSecret.grantRead(webhookFn);

    // Import shared HTTP API v2 by ID from SSM (provisioned by tg-assistant-infra)
    const apiId = StringParameter.valueForStringParameter(
      this,
      `/automation/${environmentName}/api-gateway/id`
    );

    const sharedApi = HttpApi.fromHttpApiAttributes(this, 'SharedHttpApi', {
      httpApiId: apiId,
    });

    // Lambda integration with v1.0 payload format for backward compatibility
    const webhookIntegration = new HttpLambdaIntegration('WebhookIntegration', webhookFn, {
      payloadFormatVersion: PayloadFormatVersion.VERSION_1_0,
    });

    // POST /webhook route on the shared API (auto-deployed by HTTP API v2)
    // HttpLambdaIntegration auto-creates a scoped Lambda invoke permission
    new HttpRoute(this, 'WebhookRoute', {
      httpApi: sharedApi,
      routeKey: HttpRouteKey.with('/webhook', HttpMethod.POST),
      integration: webhookIntegration,
    });

    // ── Feedback Lambda ──────────────────────────────────────────────────

    const feedbackExecRole = new iam.Role(this, 'FeedbackLambdaExecutionRole', {
      roleName: `telegram-feedback-lambda-role-${environmentName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Feedback Lambda to write logs',
    });

    feedbackExecRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    const feedbackFn = new lambda.Function(this, 'FeedbackFunction', {
      functionName: feedbackLambdaName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(300),
      role: feedbackExecRole,
      code: feedbackCode,
      handler,
      environment: {
        NODE_ENV: 'production',
        TELEGRAM_SECRET_ARN: telegramWebhookSecret.secretArn,
        ENVIRONMENT: environmentName,
      },
      logGroup: new logs.LogGroup(this, 'FeedbackFunctionLogGroup', {
        logGroupName: `/aws/lambda/${feedbackLambdaName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    telegramWebhookSecret.grantRead(feedbackFn);

    // Import Result Queue from SSM (provisioned by tg-assistant-infra)
    const resultQueueArn = StringParameter.valueForStringParameter(
      this,
      `/automation/${environmentName}/sqs/result-queue/arn`
    );

    const resultQueue = sqs.Queue.fromQueueArn(this, 'ResultQueue', resultQueueArn);

    feedbackFn.addEventSource(new SqsEventSource(resultQueue));

    // ── Outputs ─────────────────────────────────────────────────────────

    new CfnOutput(this, 'WebhookFunctionName', { value: webhookFn.functionName });
    new CfnOutput(this, 'WebhookFunctionArn', { value: webhookFn.functionArn });
    new CfnOutput(this, 'LambdaRegion', { value: Stack.of(this).region });
    new CfnOutput(this, 'ApiGatewayId', { value: apiId });
    new CfnOutput(this, 'TelegramWebhookSecretArn', { value: telegramWebhookSecret.secretArn });
    new CfnOutput(this, 'FeedbackFunctionName', { value: feedbackFn.functionName });
    new CfnOutput(this, 'FeedbackFunctionArn', { value: feedbackFn.functionArn });
  }
}
