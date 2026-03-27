# Task 1: Document System Architecture (Current & Future State)

## Summary

Document the architecture of the Telegram Assistant Project, covering both the current state (simple echo bot behind API Gateway) and the planned future state (event-driven microservices with SQS queues).

## Context

The Telegram Assistant Project spans two GitHub repositories:

| Repository | Purpose |
|-----------|---------|
| `qlibin/tg-assistant` | Lambda application: receives Telegram webhook events, processes messages, responds via Telegram Bot API |
| `qlibin/tg-assistant-infra` | Shared infrastructure: API Gateway, SQS queues (Order + Result), IAM roles, KMS encryption, monitoring |

The existing `docs/architecture.md` in tg-assistant contains generic placeholder content (dependency injection, repository pattern examples) that does not reflect the actual system. It needs to be replaced with accurate documentation.

## Current State

### What Exists Today

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

**Lambda behavior**: Receives Telegram Update, validates structure, extracts message text, echoes it back via `TelegramService.sendMessage()` with some Lambda event metadata.

**Infrastructure ownership**:
- `tg-assistant` CDK stack provisions: Lambda, IAM execution role, Secrets Manager secret, CloudWatch log group, API Gateway invoke permission (via context param)
- `tg-assistant-infra` CDK stacks provision: API Gateway (REST API, custom domain, stages, monitoring), SQS queues (Order + Result + DLQs), IAM queue roles, KMS key, CloudWatch alarms, SNS alert topics
- All cross-repo integration uses SSM Parameter Store under `/automation/{env}/...`

**Deployment**:
- `tg-assistant`: GitHub Actions CI/CD deploys Lambda via CDK on push to main
- `tg-assistant-infra`: GitHub Actions CI/CD deploys API Gateway + SQS stacks on push to main

### Key files

| File | Description |
|------|-------------|
| `src/index.ts` | Lambda handler entry point |
| `src/services/telegram.service.ts` | Telegram Bot API client (sendMessage) |
| `src/utils/telegram-secret.ts` | Secrets Manager integration with caching |
| `src/utils/validation.ts` | Input validation (safe JSON parse, type guards) |
| `src/utils/http.ts` | HTTP response helpers |
| `src/types/telegram.ts` | TypeScript interfaces |
| `infrastructure/lib/tg-assistant-lambda-stack.ts` | CDK stack |

## Future State (Planned)

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
|-----------|------|----------|-----------------|
| Webhook Lambda | tg-assistant | `tg-assistant-{env}-webhook-role` | Validate Telegram update, parse user command, create OrderMessage, send to Order Queue, acknowledge to user |
| Worker Lambda(s) | separate repos | `tg-assistant-{env}-worker-role` | Consume from Order Queue, execute task (scraping, AI, etc.), produce ResultMessage to Result Queue |
| Feedback Lambda | tg-assistant (or separate) | `tg-assistant-{env}-feedback-role` | Consume from Result Queue, notify user via Telegram, requeue on failure, escalate |

### Message Schemas

Defined in `tg-assistant-infra/docs/sqs-integration-guide.md`:
- **OrderMessage**: orderId, taskType, payload, userId, timestamp, priority, correlationId
- **ResultMessage**: orderId, status, result, processingTime, followUpAction, userId

Task types: `playwright-scraping`, `url-monitoring`, `web-automation`, `perplexity-summary`, `content-analysis`, `text-processing`, `scheduled-linkedin`, `scheduled-german`, `system-health`

### SSM Parameter Store Integration Points

All shared infrastructure references are in SSM under `/automation/{env}/...`:

- Queue URLs and ARNs
- IAM role ARNs for each Lambda type
- API Gateway details (REST API ID, source ARN, domain)
- Monitoring SNS topic ARN

## Acceptance Criteria

- [ ] Replace `docs/architecture.md` with accurate current-state documentation
- [ ] Include a "Future State" section showing the event-driven architecture
- [ ] Document all integration points between tg-assistant and tg-assistant-infra
- [ ] Include SSM parameter paths used for cross-repo communication
- [ ] Document the message flow: Telegram -> API Gateway -> Lambda -> SQS -> Workers -> SQS -> Feedback -> Telegram
- [ ] List all infrastructure resources and which repo owns them
- [ ] Include deployment pipeline overview for both repos

## Notes

- The current `docs/architecture.md` is placeholder content and should be fully rewritten
- Keep the document concise but complete enough for a new developer to understand the system
- Reference the SQS integration guide in tg-assistant-infra for detailed message schemas
