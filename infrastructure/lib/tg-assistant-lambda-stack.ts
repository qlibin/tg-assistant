import * as path from 'path';
import { fileURLToPath } from 'url';
import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
  lambdaName: string;
  tags?: Record<string, string>;
}

export class TgAssistantLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: TgAssistantLambdaStackProps) {
    super(scope, id, props);

    const { environmentName, lambdaName } = props;

    // Execution role for Lambda (least privilege: basic execution role)
    const execRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `telegram-webhook-lambda-role-${environmentName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Lambda to write logs',
    });

    execRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Choose code source: use pre-built ZIP when provided by CI, otherwise fallback to local asset
    // We use a stable path to avoid 'fromInline' vs 'fromAsset' structural noise in diffs.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const lambdaZipPath = process.env.LAMBDA_ZIP_PATH || path.join(__dirname, '../test/fixtures');
    const code = lambda.Code.fromAsset(lambdaZipPath);
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

    const fn = new lambda.Function(this, 'Function', {
      functionName: lambdaName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(300),
      role: execRole,
      code,
      handler,
      environment: {
        NODE_ENV: 'production',
        TELEGRAM_SECRET_ARN: telegramWebhookSecret.secretArn,
        ENVIRONMENT: environmentName,
      },
      logGroup: new logs.LogGroup(this, 'FunctionLogGroup', {
        logGroupName: `/aws/lambda/${lambdaName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // Grant Lambda permission to read the secret value
    telegramWebhookSecret.grantRead(fn);

    // Import shared HTTP API v2 by ID from SSM (provisioned by tg-assistant-infra)
    const apiId = StringParameter.valueForStringParameter(
      this,
      `/automation/${environmentName}/api-gateway/id`
    );

    const sharedApi = HttpApi.fromHttpApiAttributes(this, 'SharedHttpApi', {
      httpApiId: apiId,
    });

    // Lambda integration with v1.0 payload format for backward compatibility
    const webhookIntegration = new HttpLambdaIntegration('WebhookIntegration', fn, {
      payloadFormatVersion: PayloadFormatVersion.VERSION_1_0,
    });

    // POST /webhook route on the shared API (auto-deployed by HTTP API v2)
    // HttpLambdaIntegration auto-creates a scoped Lambda invoke permission
    new HttpRoute(this, 'WebhookRoute', {
      httpApi: sharedApi,
      routeKey: HttpRouteKey.with('/webhook', HttpMethod.POST),
      integration: webhookIntegration,
    });

    new CfnOutput(this, 'FunctionName', { value: fn.functionName });
    new CfnOutput(this, 'FunctionArn', { value: fn.functionArn });
    new CfnOutput(this, 'LambdaRegion', { value: Stack.of(this).region });
    new CfnOutput(this, 'ApiGatewayId', { value: apiId });
    new CfnOutput(this, 'TelegramWebhookSecretArn', { value: telegramWebhookSecret.secretArn });
  }
}
