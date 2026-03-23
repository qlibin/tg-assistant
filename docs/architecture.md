# System Architecture

## Overview

The Telegram Assistant is a webhook-based bot running on AWS Lambda. It receives Telegram updates via API Gateway, processes them, and responds via the Telegram Bot API.

The project spans two repositories:

| Repository | Purpose |
|---|---|
| `qlibin/tg-assistant` (this repo) | Lambda application code and its CDK stack |
| `qlibin/tg-assistant-infra` | Shared infrastructure: API Gateway, SQS queues, IAM roles, KMS, monitoring |

## Current State

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Telegram    │ POST  │  API Gateway     │       │  Lambda          │
│  Bot API     │──────>│  tg.qlibin.com   │──────>│  telegram-       │
│              │       │  /dev/qlibin-    │       │  webhook-lambda  │
│              │<──────│  assistant-      │<──────│  -dev            │
│  (sendMessage│       │  listener        │       │                  │
│   response)  │       └──────────────────┘       └────────┬─────────┘
└──────────────┘                                           │
                                                           │ GetSecretValue
                                                           ▼
                                                  ┌──────────────────┐
                                                  │ Secrets Manager  │
                                                  │ /tg-assistant/   │
                                                  │ telegram-secrets │
                                                  │ /dev             │
                                                  └──────────────────┘
```

### Request Flow

1. Telegram sends a POST request to `tg.qlibin.com/dev/qlibin-assistant-listener`
2. API Gateway routes the request to the webhook Lambda
3. Lambda validates the update structure and extracts the message
4. Lambda echoes the message back via `TelegramService.sendMessage()` with metadata
5. Bot token and webhook secret are fetched from Secrets Manager (cached in-memory)

### Key Files

| File | Description |
|---|---|
| `src/index.ts` | Lambda handler entry point |
| `src/services/telegram.service.ts` | Telegram Bot API client (`sendMessage`) |
| `src/utils/telegram-secret.ts` | Secrets Manager integration with in-memory caching |
| `src/utils/validation.ts` | Input validation (safe JSON parse, type guards) |
| `src/utils/http.ts` | HTTP response helpers |
| `src/types/telegram.ts` | TypeScript interfaces for Telegram API |
| `infrastructure/lib/tg-assistant-lambda-stack.ts` | CDK stack |

### Infrastructure Ownership

**This repo (`tg-assistant`)** provisions via CDK:
- Lambda function
- IAM execution role
- Secrets Manager secret
- CloudWatch log group
- API Gateway invoke permission (via CDK context parameter)

**Infra repo (`tg-assistant-infra`)** provisions via CDK:
- API Gateway (REST API, custom domain `tg.qlibin.com`, stages, monitoring)
- SQS queues (Order + Result + DLQs)
- IAM queue roles
- KMS encryption key
- CloudWatch alarms
- SNS alert topics

### Cross-Repo Integration

All shared infrastructure references use SSM Parameter Store under `/automation/{env}/...`:

| Parameter Path | Description |
|---|---|
| `/automation/{env}/sqs/order-queue/url` | Order Queue URL |
| `/automation/{env}/sqs/order-queue/arn` | Order Queue ARN |
| `/automation/{env}/sqs/result-queue/url` | Result Queue URL |
| `/automation/{env}/sqs/result-queue/arn` | Result Queue ARN |
| `/automation/{env}/iam/webhook-role/arn` | Webhook Lambda role ARN |
| `/automation/{env}/iam/worker-role/arn` | Worker Lambda role ARN |
| `/automation/{env}/iam/feedback-role/arn` | Feedback Lambda role ARN |
| `/automation/{env}/api-gateway/rest-api-id` | API Gateway REST API ID |
| `/automation/{env}/api-gateway/source-arn` | API Gateway source ARN |
| `/automation/{env}/api-gateway/domain` | Custom domain name |
| `/automation/{env}/monitoring/sns-topic/arn` | Monitoring SNS topic ARN |

### Deployment

Both repos use GitHub Actions CI/CD that deploys via CDK on push to `main`.

## Future State (Event-Driven)

The planned architecture adds SQS-based task processing with worker Lambdas:

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────────┐
│  Telegram    │ POST  │ API Gateway  │       │  Webhook Lambda      │
│  Bot API     │──────>│ tg.qlibin.com│──────>│  (tg-assistant)      │
│              │       └──────────────┘       │                      │
│              │                               │  1. Validate update  │
│              │                               │  2. Parse command    │
│              │                               │  3. Send OrderMessage│
│              │                               │     to Order Queue   │
│              │                               │  4. Ack to user      │
│              │                               └──────────┬───────────┘
│              │                                          │ sqs:SendMessage
│              │                                          ▼
│              │                               ┌──────────────────────┐
│              │                               │    Order Queue       │
│              │                               │    (14d retention)   │
│              │                               └──────────┬───────────┘
│              │                                          │ SQS Event Source
│              │                                          ▼
│              │                               ┌──────────────────────┐
│              │                               │   Worker Lambda(s)   │
│              │                               │   - Playwright       │
│              │                               │   - Perplexity       │
│              │                               │   - Text processing  │
│              │                               └──────────┬───────────┘
│              │                                          │ sqs:SendMessage
│              │                                          ▼
│              │                               ┌──────────────────────┐
│              │                               │    Result Queue      │
│              │                               │    (7d retention)    │
│              │                               └──────────┬───────────┘
│              │                                          │ SQS Event Source
│              │                                          ▼
│              │                               ┌──────────────────────┐
│  sendMessage │<──────────────────────────────│  Feedback Lambda     │
│              │        notify / enhance       │  (tg-assistant)      │
│              │                               │  - Notify user       │
│              │                               │  - Requeue if needed │
│              │                               │  - Escalate          │
└──────────────┘                               └──────────────────────┘
```

### Component Roles

| Component | Repo | IAM Role | Responsibilities |
|---|---|---|---|
| Webhook Lambda | tg-assistant | `tg-assistant-{env}-webhook-role` | Validate update, parse command, create OrderMessage, send to Order Queue, acknowledge to user |
| Worker Lambda(s) | separate repos | `tg-assistant-{env}-worker-role` | Consume from Order Queue, execute task, produce ResultMessage to Result Queue |
| Feedback Lambda | tg-assistant (or separate) | `tg-assistant-{env}-feedback-role` | Consume from Result Queue, notify user via Telegram, requeue on failure, escalate |

### Message Schemas

Defined in `tg-assistant-infra/docs/sqs-integration-guide.md`:

**OrderMessage**: `orderId`, `taskType`, `payload`, `userId`, `timestamp`, `priority`, `correlationId`

**ResultMessage**: `orderId`, `status`, `result`, `processingTime`, `followUpAction`, `userId`

### Task Types

`playwright-scraping`, `url-monitoring`, `web-automation`, `perplexity-summary`, `content-analysis`, `text-processing`, `scheduled-linkedin`, `scheduled-german`, `system-health`

### Error Handling

- Each SQS queue has an associated Dead Letter Queue (DLQ)
- CloudWatch alarms monitor DLQ depth
- SNS alerts notify on failures
