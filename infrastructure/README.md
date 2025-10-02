# TG Assistant Infrastructure (CDK v2)

This package provisions the Lambda function for the Telegram webhook and supports adding an invoke permission for an EXTERNALLY managed API Gateway (REST or HTTP API). No API Gateway resources are created here.

## Parameters via CDK Context

You can optionally grant API Gateway permission to invoke the Lambda by passing a single context parameter with the full SourceArn at synth/deploy time. If not provided, no permission is created (least-privilege default) and a synth warning is emitted.

Context key:
- apiGatewaySourceArn: full ARN string used as the SourceArn in Lambda permission.

Common SourceArn formats:
- REST API: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{method}/{resourcePath}
- HTTP API: arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/*

### Examples

REST example:

```
cd infrastructure
npm ci
npm run build
npx cdk synth -c apiGatewaySourceArn=arn:aws:execute-api:eu-central-1:111122223333:abc123/prod/POST/qlibin-assistant-listener
npx cdk deploy -c apiGatewaySourceArn=arn:aws:execute-api:eu-central-1:111122223333:abc123/prod/POST/qlibin-assistant-listener
```

HTTP API example:

```
cd infrastructure
npx cdk deploy -c apiGatewaySourceArn=arn:aws:execute-api:eu-central-1:111122223333:abc123/beta/*
```

## Stack Outputs

On deploy, the stack exports:
- FunctionName
- FunctionArn
- LambdaRegion
- TelegramWebhookSecretArn
- ApiGatewaySourceArn (only when permission is created)

Share these with the external API Gateway team to configure integration (Lambda Proxy Integration).

## Notes
- Runtime/arch are kept as configured (Node.js 22.x, arm64).
- No changes to timeouts/memory/env are made as part of the API permission feature.
- Invocation permission is implemented via Lambda resource policy (CfnPermission) with principal apigateway.amazonaws.com.
