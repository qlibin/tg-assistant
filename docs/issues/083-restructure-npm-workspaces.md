# Plan: Restructure into npm Workspaces Monorepo (Issue #83)

## Context

The repo is a single-package Telegram webhook Lambda. Issue #83 calls for restructuring into an npm workspaces monorepo with three packages (`common`, `webhook`, `feedback`) while keeping `infrastructure/` as a separate CDK project. The `packages/` directories exist but only contain stale build artifacts — no source files.

This is too large for a single PR. The plan splits into **4 incremental PRs**, each leaving the repo in a working state.

---

## PR 1: Workspace Scaffolding

**Goal**: Convert root into a workspaces root without moving any code. Existing build/test/lint continue to work unchanged.

1. **Root `package.json`**:
   - Rename `"name"` to `"tg-assistant"`, add `"private": true`
   - Add `"workspaces": ["packages/*"]`
   - Keep all scripts unchanged (they still use root `src/`)

2. **Create `tsconfig.base.json`** at root — extract shared compiler options from current `tsconfig.json` (add `composite: true`, drop unused `experimentalDecorators`/`emitDecoratorMetadata`)

3. **Clean `packages/`** — delete stale dist/coverage/tsbuildinfo artifacts

4. **Create placeholder `package.json`** in each package dir:
   - `@tg-assistant/common`, `@tg-assistant/webhook`, `@tg-assistant/feedback`
   - Minimal: name, version, `"private": true`, `"type": "module"`

5. **Update `.gitignore`** — ensure `packages/*/dist/`, `packages/*/coverage/` patterns covered

6. **Regenerate `package-lock.json`** — `npm install` to pick up workspace resolution

**Verify**: `npm ci && npm run validate` passes with no behavior change.

---

## PR 2: Move Source Code into Packages

**Goal**: Move all source to `packages/common` and `packages/webhook`. Wire up TypeScript project references, per-package Jest/ESLint configs, and lambda packaging.

### Move files

| From | To |
|------|----|
| `src/services/telegram.service.ts` | `packages/common/src/services/telegram.service.ts` |
| `src/types/telegram.ts` | `packages/common/src/types/telegram.ts` |
| `src/utils/http.ts` | `packages/common/src/utils/http.ts` |
| `src/utils/validation.ts` | `packages/common/src/utils/validation.ts` |
| `src/utils/telegram-secret.ts` | `packages/common/src/utils/telegram-secret.ts` |
| `src/index.ts` | `packages/webhook/src/index.ts` |
| `tests/services/telegram.service.test.ts` | `packages/common/tests/services/telegram.service.test.ts` |
| `tests/utils/validation.test.ts` | `packages/common/tests/utils/validation.test.ts` |
| `tests/utils/telegram-secret.test.ts` | `packages/common/tests/utils/telegram-secret.test.ts` |
| `tests/index.test.ts` | `packages/webhook/tests/index.test.ts` |
| `tests/setup.ts` | Both packages' `tests/setup.ts` |

### Create `packages/common/src/index.ts` barrel export

Re-exports all services, types, and utils as the public API.

### Update webhook handler imports

Change `packages/webhook/src/index.ts` to import from `@tg-assistant/common` instead of relative paths.

### Update webhook test mocks

`tests/index.test.ts` currently mocks `../src/services/telegram.service` — change to partial mock of `@tg-assistant/common`.

### Per-package tsconfig

- `packages/common/tsconfig.json` — extends `../../tsconfig.base.json`, outDir `./dist`, rootDir `./src`
- `packages/webhook/tsconfig.json` — same, plus `"references": [{ "path": "../common" }]`
- Root `tsconfig.json` — convert to solution-style: `"files": [], "references": [...]`

### Per-package configs

- `jest.config.cjs` per package (85% coverage threshold). Webhook uses `moduleNameMapper` to resolve `@tg-assistant/common` to common source during tests.
- `eslint.config.js` per package — each has its own `tsconfig.eslint.json` pointing at both `src/` and `tests/`.

### Dependencies

- Move `@aws-sdk/client-secrets-manager` and `zod` to `packages/common/package.json` dependencies
- `@tg-assistant/webhook` depends on `@tg-assistant/common: "*"`
- Keep devDeps (typescript, jest, eslint, prettier, etc.) at root (hoisted)
- Remove `dotenv` (not imported in source)

### Root scripts

Update to workspace-aware:
- `"build": "tsc --build"`
- `"test": "npm test --workspaces"`, etc.
- `"package:lambda:webhook": "npm run package:lambda --workspace=@tg-assistant/webhook"`

### Lambda packaging

> **Superseded by #92**: The original `scripts/package-lambda.js` and `scripts/fix-imports.js` have been replaced with `scripts/bundle-lambda.js` using esbuild. Each lambda is bundled into a single `index.mjs` with `@tg-assistant/common` resolved at build time and `@aws-sdk/*` externalized. No manual dist staging or `npm install` required.

### Delete

- Root `src/`, `tests/`, `jest.config.cjs` (replaced by per-package)

**Verify**: `tsc --build` compiles. `npm test --workspaces` passes. `npm run package:lambda:webhook` produces zip. `npm run validate` passes.

---

## PR 3: Add Feedback Package Stub

**Goal**: Create `packages/feedback` with a minimal SQS handler, SQS types in common, and tests.

1. **`packages/common/src/types/sqs.ts`** — Minimal SQS event types (inline, not `@types/aws-lambda`). Add Zod schemas for `OrderMessage` and `ResultMessage` as stubs matching the contract from `docs/issues/003-sqs-order-queue-integration.md`.

2. **Update `packages/common/src/index.ts`** — re-export SQS types.

3. **`packages/feedback/src/index.ts`** — SQS Lambda handler stub: logs records, imports `ResultMessageSchema` from common, validates each record body.

4. **`packages/feedback/tests/index.test.ts`** — Tests: processes records, handles empty array, validates schema.

5. **Package configs** — `tsconfig.json` (references common), `jest.config.cjs`, `eslint.config.js`, `package.json`.

6. **Update root `tsconfig.json`** references to include feedback.

7. **Add root script**: `"package:lambda:feedback"` — calls `node scripts/bundle-lambda.js feedback`

**Verify**: `tsc --build` compiles all 3 packages. `npm test --workspaces` passes. Both lambda zips produced via `bundle-lambda.js`.

---

## PR 4: Update CI/CD, Infrastructure, and CLAUDE.md

**Goal**: Make CI/CD workspace-aware, add feedback Lambda to CDK stack, update docs.

### CI (`.github/workflows/ci.yml`)

- Replace root lint/test/typecheck with workspace-aware commands
- Infrastructure steps unchanged

### CD (`.github/workflows/cd.yml`)

- `package-zip` job produces two zips via `bundle-lambda.js` (`lambda-webhook.zip`, `lambda-feedback.zip`) and uploads both as artifacts
- `cdk-deploy` job downloads both artifacts, passes `LAMBDA_WEBHOOK_ZIP_PATH` and `LAMBDA_FEEDBACK_ZIP_PATH` env vars

### CDK Stack (`infrastructure/lib/tg-assistant-lambda-stack.ts`)

- Add `feedbackLambdaName` to stack props
- Accept `LAMBDA_WEBHOOK_ZIP_PATH` (rename from `LAMBDA_ZIP_PATH`) and `LAMBDA_FEEDBACK_ZIP_PATH` for code assets
- Create feedback Lambda function (same runtime/arch/memory/timeout, reads same Telegram secret)
- Import Result Queue ARN from SSM (`/automation/{env}/sqs/result-queue/arn`)
- Add `SqsEventSource` on feedback Lambda (using `aws-lambda-event-sources`)
- New IAM role for feedback Lambda with basic execution + SQS consume (auto-granted by `SqsEventSource`)
- New log group for feedback Lambda
- New CfnOutputs for feedback function

### CDK config

- `infrastructure/cdk.json` — add `feedbackLambdaName` per environment
- `infrastructure/bin/tg-assistant-lambda.ts` — pass new prop

### CDK tests

- Update stack props in test, update snapshot (`npm test -- -u`), add assertions for feedback Lambda + SQS event source

### CLAUDE.md

- Update project overview, architecture diagram, common commands, environment variables to reflect workspace structure

### README.md

- Update to describe the workspace structure, package roles, and updated development commands

**Verify**: `npm run validate` passes for all packages. `cd infrastructure && npm run validate` passes. CDK synth produces template with both Lambdas and SQS mapping. CI workflow runs green on PR.

---

## Key Files

| File | PRs | Action |
|------|-----|--------|
| `package.json` | 1,2 | Workspaces, rename, deps, scripts |
| `tsconfig.json` | 1,2 | Base extraction, solution-style |
| `packages/common/src/**` | 2,3 | Services, types, utils, SQS schemas |
| `packages/webhook/src/index.ts` | 2 | Handler with updated imports |
| `packages/feedback/src/index.ts` | 3 | SQS handler stub |
| `infrastructure/lib/tg-assistant-lambda-stack.ts` | 4 | Dual lambda + SQS |
| `.github/workflows/ci.yml` | 4 | Workspace-aware |
| `.github/workflows/cd.yml` | 4 | Dual packaging + deploy |
| `CLAUDE.md` | 4 | Full update |
| `scripts/bundle-lambda.js` | 2 | esbuild bundling script (replaced `package-lambda.js` + `fix-imports.js` in #92) |

---

## Key Design Decisions

1. **TypeScript project references** with `composite: true` and a `tsconfig.base.json` — enables incremental builds via `tsc --build`
2. **ESLint per-package** — each package has its own `eslint.config.js` and `tsconfig.eslint.json` (avoids sharing complexity with flat config)
3. **Jest per-package** — webhook uses `moduleNameMapper` to resolve `@tg-assistant/common` to source during tests
4. **Infrastructure stays outside workspaces** — CDK has its own heavy dependency tree
5. **Lambda packaging** — each lambda package gets its own `package:lambda` script that calls `scripts/bundle-lambda.js`, which uses esbuild to produce a single-file ESM bundle with `@tg-assistant/common` inlined and `@aws-sdk/*` externalized
6. **SQS types inline** — minimal SQS event types defined in common (no `@types/aws-lambda` dependency), consistent with how Telegram/API Gateway types are defined