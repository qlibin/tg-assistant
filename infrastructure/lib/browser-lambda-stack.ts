import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export interface BrowserLambdaStackProps extends StackProps {
  environmentName: string;
  ecrRepoName: string;
  lambdaName: string;
  imageTag: string; // default provided by app
  tags?: Record<string, string>;
}

export class BrowserLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: BrowserLambdaStackProps) {
    super(scope, id, props);

    const { environmentName, ecrRepoName, lambdaName, imageTag } = props;

    // Lookup existing ECR repository by name (account/region from env)
    const repository = ecr.Repository.fromRepositoryName(this, 'Repository', ecrRepoName);

    // Execution role for Lambda
    const execRole = new iam.Role(this, 'LambdaExecutionRole', {
      roleName: `browser-lambda-role-${environmentName}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for browser-lambda to pull from ECR and write logs',
    });

    execRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );

    // Allow pull from ECR with least privilege
    execRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );
    execRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: [repository.repositoryArn],
      })
    );

    // Image URI with tag
    const imageUri = `${Stack.of(this).account}.dkr.ecr.${Stack.of(this).region}.amazonaws.com/${ecrRepoName}:${imageTag}`;

    const fn = new lambda.DockerImageFunction(this, 'Function', {
      functionName: lambdaName,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: Duration.seconds(300),
      role: execRole,
      code: lambda.DockerImageCode.fromEcr(repository, {
        tagOrDigest: imageTag,
      }),
      environment: {
        NODE_ENV: 'production',
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    new CfnOutput(this, 'FunctionName', { value: fn.functionName });
    new CfnOutput(this, 'FunctionArn', { value: fn.functionArn });
    new CfnOutput(this, 'ImageUri', { value: imageUri });
  }
}
