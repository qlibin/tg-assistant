# Task 3: SQS Order Queue Integration for tg-assistant

## Summary

Integrate tg-assistant's webhook Lambda with the Order Queue provisioned by tg-assistant-infra. This involves two parts:
1. **Infrastructure**: Configure the CDK stack to use the shared webhook IAM role and grant SQS/KMS permissions
2. **Application**: Create a module that can publish OrderMessage to the Order Queue

## Context

`tg-assistant-infra` provisions a dual-queue SQS architecture with pre-configured IAM roles. The **webhook role** (`tg-assistant-{env}-webhook-role`) is specifically designed for the webhook Lambda, granting:
- `sqs:SendMessage`, `sqs:GetQueueAttributes`, `sqs:GetQueueUrl` on the Order Queue
- `kms:Decrypt`, `kms:GenerateDataKey` on the shared KMS encryption key

All integration values are exported to SSM Parameter Store under `/automation/{env}/...`.

Reference: [`tg-assistant-infra/docs/sqs-integration-guide.md`](https://github.com/qlibin/tg-assistant-infra/blob/main/docs/sqs-integration-guide.md)

## Part 1: Infrastructure Changes

### 1.1 Switch to Shared Webhook Role (or Extend Current Role)

**Current state**: tg-assistant creates its own execution role:
```typescript
const execRole = new iam.Role(this, 'LambdaExecutionRole', {
  roleName: `telegram-webhook-lambda-role-${environmentName}`,
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
});
execRole.addManagedPolicy(
  iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
);
```

**Two approaches**:

#### Option A: Import the shared webhook role from SSM (recommended)
Replace the self-created role with the one from tg-assistant-infra:
```typescript
import { StringParameter } from 'aws-cdk-lib/aws-ssm';

const webhookRoleArn = StringParameter.valueForStringParameter(
  this,
  `/automation/${environmentName}/roles/webhook/arn`,
);
const execRole = iam.Role.fromRoleArn(this, 'ImportedWebhookRole', webhookRoleArn);
```

**Problem**: The imported role may not have `AWSLambdaBasicExecutionRole` (CloudWatch Logs). The shared role in tg-assistant-infra only has SQS + KMS permissions. The webhook role needs **both** Lambda basic execution AND SQS permissions.

**Solution**: Either:
- Update tg-assistant-infra to add `AWSLambdaBasicExecutionRole` to the webhook role
- Or add SQS/KMS permissions as inline policies on the current self-managed role

#### Option B: Keep current role, add SQS permissions (simpler, no cross-repo dependency)
Keep the existing Lambda execution role and add SQS + KMS inline policies:
```typescript
// Import queue ARN and KMS key ARN from SSM
const orderQueueArn = StringParameter.valueForStringParameter(
  this,
  `/automation/${environmentName}/queues/order/arn`,
);

execRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
  resources: [orderQueueArn],
}));

// KMS permissions for encrypted queue
// Note: KMS key ARN would need to be exported from tg-assistant-infra too
execRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
  resources: ['*'], // Scope to specific key ARN when available
}));
```

### 1.2 Add SSM Read Permission

The Lambda needs to read SSM parameters at runtime to discover the queue URL:
```typescript
execRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['ssm:GetParameter'],
  resources: [
    `arn:aws:ssm:${this.region}:${this.account}:parameter/automation/${environmentName}/queues/order/url`,
  ],
}));
```

### 1.3 Add ENVIRONMENT Variable to Lambda

```typescript
environment: {
  NODE_ENV: 'production',
  TELEGRAM_SECRET_ARN: telegramWebhookSecret.secretArn,
  ENVIRONMENT: environmentName,  // NEW
},
```

### 1.4 Add @aws-sdk/client-sqs Dependency

```bash
npm install @aws-sdk/client-sqs @aws-sdk/client-ssm
```

Note: `@aws-sdk/client-ssm` may be needed for runtime SSM lookups. Alternatively, resolve the queue URL at CDK synth time and pass it as an environment variable (simpler, avoids runtime SSM calls):

```typescript
// Alternative: resolve at synth time (no runtime SSM needed)
const orderQueueUrl = StringParameter.valueForStringParameter(
  this,
  `/automation/${environmentName}/queues/order/url`,
);

environment: {
  // ...
  ORDER_QUEUE_URL: orderQueueUrl,  // Resolved at deploy time
},
```

**Trade-off**: Env var approach is simpler but requires redeployment when queue URL changes. SSM runtime approach is more flexible but adds latency on cold starts and requires SSM permissions.

## Part 2: Application Code - Order Queue Publisher Module

### 2.1 New File: `src/services/order-queue.service.ts`

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';

export interface OrderMessage {
  orderId: string;
  taskType:
    | 'playwright-scraping'
    | 'url-monitoring'
    | 'web-automation'
    | 'perplexity-summary'
    | 'content-analysis'
    | 'text-processing'
    | 'scheduled-linkedin'
    | 'scheduled-german'
    | 'system-health';
  payload: {
    url?: string;
    parameters?: Record<string, unknown>;
    configuration?: Record<string, unknown>;
    timeout?: number;
    retryPolicy?: {
      maxRetries?: number;
      backoffMultiplier?: number;
    };
  };
  userId: string;
  timestamp: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  retryCount?: number;
  deduplicationId?: string;
  correlationId?: string;
  schemaVersion?: '1.0.0';
}

export type TaskType = OrderMessage['taskType'];

export interface SendOrderResult {
  messageId: string;
  orderId: string;
}

const sqs = new SQSClient({ region: process.env.AWS_REGION ?? 'eu-central-1' });

export class OrderQueueService {
  private readonly queueUrl: string;

  constructor(queueUrl: string) {
    this.queueUrl = queueUrl;
  }

  /**
   * Send an OrderMessage to the Order Queue.
   */
  async sendOrder(params: {
    taskType: TaskType;
    payload: OrderMessage['payload'];
    userId: string;
    priority?: OrderMessage['priority'];
    correlationId?: string;
    deduplicationId?: string;
  }): Promise<SendOrderResult> {
    const orderId = randomUUID();
    const order: OrderMessage = {
      orderId,
      taskType: params.taskType,
      payload: params.payload,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      priority: params.priority ?? 'normal',
      correlationId: params.correlationId ?? orderId,
      schemaVersion: '1.0.0',
    };

    if (params.deduplicationId) {
      order.deduplicationId = params.deduplicationId;
    }

    const { MessageId } = await sqs.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(order),
        MessageAttributes: {
          TaskType: { DataType: 'String', StringValue: order.taskType },
          Priority: { DataType: 'String', StringValue: order.priority ?? 'normal' },
          UserId: { DataType: 'String', StringValue: order.userId },
          CorrelationId: {
            DataType: 'String',
            StringValue: order.correlationId ?? order.orderId,
          },
        },
      }),
    );

    console.log(`Order ${orderId} sent, SQS MessageId: ${MessageId}`);

    return { messageId: MessageId!, orderId };
  }
}
```

### 2.2 Queue URL Resolution

Two strategies:

**Strategy A: Environment variable (recommended for simplicity)**
```typescript
// In handler initialization
const queueUrl = process.env.ORDER_QUEUE_URL;
if (!queueUrl) {
  throw new Error('ORDER_QUEUE_URL environment variable is required');
}
const orderQueue = new OrderQueueService(queueUrl);
```

**Strategy B: SSM runtime lookup with caching**
```typescript
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'eu-central-1' });
let cachedQueueUrl: string | undefined;

async function getOrderQueueUrl(): Promise<string> {
  if (!cachedQueueUrl) {
    const env = process.env.ENVIRONMENT ?? 'dev';
    const { Parameter } = await ssm.send(
      new GetParameterCommand({
        Name: `/automation/${env}/queues/order/url`,
      }),
    );
    cachedQueueUrl = Parameter!.Value!;
  }
  return cachedQueueUrl;
}
```

### 2.3 Handler Integration

The handler (`src/index.ts`) currently echoes messages back. To integrate with the queue, the handler would need to:

1. Parse the Telegram message to determine the task type
2. Create an OrderMessage with appropriate payload
3. Send to Order Queue
4. Acknowledge to the user (e.g., "Task queued, I'll get back to you")

This is a significant behavioral change and should be done incrementally:
- Phase 1: Add the OrderQueueService module and tests (this task)
- Phase 2: Wire it into the handler for specific commands (future task)

### 2.4 Tests: `tests/services/order-queue.service.test.ts`

Test cases:
- Sends message with correct body and attributes
- Generates UUID for orderId
- Sets correlationId to orderId when not provided
- Uses provided correlationId when given
- Sets default priority to 'normal'
- Includes schemaVersion '1.0.0'
- Handles SQS errors gracefully
- Sets deduplicationId only when provided

## Dependency Tree

```
tg-assistant-infra (must be deployed first)
  └── SSM: /automation/{env}/queues/order/url
  └── SSM: /automation/{env}/queues/order/arn
  └── SSM: /automation/{env}/roles/webhook/arn
  └── KMS key for queue encryption
        │
        ▼
tg-assistant CDK stack (reads SSM at synth time)
  └── Lambda env var: ORDER_QUEUE_URL (from SSM)
  └── Lambda env var: ENVIRONMENT
  └── IAM: sqs:SendMessage on Order Queue
  └── IAM: kms:Decrypt, kms:GenerateDataKey on KMS key
        │
        ▼
tg-assistant Lambda (runtime)
  └── OrderQueueService.sendOrder()
  └── SQS SendMessage to Order Queue URL
```

## New Dependencies to Install

```bash
npm install @aws-sdk/client-sqs
```

Note: `@aws-sdk/client-ssm` only needed if using runtime SSM lookup strategy.

## Acceptance Criteria

- [ ] Decide on IAM approach: import shared role (Option A) vs extend current role (Option B)
- [ ] Decide on queue URL resolution: env var (Strategy A) vs runtime SSM (Strategy B)
- [ ] Add SQS and KMS permissions to Lambda execution role
- [ ] Add `ENVIRONMENT` env var to Lambda
- [ ] Install `@aws-sdk/client-sqs`
- [ ] Create `src/services/order-queue.service.ts` with OrderMessage types and send logic
- [ ] Create `tests/services/order-queue.service.test.ts` with comprehensive tests
- [ ] Update CDK tests for new IAM policies and environment variables
- [ ] Verify Lambda package includes new dependency (`npm run package:lambda`)

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/services/order-queue.service.ts` | CREATE | OrderQueueService with send logic |
| `src/types/order-message.ts` | CREATE | OrderMessage TypeScript interface (or inline in service) |
| `tests/services/order-queue.service.test.ts` | CREATE | Unit tests |
| `infrastructure/lib/tg-assistant-lambda-stack.ts` | MODIFY | Add SQS/KMS IAM, ENVIRONMENT env var, ORDER_QUEUE_URL env var |
| `infrastructure/test/tg-assistant-lambda-stack.test.ts` | MODIFY | Update tests |
| `package.json` | MODIFY | Add @aws-sdk/client-sqs dependency |

## Future Considerations

- When `@qlibin/tg-assistant-contracts` npm package is published (see tg-assistant-infra recommendation), replace inline OrderMessage type with the shared package
- The KMS key ARN should ideally be exported from tg-assistant-infra to SSM for precise IAM scoping (currently would need `*` or hardcoded ARN)
