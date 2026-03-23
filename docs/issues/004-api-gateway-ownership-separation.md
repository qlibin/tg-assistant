# Separating API Gateway Ownership: Solving the Chicken-and-Egg Problem

## Problem Statement

There is a circular deployment dependency between `tg-assistant` and `tg-assistant-infra`:

1. `tg-assistant` creates a Lambda with a specific function name
2. `tg-assistant-infra` creates an API Gateway that routes to that Lambda **by name** → needs Lambda to exist first
3. `tg-assistant` needs the API Gateway source ARN to create the invoke permission → needs API Gateway to exist first

Both repos reference each other. The current workaround (issue #72) uses SSM + context fallback for the Lambda→Infra direction, but `tg-assistant-infra` still hardcodes the Lambda function name (`telegram-webhook-lambda-{env}`), which is tight coupling in the Infra→Lambda direction.

## Proposed Model: Self-Service Attachment

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

`tg-assistant` imports the shared API Gateway by ID from SSM and creates its route:

```typescript
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

// Import shared API Gateway from SSM
const apiId = StringParameter.valueForStringParameter(
  this, `/automation/${env}/api-gateway/id`
);
const rootResourceId = StringParameter.valueForStringParameter(
  this, `/automation/${env}/api-gateway/root-resource-id`
);

const api = RestApi.fromRestApiAttributes(this, 'SharedApi', {
  restApiId: apiId,
  rootResourceId,
});

// Create route + integration (owned by this stack)
const webhookResource = api.root.addResource('webhook');
webhookResource.addMethod('POST', new LambdaIntegration(fn));

// Permission (owned by this stack)
fn.addPermission('ApiGatewayInvoke', {
  principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  sourceArn: api.arnForExecuteApi('POST', '/webhook', stageName),
});
```

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

## The REST API v1 Deployment Problem

With REST API v1, route changes are **inert until a new Deployment resource is created**. This is the main friction point with the self-service model.

### Why It Matters

- `tg-assistant-infra` owns the Stage, which points to a Deployment
- `tg-assistant` adds routes, but they don't go live until a Deployment is created
- If both stacks manage Deployment resources on the same Stage, they conflict (the last one wins)

### Options for REST API v1

1. **Each consumer creates its own Deployment** — simple but can race/conflict if multiple consumers deploy simultaneously. The last deployment wins and includes all routes that exist at that moment.

2. **Separate deploy step in CI** — after CDK deploy, run `aws apigateway create-deployment --rest-api-id $API_ID --stage-name $STAGE`. Explicit but requires CI coordination.

3. **Infra creates a "base" Deployment, consumers trigger redeployment** — similar to option 2 but formalized.

### HTTP API v2 with Auto-Deploy (Recommended)

HTTP API v2 with auto-deploy enabled on the stage **eliminates the deployment problem entirely**. Route changes made via CloudFormation are automatically deployed. No Deployment resource to coordinate.

Additional benefits of HTTP API v2:
- Lower latency and cost compared to REST API v1
- Simpler route model
- Native JWT authorizer support
- Auto-deploy removes all multi-stack coordination concerns

## Current State: HTTP API v2

`tg-assistant-infra` was migrated from REST API v1 to **HTTP API v2** (`HttpApi` from `aws-cdk-lib/aws-apigatewayv2`) in issue qlibin/tg-assistant-infra#39. Key configuration:
- HTTP API v2 with auto-deploy enabled
- Regional endpoint, custom domain with API mapping
- Stage throttling: 10 req/s rate, 25 burst
- Structured JSON access logging with `$context` variables
- `disableExecuteApiEndpoint: true`
- Lambda proxy integration (`AWS_PROXY`, payload format 1.0, 29s timeout)
- CloudWatch alarms: 5XX errors and p95 latency with SNS notifications
- SSM exports: API ID, URL, domain name, stage name, source ARN

## REST API v1 → HTTP API v2: Compatibility Analysis

### What Translates Directly

| Feature | v1 Usage | v2 Equivalent | Effort |
|---------|----------|---------------|--------|
| Custom domain + base path | `DomainName` + `BasePathMapping` | `DomainName` + `defaultDomainMapping` with `mappingKey` | Low |
| Regional endpoint | `EndpointType.REGIONAL` | Default (no config needed) | None |
| Stage throttling | `throttlingRateLimit`/`throttlingBurstLimit` | `throttle.rateLimit`/`throttle.burstLimit` on `HttpStage` | Low |
| `disableExecuteApiEndpoint` | `true` | Same property, same behavior | None |
| Lambda proxy integration | `LambdaIntegration({ proxy: true })` | `HttpLambdaIntegration` (proxy is default) | Low |
| `metricsEnabled` | `true` | `detailedMetricsEnabled: true` on stage | Low |
| SSM exports (API ID, URL) | `restApi.restApiId`, `restApi.url` | `httpApi.apiId`, `httpApi.url` | Low |
| DNS / Route53 alias | `ApiGateway` target | `ApiGatewayv2DomainProperties` target | Low |
| SNS alarm actions | CloudWatch → SNS | Identical (not API Gateway-specific) | None |

### What Needs Rework

| Feature | Issue | Workaround | Effort |
|---------|-------|------------|--------|
| CloudWatch alarm metrics | `HttpApi` has no `metricServerError()`/`metricLatency()` helpers | Construct `cloudwatch.Metric` manually (namespace: `AWS/ApiGateway`, dimension: `ApiId`) | Medium |
| Resource tree routing | `restApi.root.addResource('path')` | Flat route: `httpApi.addRoutes({ path: '/path', methods: [...] })` | Low |
| Lambda event payload | v1 format | Set `payloadFormatVersion: '1.0'` on integration for compatibility, or update Lambda handler for v2 format | Low-Medium |

### What's Not Available in HTTP API v2

| Feature | Impact | Mitigation |
|---------|--------|------------|
| **Execution logging** (`MethodLoggingLevel.INFO`) | Loss of API Gateway internal traces (request/response flow, authorizer output) | Configure rich access logs with `$context` variables (`$context.error.message`, `$context.integrationErrorMessage`, `$context.requestId`, `$context.status`, `$context.responseLatency`). Rely on Lambda-level CloudWatch logs for detailed debugging. |
| `dataTraceEnabled` | Logs full request/response bodies | **Already disabled** (`false`) in current stack — non-issue |
| API keys / usage plans | Per-client throttling | **Not currently used** — non-issue. Would be a blocker if needed later. |
| AWS WAF integration | Rate limiting, IP filtering, bot protection | **Not currently used** — non-issue. Would need Lambda-level implementation if needed later. |
| AWS X-Ray tracing | Distributed tracing | **Not currently used** — can instrument at Lambda level with X-Ray SDK if needed. |

### HTTP API v2 Benefits

| Benefit | Details |
|---------|---------|
| **~71% lower cost** | $1.00 vs $3.50 per million requests |
| **Lower latency** | ~14-16% lower round-trip latency |
| **Auto-deploy** | Route changes via CloudFormation go live automatically — **solves the multi-consumer deployment problem** |
| **Native JWT authorizers** | OIDC/OAuth 2.0 validation without custom Lambda authorizers |
| **Simplified CORS** | Built-in configuration |
| **Multi-level base paths** | Domain mappings support paths like `/v1/api` |

### Recommendation

Migration is **feasible**. The only significant gap is execution logging, but `dataTraceEnabled` is already `false`, so the most verbose features aren't in use. Rich access logs + Lambda-level logging provide adequate observability.

The key win: **auto-deploy eliminates deployment coordination entirely**, making the self-service attachment model work cleanly for multiple consumers.

## Migration Steps

### Phase 1: Migrate API Gateway to HTTP API v2 (in `tg-assistant-infra`) — DONE

Completed in qlibin/tg-assistant-infra#39.

### Phase 2: Move route ownership to consumers (both repos) — IN PROGRESS

1. ~~In `tg-assistant`, import the shared HTTP API by ID from SSM~~ — Done (issue #76)
2. ~~Add route (`POST /webhook`), `HttpLambdaIntegration`, and invoke permission to `tg-assistant`'s CDK stack~~ — Done (issue #76)
3. ~~Remove the SSM-based source ARN lookup from issue #72~~ — Done (superseded by #76)
4. Remove Lambda-specific route/integration from `tg-assistant-infra` — Pending (qlibin/tg-assistant-infra#40)

### Phase 3: Cleanup — PENDING

1. Remove `API_GATEWAY_SOURCE_ARN` GitHub variable (if not already done)
2. Update `tg-assistant-infra` SSM exports (remove source ARN export — consumers construct their own)
3. Update documentation in both repos

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
