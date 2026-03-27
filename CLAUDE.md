# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram personal assistant bot running on AWS Lambda, structured as an **npm workspaces monorepo**:

| Package | Description |
|---------|-------------|
| `packages/common` | Shared library: TelegramService, types, validation, secret management, SQS schemas |
| `packages/webhook` | Webhook Lambda — receives Telegram updates via API Gateway, parses commands |
| `packages/feedback` | Feedback Lambda — consumes SQS Result Queue, notifies users via Telegram |
| `infrastructure/` | AWS CDK v2 stack provisioning both Lambdas, IAM roles, Secrets Manager, CloudWatch logs |

## Common Commands

### Workspace Root

```bash
npm test                          # Run all workspace tests
npm run build                     # TypeScript project build (tsc --build)
npm run type-check                # TypeScript type checking
npm run lint:fix                  # ESLint auto-fix across all packages
npm run validate                  # Full validation (build + lint + format + type-check + test)
npm run package:lambda:webhook    # Bundle lambda-webhook.zip
npm run package:lambda:feedback   # Bundle lambda-feedback.zip
```

### Infrastructure (infrastructure/)

```bash
cd infrastructure
npm run build               # Compile CDK TypeScript
npm run test                # Run CDK tests (uses --experimental-vm-modules)
npm run synth               # Synthesize CloudFormation template
npm run deploy              # Deploy stack to AWS
npm run diff                # Preview infrastructure changes
npm run validate            # Full validation
```

### CDK Deployment

```bash
cd infrastructure
npx cdk deploy -c environment=dev
```

## Architecture

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────────┐
│  Telegram    │ POST  │ API Gateway  │       │  Webhook Lambda      │
│  Bot API     │──────>│ (HTTP API v2)│──────>│  packages/webhook    │
│              │       └──────────────┘       └──────────┬───────────┘
│              │                                         │
│              │                              ┌──────────▼───────────┐
│              │                              │    Result Queue      │
│              │                              │    (SQS)             │
│              │                              └──────────┬───────────┘
│              │                                         │ SQS Event Source
│              │                              ┌──────────▼───────────┐
│  sendMessage │<─────────────────────────────│  Feedback Lambda     │
│              │                              │  packages/feedback   │
└──────────────┘                              └──────────────────────┘
                                                         │
                                              ┌──────────▼───────────┐
                                              │  Secrets Manager     │
                                              │  (bot token, secret) │
                                              └──────────────────────┘
```

### Key Files

- **Webhook entry**: `packages/webhook/src/index.ts` — Lambda handler
- **Feedback entry**: `packages/feedback/src/index.ts` — Lambda handler
- **Shared services**: `packages/common/src/services/` — TelegramService, etc.
- **Shared types**: `packages/common/src/types/` — Telegram API interfaces, SQS schemas
- **CDK Stack**: `infrastructure/lib/tg-assistant-lambda-stack.ts`

## Key Conventions

### TypeScript
- Strict mode enabled, no `any` types (use `unknown` or proper types)
- ESM modules (`"type": "module"` in all packages)
- Project references via `tsc --build` for cross-package compilation

### Testing
- 85% coverage threshold (statements, functions, lines); 75% for branches
- Snapshot tests: update with `npm test -- -u`, never delete snapshots
- Test files mirror src structure in each package's `tests/`

### Naming
- Variables/functions: camelCase
- Classes/interfaces: PascalCase
- Constants: SCREAMING_SNAKE_CASE
- Files: kebab-case.ts

### Import Order
1. External libraries
2. Internal modules (absolute paths)
3. Relative imports

## Environment

- **TELEGRAM_SECRET_ARN**: ARN of Secrets Manager secret containing `botToken` and `webhookSecret`
- **NODE_ENV**: Set to `production` in Lambda
- **LAMBDA_WEBHOOK_ZIP_PATH**: Path to webhook Lambda ZIP (CI/CD)
- **LAMBDA_FEEDBACK_ZIP_PATH**: Path to feedback Lambda ZIP (CI/CD)
- Local development can use `.env` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` fallbacks
