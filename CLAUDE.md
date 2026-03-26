# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Telegram webhook bot running on AWS Lambda. The project has two modules:
- **Root**: Lambda application code (TypeScript)
- **infrastructure/**: AWS CDK v2 stack that provisions the Lambda, IAM roles, Secrets Manager, and CloudWatch logs

## Common Commands

### Lambda Application (root)

```bash
npm test                    # Run all tests
npm test -- --testNamePattern="pattern"  # Run specific test by name
npm run test:coverage       # Tests with coverage report
npm run build               # TypeScript compile (type-check + declarations)
npm run lint:fix            # ESLint auto-fix
npm run type-check          # TypeScript type checking only
npm run validate            # Full validation (build + lint + format + type-check + test)
npm run package:lambda      # Create lambda-webhook.zip for deployment
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

### CDK Deployment with API Gateway Permission

```bash
npx cdk deploy -c apiGatewaySourceArn=arn:aws:execute-api:REGION:ACCOUNT:API_ID/STAGE/METHOD/PATH
```

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  API Gateway (external)  →  Lambda  →  Telegram Bot API      │
│                                ↓                              │
│                         Secrets Manager                       │
│                    (bot token, webhook secret)                │
└──────────────────────────────────────────────────────────────┘
```

- **Entry point**: `src/index.ts` exports `handler` for Lambda
- **Services**: `src/services/` - Business logic (e.g., `TelegramService` for API calls)
- **Utils**: `src/utils/` - HTTP responses, validation, secret management
- **Types**: `src/types/` - TypeScript interfaces for Telegram API
- **CDK Stack**: `infrastructure/lib/tg-assistant-lambda-stack.ts`

## Key Conventions

### TypeScript
- Strict mode enabled, no `any` types (use `unknown` or proper types)
- ESM modules (`"type": "module"` in package.json)

### Testing
- 85% coverage threshold (statements, functions, lines); 75% for branches
- Snapshot tests: update with `npm test -- -u`, never delete snapshots
- Test files mirror src structure in `tests/`

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
- Local development can use `.env` with `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` fallbacks
