# tg-assistant

Telegram personal assistant bot running on AWS Lambda, deployed via CDK.

## Quick Start

```bash
npm install
npm run validate   # build + lint + format + type-check + test
```

## Deployment

Both the Lambda application and its infrastructure deploy automatically via GitHub Actions on push to `main`.

Manual CDK deploy:

```bash
cd infrastructure
npm run deploy
```

## Documentation

- **[Architecture](docs/architecture.md)** — system design, request flow, infrastructure ownership, and future plans
- **[CLAUDE.md](CLAUDE.md)** — commands, conventions, and project structure for AI-assisted development
