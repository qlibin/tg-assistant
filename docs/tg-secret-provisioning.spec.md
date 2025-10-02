Here’s a concise implementation spec to provision the Telegram webhook secret from AWS Secrets Manager into the Lambda’s environment.

tg-secret-provisioning.spec.md — Provision Telegram Webhook Secret from AWS Secrets Manager to Lambda

Goal
- Provision a Telegram webhook secret stored in AWS Secrets Manager to the Lambda as an environment variable at deploy time, without committing secrets to the repo.

Scope
- Changes in infrastructure (CDK) to create/read a secret and pass it to the Lambda.
- Changes in application (root project) to read the secret from process.env and validate it.
- CI/CD updates to ensure secret value is injected during deployment using OIDC (no long-lived secrets).

Constraints
- No plaintext secrets in the repository or GitHub variables.
- Prefer referencing Secrets Manager directly from Lambda runtime when possible; if injecting as env var, ensure encryption at rest with KMS and restricted IAM access.

Secret model
- Secret name: /tg-assistant/telegram-webhook-secret/<env>
- Expected JSON shape in Secrets Manager:
    - { "webhookSecret": "<opaque-string>" }
- KMS: use account default AWS managed key for Secrets Manager unless a customer-managed key exists. Optionally allow key override via CDK context.

Infrastructure changes (CDK)
- Stack: tg-assistant-lambda-stack.ts
- Add resources/changes:
    - Secrets Manager Secret
        - Name: /tg-assistant/telegram-webhook-secret/<envName>
        - Description: Telegram webhook secret used to validate updates
        - Secret rotation: not required initially
    - Permissions:
        - Grant the Lambda execution role permission to read this secret (secretsmanager:GetSecretValue, DescribeSecret).
    - Lambda configuration:
        - Add env var TELEGRAM_WEBHOOK_SECRET_ARN pointing to the secret ARN.
        - Do not place the actual secret value in plaintext environment variables.
    - Outputs:
        - Secret ARN
        - Lambda name/ARN
- Context and naming:
    - envName is provided via cdk.json context (dev/test/prod).
    - Secret name/path depends on envName.

Application changes (root project)
- Env variables:
    - TELEGRAM_WEBHOOK_SECRET_ARN: string (required in production)
- Startup validation:
    - Validate presence of the chosen variable depending on mode.
    - Fail fast with clear error if missing.
- Secret retrieval:
    - Fetch secret value at runtime using AWS SDK v3 (secretsmanager GetSecretValue), cache result across invocations for warm containers.
    - Parse JSON, read .webhookSecret string, validate non-empty.
    - Fallback to a `process.env["TELEGRAM_WEBHOOK_SECRET"]` var if TELEGRAM_WEBHOOK_SECRET_ARN is not set.
        - This will allow for local development without AWS Secrets manager.
- Usage:
    - Use the secret to validate incoming Telegram webhook requests (HMAC or header/body comparison as per your handler’s validation logic).
- Testing:
    - Mock AWS SDK in unit tests.
    - Tests for: missing env var, secret not found, malformed JSON, successful retrieval and caching.

CI/CD changes
- CI (pull_request): no secret access; just build/lint/test.
- CD (push to main):
    - Ensure OIDC role allows:
        - secretsmanager:CreateSecret/UpdateSecret/PutSecretValue (if bootstrapping secret)
        - lambda:UpdateFunctionConfiguration (if setting env vars), lambda:UpdateFunctionCode
    - Variables:
        - ENV_NAME
        - LAMBDA_FUNCTION_NAME
        - TELEGRAM_WEBHOOK_SECRET_STRATEGY: runtime|inline (default runtime)
        - USE_EXISTING_SECRET_ARN (optional)
    - Steps:
        - Package lambda.zip (as already configured).
        - Update Lambda configuration:
            - Set TELEGRAM_WEBHOOK_SECRET_ARN and keep other variables unchanged.
        - Deploy code with update-function-code.
    - Avoid logging secret values. Redact in echo outputs.

IAM policies (GitHub Actions role)
- Required (scope to resource ARNs):
    - sts:AssumeRole
    - lambda:UpdateFunctionCode
    - lambda:GetFunction
    - lambda:UpdateFunctionConfiguration
    - secretsmanager:DescribeSecret
    - Optional for bootstrapping/rotation:
        - secretsmanager:CreateSecret
        - secretsmanager:UpdateSecret
        - secretsmanager:PutSecretValue
- Trust policy restricted to the repo and main branch.

Security considerations
- Avoid plaintext secrets in Lambda env config.
- Do not print secret material in logs.
- Use least privilege on Secrets Manager and Lambda resources.
- Consider secret rotation later; wire Lambda to re-fetch when SECRET_VERSION changes (env var) or on cold start.

Acceptance criteria
- CDK stack provisions (or imports) a Secrets Manager secret per environment and grants Lambda read access.
- Lambda receives:
    - TELEGRAM_WEBHOOK_SECRET_ARN
- Application validates presence and successfully reads the secret (tests included).
- CI passes; CD deploys without exposing secret in logs.
- Docs updated outlining how to manage secrets per environment.
- `npm run validate` in the root project passes.
- `npm run validate` in the /infrastructure project passes.

Operational runbook
- First-time:
    - Create/update the secret in Secrets Manager with JSON: { "webhookSecret": "..." } under the expected name/path per env, or let CDK create it with a placeholder, then update its value out-of-band.
    - Deploy infrastructure to set permissions and Lambda environment variable(s).
    - Deploy application code.
- Rotation/update:
    - Update secret value via Secrets Manager.
    - new cold starts will read the new value; warm containers can refresh based on TTL if implemented.
