import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

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
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    new CfnOutput(this, 'FunctionName', { value: fn.functionName });
    new CfnOutput(this, 'FunctionArn', { value: fn.functionArn });
  }
}
