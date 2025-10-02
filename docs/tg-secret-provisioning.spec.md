# Telegram Webhook and Bot Token Secret Management Specification

## Goal
- Provision both Telegram webhook secret and bot token stored in AWS Secrets Manager to the Lambda as environment variables at deploy time, without committing secrets to the repo.

## Scope
- Changes in infrastructure (CDK) to create/read a secret containing both webhook secret and bot token, and pass references to the Lambda.
- Changes in application (root project) to read the secrets from process.env and validate them.
- CI/CD updates to ensure secret values are injected during deployment using OIDC (no long-lived secrets).

## Constraints
- No plaintext secrets in the repository or GitHub variables.
- Prefer referencing Secrets Manager directly from Lambda runtime when possible; if injecting as env var, ensure encryption at rest with KMS and restricted IAM access.

## Secret model
- Secret name: `/tg-assistant/telegram-secrets/<env>`
- Expected JSON shape in Secrets Manager:
  ```json
  {
    "webhookSecret": "<opaque-string>",
    "botToken": "<telegram-bot-token>"
  }
  ```
- KMS: use account default AWS managed key for Secrets Manager unless a customer-managed key exists. Optionally allow key override via CDK context.

## Infrastructure changes (CDK)
- Stack: `tg-assistant-lambda-stack.ts`
- Add resources/changes:
    - **Secrets Manager Secret**
        - Name: `/tg-assistant/telegram-secrets/<envName>`
        - Description: Telegram webhook secret and bot token used for webhook validation and API calls
        - Secret rotation: not required initially
    - **Permissions:**
        - Grant the Lambda execution role permission to read this secret (`secretsmanager:GetSecretValue`, `DescribeSecret`).
    - **Lambda configuration:**
        - Add env var `TELEGRAM_SECRET_ARN` pointing to the secret ARN.
        - Do not place the actual secret values in plaintext environment variables.
    - **Outputs:**
        - Secret ARN
        - Lambda name/ARN
- **Context and naming:**
    - `envName` is provided via `cdk.json` context (dev/test/prod).
    - Secret name/path depends on `envName`.

## Application changes (root project)
- **Env variables:**
    - `TELEGRAM_SECRET_ARN`: string (required in production)
- **Startup validation:**
    - Validate presence of the chosen variable depending on mode.
    - Fail fast with clear error if missing.
- **Secret retrieval:**
    - Fetch secret value at runtime using AWS SDK v3 (`secretsmanager` GetSecretValue), cache result across invocations for warm containers.
    - Parse JSON, read `.webhookSecret` and `.botToken` strings, validate both are non-empty.
    - Fallback behavior for local development:
        - `process.env["TELEGRAM_WEBHOOK_SECRET"]` for webhook secret
        - `process.env["TELEGRAM_BOT_TOKEN"]` for bot token
        - This allows for local development without AWS Secrets Manager.
- **Usage:**
    - Use the webhook secret to validate incoming Telegram webhook requests (HMAC or header/body comparison as per your handler's validation logic).
    - Use the bot token for making API calls to Telegram Bot API.
- **Testing:**
    - Mock AWS SDK in unit tests.
    - Tests for: missing env var, secret not found, malformed JSON, successful retrieval and caching for both secrets.

## CI/CD changes
- **CI (pull_request):** no secret access; just build/lint/test.
- **CD (push to main):**
    - Ensure OIDC role allows:
        - `secretsmanager:CreateSecret/UpdateSecret/PutSecretValue` (if bootstrapping secret)
        - `lambda:UpdateFunctionConfiguration` (if setting env vars), `lambda:UpdateFunctionCode`
    - **Variables:**
        - `ENV_NAME`
        - `LAMBDA_FUNCTION_NAME`
        - `TELEGRAM_SECRET_STRATEGY`: `runtime|inline` (default runtime)
        - `USE_EXISTING_SECRET_ARN` (optional)
    - **Steps:**
        - Package `lambda.zip` (as already configured).
        - Update Lambda configuration:
            - Set `TELEGRAM_SECRET_ARN` and keep other variables unchanged.
        - Deploy code with `update-function-code`.
    - Avoid logging secret values. Redact in echo outputs.

## IAM policies (GitHub Actions role)
- **Required (scope to resource ARNs):**
    - `sts:AssumeRole`
    - `lambda:UpdateFunctionCode`
    - `lambda:GetFunction`
    - `lambda:UpdateFunctionConfiguration`
    - `secretsmanager:DescribeSecret`
    - **Optional for bootstrapping/rotation:**
        - `secretsmanager:CreateSecret`
        - `secretsmanager:UpdateSecret`
        - `secretsmanager:PutSecretValue`
- Trust policy restricted to the repo and main branch.

## Security considerations
- Avoid plaintext secrets in Lambda env config.
- Do not print secret material in logs.
- Use least privilege on Secrets Manager and Lambda resources.
- Consider secret rotation later; wire Lambda to re-fetch when `SECRET_VERSION` changes (env var) or on cold start.

## Acceptance criteria
- CDK stack provisions (or imports) a Secrets Manager secret per environment and grants Lambda read access.
- Lambda receives:
    - `TELEGRAM_SECRET_ARN`
- Application validates presence and successfully reads both webhook secret and bot token from the unified secret (tests included).
- CI passes; CD deploys without exposing secrets in logs.
- Docs updated outlining how to manage the combined secret per environment.
- `npm run validate` in the root project passes.
- `npm run validate` in the `/infrastructure` project passes.

## Operational runbook
- **First-time:**
    - Create/update the secret in Secrets Manager with JSON:
      ```json
      {
        "webhookSecret": "your-webhook-secret-here",
        "botToken": "your-telegram-bot-token-here"
      }
      ```
      under the expected name/path per env, or let CDK create it with a placeholder, then update its value out-of-band.
    - Deploy infrastructure to set permissions and Lambda environment variable.
    - Deploy application code.
- **Rotation/update:**
    - Update secret values via Secrets Manager (can update individual keys or both).
    - New cold starts will read the new values; warm containers can refresh based on TTL if implemented.

## Migration notes
- **Breaking changes from original spec:**
    - Environment variable name changed from `TELEGRAM_WEBHOOK_SECRET_ARN` to `TELEGRAM_SECRET_ARN`
    - Secret path changed from `/tg-assistant/telegram-webhook-secret/<env>` to `/tg-assistant/telegram-secrets/<env>`
    - Secret JSON structure now includes both `webhookSecret` and `botToken` fields
    - Application code needs to handle parsing both values from the unified secret
- **Backward compatibility:**
    - Fallback environment variables still supported for local development:
        - `TELEGRAM_WEBHOOK_SECRET` (unchanged)
        - `TELEGRAM_BOT_TOKEN` (new fallback for bot token)