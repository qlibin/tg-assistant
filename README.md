# tg-assistant

Telegram personal assistant bot running on AWS Lambda, deployed via CDK.

## Workspace Structure

This is an npm workspaces monorepo with three packages:

| Package | Description |
|---------|-------------|
| [`packages/common`](packages/common) | Shared library — TelegramService, types, validation, secret management, SQS schemas |
| [`packages/webhook`](packages/webhook) | Webhook Lambda — receives Telegram updates via API Gateway |
| [`packages/feedback`](packages/feedback) | Feedback Lambda — consumes SQS Result Queue, notifies users via Telegram |
| [`infrastructure/`](infrastructure) | AWS CDK v2 stack provisioning both Lambdas |

## Quick Start

```bash
npm install
npm run validate   # build + lint + format + type-check + test
```

## Packaging

```bash
npm run package:lambda:webhook    # produces lambda-webhook.zip
npm run package:lambda:feedback   # produces lambda-feedback.zip
```

## Deployment

Both Lambdas and infrastructure deploy automatically via GitHub Actions on push to `main`.

Manual CDK deploy:

```bash
cd infrastructure
npm run deploy
```

## Documentation

- **[Architecture](docs/architecture.md)** — system design, request flow, infrastructure ownership, and future plans
- **[CLAUDE.md](CLAUDE.md)** — commands, conventions, and project structure for AI-assisted development

## Related repos

- [tg-assistant-infra](https://github.com/qlibin/tg-assistant-infra) — shared SQS, API Gateway, IAM infrastructure
- [tg-assistant](https://github.com/qlibin/tg-assistant) — webhook + feedback Lambdas
- [tg-assistant-echo](https://github.com/qlibin/tg-assistant-echo) — Canary/echo worker Lambda for end-to-end testing
- [@qlibin/tg-assistant-contracts](https://www.npmjs.com/package/@qlibin/tg-assistant-contracts) — shared message schemas
