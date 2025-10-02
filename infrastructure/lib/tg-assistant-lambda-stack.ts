import { Annotations, CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

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

    // Choose code source: use pre-built ZIP when provided by CI, otherwise inline minimal handler to allow synth/tests without filesystem assets
    const lambdaZipPath = process.env.LAMBDA_ZIP_PATH;
    const useInline = !lambdaZipPath;

    const code = useInline
      ? lambda.Code.fromInline(
          'exports.handler = async () => { return { statusCode: 200, body: "ok" }; };'
        )
      : lambda.Code.fromAsset(lambdaZipPath);

    const handler = useInline ? 'index.handler' : 'dist/index.handler';

    // Create or reference the Telegram webhook secret per environment
    const secretName = `/tg-assistant/telegram-webhook-secret/${environmentName}`;
    const telegramWebhookSecret = new secretsmanager.Secret(this, 'TelegramWebhookSecret', {
      secretName,
      description: 'Telegram webhook secret used to validate updates',
      generateSecretString: {
        // Placeholder; value should be updated out-of-band as per runbook
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'webhookSecret',
        passwordLength: 32,
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
        TELEGRAM_WEBHOOK_SECRET_ARN: telegramWebhookSecret.secretArn,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Grant Lambda permission to read the secret value
    telegramWebhookSecret.grantRead(fn);

    // Context parameter for external API Gateway invoke permission (full SourceArn provided)
    const sourceArnRaw = this.node.tryGetContext('apiGatewaySourceArn') as unknown;
    const sourceArn =
      typeof sourceArnRaw === 'string' && sourceArnRaw.trim().length > 0
        ? sourceArnRaw.trim()
        : undefined;

    if (sourceArn) {
      new lambda.CfnPermission(this, 'ApiGatewayInvokePermission', {
        action: 'lambda:InvokeFunction',
        functionName: fn.functionArn,
        principal: 'apigateway.amazonaws.com',
        sourceArn,
      });
    } else {
      Annotations.of(this).addWarning(
        'API Gateway SourceArn not provided. Skipping Lambda invoke permission. Provide context: -c apiGatewaySourceArn=arn:aws:execute-api:...'
      );
    }

    new CfnOutput(this, 'FunctionName', { value: fn.functionName });
    new CfnOutput(this, 'FunctionArn', { value: fn.functionArn });
    new CfnOutput(this, 'LambdaRegion', { value: Stack.of(this).region });
    if (sourceArn) {
      new CfnOutput(this, 'ApiGatewaySourceArn', { value: sourceArn });
    }
    new CfnOutput(this, 'TelegramWebhookSecretArn', { value: telegramWebhookSecret.secretArn });
  }
}
