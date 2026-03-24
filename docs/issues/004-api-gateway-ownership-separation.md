# Separating API Gateway Ownership: Solving the Chicken-and-Egg Problem

## Problem Statement (Resolved)

There was a circular deployment dependency between `tg-assistant` and `tg-assistant-infra`:

1. `tg-assistant` creates a Lambda with a specific function name
2. `tg-assistant-infra` creates an API Gateway that routes to that Lambda **by name** → needs Lambda to exist first
3. `tg-assistant` needs the API Gateway source ARN to create the invoke permission → needs API Gateway to exist first

This was resolved by the self-service attachment model described below. The interim workaround (issue #72, SSM + context fallback) was superseded by issue #76, which moved route ownership to the consumer.

## Implemented Model: Self-Service Attachment

### Principle

`tg-assistant-infra` creates shared, generic infrastructure. Individual projects like `tg-assistant` attach themselves to that infrastructure. Infra should not know about specific consumers.

### Ownership Split

**`tg-assistant-infra` owns:**
- The API Gateway resource itself (REST API or HTTP API)
- Stage, domain name, TLS certificates
- Exports identifiers via SSM:
  - `/automation/{env}/api-gateway/id` — API ID
  - `/automation/{env}/api-gateway/root-resource-id` — root resource ID (REST API v1 only)
  - `/automation/{env}/api-gateway/stage-name` — stage name
  - Other exports as needed (URL, domain name, etc.)

**`tg-assistant` owns:**
- The Lambda function
- The specific route on the shared API Gateway (e.g., `POST /webhook`)
- The Lambda integration connecting the route to its function
- The `lambda:InvokeFunction` permission for API Gateway

### How It Works in CDK

`tg-assistant` imports the shared HTTP API v2 by ID from SSM and creates its route. See [CDK Implementation](#cdk-implementation-tg-assistant-attaching-to-shared-http-api-v2) below for the full code.

### Key Property: No Cross-Stack Mutation

This does NOT modify `tg-assistant-infra`'s CloudFormation stack. The route, integration, and permission are CloudFormation resources in `tg-assistant`'s own stack that *reference* the API Gateway. Deleting `tg-assistant`'s stack removes the route but leaves the API Gateway intact. Each stack manages its own resources independently.

### Deployment Order: No More Chicken-and-Egg

```
tg-assistant-infra (deploy first)
    └── Creates API Gateway, exports IDs to SSM
            │
            ▼
tg-assistant (deploy second)
    └── Creates Lambda + attaches route + grants permission
```

Single direction. No cycles. No two-phase deployment.

## Current State

`tg-assistant-infra` uses **HTTP API v2** (`HttpApi` from `aws-cdk-lib/aws-apigatewayv2`), migrated from REST API v1 in qlibin/tg-assistant-infra#39. Key configuration:
- HTTP API v2 with auto-deploy enabled (eliminates deployment coordination for multi-consumer stacks)
- Regional endpoint, custom domain with API mapping
- Stage throttling: 10 req/s rate, 25 burst
- Structured JSON access logging with `$context` variables
- `disableExecuteApiEndpoint: true`
- CloudWatch alarms: 5XX errors and p95 latency with SNS notifications
- SSM exports: API ID, URL, domain name, stage name

`tg-assistant` owns its route on the shared API:
- Imports the HTTP API by ID from SSM (`/automation/{env}/api-gateway/id`)
- Creates `POST /webhook` route with `HttpLambdaIntegration` (payload format 1.0)
- `HttpLambdaIntegration` auto-creates a scoped Lambda invoke permission

## Migration Steps

### Phase 1: Migrate API Gateway to HTTP API v2 (in `tg-assistant-infra`) — DONE

Completed in qlibin/tg-assistant-infra#39.

### Phase 2: Move route ownership to consumers (both repos) — DONE

1. ~~In `tg-assistant`, import the shared HTTP API by ID from SSM~~ — Done (issue #76)
2. ~~Add route (`POST /webhook`), `HttpLambdaIntegration`, and invoke permission to `tg-assistant`'s CDK stack~~ — Done (issue #76)
3. ~~Remove the SSM-based source ARN lookup from issue #72~~ — Done (superseded by #76)
4. ~~Remove Lambda-specific route/integration from `tg-assistant-infra`~~ — Done (qlibin/tg-assistant-infra#40)

### Phase 3: Cleanup — DONE

1. ~~Remove `API_GATEWAY_SOURCE_ARN` GitHub variable~~ — Done
2. ~~Update `tg-assistant-infra` SSM exports (remove source ARN export)~~ — Done
3. ~~Update documentation in both repos~~ — Done

### CDK Implementation: tg-assistant attaching to shared HTTP API v2

> **Note:** `addRoutes()` is only available on the concrete `HttpApi` class, not on `IHttpApi` returned by `fromHttpApiAttributes()`. Use `HttpRoute` constructor directly.

```typescript
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { HttpApi, HttpMethod, HttpRoute, HttpRouteKey, PayloadFormatVersion } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

// Import shared API Gateway from SSM
const apiId = StringParameter.valueForStringParameter(
  this, `/automation/${env}/api-gateway/id`
);

const sharedApi = HttpApi.fromHttpApiAttributes(this, 'SharedHttpApi', { httpApiId: apiId });

// Create integration (owned by this stack, auto-deployed by v2)
const webhookIntegration = new HttpLambdaIntegration('WebhookIntegration', fn, {
  payloadFormatVersion: PayloadFormatVersion.VERSION_1_0,
});

// Create route directly (addRoutes() not available on imported APIs)
new HttpRoute(this, 'WebhookRoute', {
  httpApi: sharedApi,
  routeKey: HttpRouteKey.with('/webhook', HttpMethod.POST),
  integration: webhookIntegration,
});

// Permission — source ARN constructed from API ID
fn.addPermission('ApiGatewayInvoke', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${apiId}/*/*/webhook`,
});
```

## Related

- Issue #72: Initial alignment (SSM lookup for source ARN — superseded by #76)
- Issue #76: Route ownership migration (this document's Phase 2 implementation)
- qlibin/tg-assistant-infra#39: HTTP API v2 migration (Phase 1 — completed)
- qlibin/tg-assistant-infra#40: Remove Lambda-specific route from infra (Phase 2 — pending)
- `docs/issues/002-api-gateway-integration-alignment.md`: Historical analysis of initial state
- `tg-assistant-infra` ApiGatewayStack: `infrastructure/lib/api-gateway-stack.ts`
