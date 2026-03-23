# Task 2: Align tg-assistant with tg-assistant-infra API Gateway Changes

## Summary

`tg-assistant-infra` now manages the API Gateway as IaC (previously configured manually). Review tg-assistant's CDK stack and CD pipeline to ensure they are properly integrated with the new infra-managed API Gateway, and identify any missing or redundant integration points.

## Context

### Before (manual API Gateway)
- API Gateway was created manually in AWS console
- `tg-assistant` CDK stack accepted `apiGatewaySourceArn` as a CDK context parameter
- The source ARN was stored as a GitHub Actions repository variable (`API_GATEWAY_SOURCE_ARN`)
- The CD pipeline passed it: `npx cdk deploy ... -c apiGatewaySourceArn=${API_GATEWAY_SOURCE_ARN}`

### After (IaC API Gateway in tg-assistant-infra)
- `tg-assistant-infra` now provisions the API Gateway via `ApiGatewayStack`
- The API Gateway stack exports its source ARN to SSM: `/automation/{env}/api-gateway/source-arn`
- Other exports: REST API ID, URL, domain name, stage name
- The API Gateway stack references the Lambda by function name: `telegram-webhook-lambda-{env}`
- The API Gateway creates a `LambdaIntegration` with the Lambda (AWS_PROXY, 29s timeout)

## Analysis: What Needs to Change

### 1. Lambda Invoke Permission (Resource-Based Policy)

**Current state** in `tg-assistant` (`infrastructure/lib/tg-assistant-lambda-stack.ts:81-99`):
```typescript
const sourceArnRaw =
  apiGatewaySourceArn ?? (this.node.tryGetContext('apiGatewaySourceArn') as unknown);
// ... creates CfnPermission if sourceArn is provided
```

**Issue**: The source ARN is passed as a hardcoded CDK context or GitHub variable. Now that tg-assistant-infra exports it to SSM (`/automation/{env}/api-gateway/source-arn`), tg-assistant should read it from SSM at synth time instead of requiring it as a context parameter.

**Recommended change**:
```typescript
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

// Read API Gateway source ARN from SSM (exported by tg-assistant-infra)
const sourceArn = StringParameter.valueForStringParameter(
  this,
  `/automation/${environmentName}/api-gateway/source-arn`,
);

new lambda.CfnPermission(this, 'ApiGatewayInvokePermission', {
  action: 'lambda:InvokeFunction',
  functionName: fn.functionArn,
  principal: 'apigateway.amazonaws.com',
  sourceArn,
});
```

**Trade-off**: This creates a hard dependency on tg-assistant-infra being deployed first. The current context-based approach is more flexible for bootstrapping. Consider supporting both: SSM lookup with context override fallback.

### 2. CD Pipeline: Remove Hardcoded API_GATEWAY_SOURCE_ARN

**Current state** in `.github/workflows/cd.yml`:
```yaml
env:
  API_GATEWAY_SOURCE_ARN: ${{ vars.API_GATEWAY_SOURCE_ARN }}

- name: CDK Deploy
  run: |
    npx cdk deploy --require-approval never \
      -c environment=${ENV_NAME} \
      -c apiGatewaySourceArn=${API_GATEWAY_SOURCE_ARN}
```

**Issue**: Once the CDK stack reads the source ARN from SSM, the GitHub variable and context parameter become unnecessary.

**Recommended change**:
- If SSM approach is adopted: remove the `API_GATEWAY_SOURCE_ARN` variable and context parameter from the deploy command
- If hybrid approach: keep as fallback but document that SSM is the primary source

### 3. CDK Stack Props: Deprecate apiGatewaySourceArn

**Current state** in `TgAssistantLambdaStackProps`:
```typescript
apiGatewaySourceArn?: string | undefined;
```

**Recommended change**:
- Option A (clean break): Remove the prop, always read from SSM
- Option B (gradual migration): Keep prop as override, default to SSM lookup
- Option C (no change, just document): Keep current behavior, document that the value in GitHub vars must match what tg-assistant-infra deploys

### 4. Deployment Order Dependency

**New concern**: With tg-assistant-infra owning the API Gateway, there's now an implicit deployment order:
1. `tg-assistant` must be deployed first (Lambda must exist for API Gateway to reference it)
2. `tg-assistant-infra` deploys next (API Gateway + SQS stacks, exports SSM params)
3. `tg-assistant` may need to redeploy if it reads source ARN from SSM (to pick up the new value)

**This is the chicken-and-egg problem**: API Gateway references Lambda by name, and Lambda needs the API Gateway source ARN for permissions.

**Possible solutions**:
- Accept two-phase deployment: first deploy creates Lambda without API Gateway permission, second deploy adds the permission after infra exports the SSM param
- Use a wildcard source ARN: `arn:aws:execute-api:{region}:{account}:*` (less secure but eliminates the dependency)
- Keep the current context-based approach for initial setup, switch to SSM for steady-state updates

### 5. Missing: ENVIRONMENT Variable for Lambda

**Current state**: The Lambda has `NODE_ENV=production` and `TELEGRAM_SECRET_ARN` as environment variables, but no `ENVIRONMENT` variable (e.g., `dev`, `test`, `prod`).

**Future need**: When the Lambda starts publishing to SQS (Task 3), it will need to know the environment name to look up SSM parameters like `/automation/{env}/queues/order/url`.

**Recommended change**: Add `ENVIRONMENT` to Lambda environment variables:
```typescript
environment: {
  NODE_ENV: 'production',
  TELEGRAM_SECRET_ARN: telegramWebhookSecret.secretArn,
  ENVIRONMENT: environmentName,  // NEW: needed for SSM parameter lookups
},
```

### 6. Redundancy Check: No Conflicts Found

The API Gateway in tg-assistant-infra references the Lambda by function name (`telegram-webhook-lambda-{env}`), which matches what tg-assistant's CDK stack creates. There is no conflict or duplication in resource creation - the API Gateway just creates an integration to an existing Lambda.

## Acceptance Criteria

- [ ] Decide on approach for source ARN resolution (SSM vs context vs hybrid)
- [ ] Update CDK stack to read API Gateway source ARN from SSM (if SSM approach chosen)
- [ ] Update or remove `API_GATEWAY_SOURCE_ARN` from CD pipeline and GitHub variables
- [ ] Add `ENVIRONMENT` env var to Lambda (needed for future SQS integration)
- [ ] Document the deployment order between tg-assistant and tg-assistant-infra
- [ ] Update CDK tests to reflect any changes
- [ ] Verify CI workflow's `cdk diff` still works with the new approach

## Files to Modify

| File | Change |
|------|--------|
| `infrastructure/lib/tg-assistant-lambda-stack.ts` | SSM lookup for source ARN, add ENVIRONMENT env var |
| `infrastructure/bin/tg-assistant-lambda.ts` | Update props if interface changes |
| `.github/workflows/cd.yml` | Remove API_GATEWAY_SOURCE_ARN context parameter (if SSM approach) |
| `.github/workflows/ci.yml` | Verify cdk diff works without the context param |
| `infrastructure/test/tg-assistant-lambda-stack.test.ts` | Update tests for new behavior |

## Deployment Order

Cross-repo deployment follows a two-phase pattern:

### Initial Setup (first time)
1. **Deploy `tg-assistant`** — creates the Lambda function. On first deploy without
   `tg-assistant-infra`, pass the source ARN explicitly:
   `npx cdk deploy -c environment=dev -c apiGatewaySourceArn=arn:aws:execute-api:...`
2. **Deploy `tg-assistant-infra`** — creates the API Gateway with Lambda integration,
   exports source ARN to SSM at `/automation/{env}/api-gateway/source-arn`
3. **Redeploy `tg-assistant`** (without `-c apiGatewaySourceArn`) — picks up the SSM
   value automatically via CloudFormation dynamic reference

### Steady-State Updates
- Either repo can be deployed independently
- `tg-assistant` reads the source ARN from SSM automatically — no manual coordination needed
- To override SSM (e.g., during testing), pass `-c apiGatewaySourceArn=...` as before

### If SSM Parameter Does Not Exist
CloudFormation will fail the deploy with a clear error. This is expected during
bootstrapping — use the context override for the initial deploy.

## Risk Assessment

- **Low risk**: Adding `ENVIRONMENT` env var to Lambda (purely additive)
- **Medium risk**: Changing source ARN resolution from context to SSM (requires tg-assistant-infra deployed first)
- **Mitigation**: Context parameter retained as fallback override for bootstrapping and testing
