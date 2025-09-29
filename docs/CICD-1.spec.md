
High-level goals
- CI on Pull Requests: build, validate (lint + type-check), test.
- CD on merge to main: build, validate, test, package Lambda into a ZIP archive, upload artifact, and deploy via AWS CDK using S3-backed assets.
- Infrastructure code in /infrastructure as an AWS CDK TypeScript app.
- CDK stack provisions all required AWS resources for the Lambda, including IAM roles, policies, log groups, and permissions.
- Ready for multi-environment extension with naming/tagging conventions, parameterized configuration, and environment-specific contexts.

Architecture overview
- Repository layout
  - Application code in root (src, tests, package.json).
  - Infrastructure code in /infrastructure: a CDK TypeScript app with a Lambda stack that deploys from ZIP code (S3 asset).
- Packaging
  - Lambda packaged as lambda.zip produced from the compiled dist directory and production dependencies.
  - CDK uses AssetCode (S3) to upload and deploy the ZIP.
- IAM and security
  - CDK stack creates a dedicated Lambda execution role with baseline permissions (CloudWatch Logs).
  - GitHub OIDC role in AWS for CI/CD deploy access; short-lived credentials in GitHub Actions (no long-lived secrets).
- Environments
  - Start with env=dev.
  - Use CDK context to pass env settings (account, region, names).
  - Resource naming pattern includes env suffixes where appropriate.
  - Bootstrap once per account/region with cdk bootstrap.

Infrastructure (CDK) specification
- Language/Framework
  - TypeScript CDK app in /infrastructure.
- Files and structure
  - /infrastructure/tsconfig.json
  - /infrastructure/package.json (CDK dependencies and scripts)
  - /infrastructure/bin/<app>.ts (CDK app entrypoint)
  - /infrastructure/lib/<stack>.ts (main stack)
  - /infrastructure/cdk.json (context and app config)
  - Optional: /infrastructure/test/… for CDK assertions (Jest)
- Stack responsibilities
  - Lambda function
    - Runtime: Node.js 18.x
    - Architecture: arm64 (or x86_64 if required by dependencies)
    - Memory: 1024 MB (tune as needed)
    - Timeout: 300 seconds (tune as needed)
    - Code: from S3 asset produced by CDK bundling or a provided lambda.zip artifact path
    - Handler: dist/index.handler (entry exported from src/index.ts)
    - Env vars: NODE_ENV=production (plus future config)
    - Permissions:
      - Create and write logs in CloudWatch.
    - Logging: manage via function logRetention (e.g., 30 days). Do not create a separate LogGroup when logRetention is set.
  - IAM
    - Create a Lambda execution role with:
      - Trust policy for lambda.amazonaws.com.
      - AWSLambdaBasicExecutionRole managed policy.
  - Parameters/config
    - Context-driven configuration: account, region, env name, function name, and base resource naming prefix.
    - Resource naming pattern: <resource>-<env> (e.g., telegram-webhook-lambda-dev).
  - Outputs
    - Function name and ARN.

Example CDK context model
- cdk.json example context
```
json
{
"app": "npx ts-node --esm bin/app.ts",
"context": {
"environments": {
"dev": {
"account": "123456789012",
"region": "us-east-1",
"envName": "dev",
"lambdaName": "telegram-webhook-lambda-dev",
"tags": {
"app": "telegram-webhook",
"env": "dev"
}
},
"test": {
"account": "123456789012",
"region": "us-east-1",
"envName": "test",
"lambdaName": "telegram-webhook-lambda-test",
"tags": {
"app": "telegram-webhook",
"env": "test"
}
},
"prod": {
"account": "123456789012",
"region": "us-east-1",
"envName": "prod",
"lambdaName": "telegram-webhook-lambda",
"tags": {
"app": "telegram-webhook",
"env": "prod"
}
}
},
"defaultEnvironment": "dev"
}
}
```
- bin/app.ts responsibilities
  - Read context environment (default dev).
  - Optionally verify AWS_ACCOUNT_ID env var during deploy matches selected environment.
  - Instantiate stack with env and naming config.

- lib/stack.ts responsibilities
  - Define Nodejs Lambda from ZIP asset or AssetCode to dist directory.
  - Set runtime, memory, timeout, handler, environment.
  - Attach IAM policies and manage logging via logRetention.
  - Export outputs.

GitHub Actions: security and access
- Use GitHub OIDC to assume an AWS role without storing long-lived secrets.
- AWS prerequisites (one-time per account):
  - Configure AWS OIDC Identity Provider (sts.amazonaws.com) for your GitHub Org/Repo.
  - Create IAM Role: GithubActionsDeploymentRole with trust policy allowing your repo and branches (ref:refs/heads/main, pull_request) to assume it.
  - Attach policy allowing:
    - CloudFormation (cdk deploy uses this)
    - S3 (for CDK bootstrap/deploy buckets), Logs, IAM PassRole (scoped to the Lambda role), Lambda, STS AssumeRole
- In GitHub repo:
  - Add environment “dev” for deployment protection rules (optional).
  - Configure aws-actions/configure-aws-credentials with role-to-assume and aws-region.

CI workflow (Pull Request)
- Name: ci.yml
- Triggers: pull_request targeting main
- Jobs:
  - build-validate-test
    - Runs on ubuntu-latest
    - Steps:
      - Checkout
      - Setup Node (project version, e.g., 20.x)
      - Cache npm
      - Install deps: npm ci
      - Type-check: npm run type-check
      - Lint: npm run lint
      - Format check: npm run format:check
      - Test with coverage: npm run test:coverage
    - Artifacts: coverage/lcov-report (optional)

Example workflow (PR)
```
yaml
name: CI

on:
pull_request:
branches: [ "main" ]

jobs:
build-validate-test:
runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run type-check

      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: Test with coverage
        run: npm run test:coverage
```
CD workflow (merge to main)
- Name: cd.yml
- Triggers: push to main
- Environment: dev (initially)
- Jobs:
  1) build-validate-test (same as CI)
  2) package-zip
     - Needs: build-validate-test
     - Steps:
       - npm ci
       - Build
       - Produce lambda.zip (ZIP contains dist and production node_modules)
       - Upload lambda.zip as an artifact for traceability
  3) cdk-deploy
     - Needs: package-zip
     - Steps:
       - Configure AWS creds via OIDC
       - Install infra deps
       - cdk bootstrap (idempotent; optionally conditional)
       - Download lambda.zip artifact
       - Deploy CDK stack; stack should reference local asset (CDK uploads it to S3 automatically)

Example workflow (CD)
```
yaml
name: CD

on:
push:
branches: [ "main" ]

concurrency:
group: lambda-zip-${{ github.ref_name }}
cancel-in-progress: true

env:
AWS_REGION: eu-central-1
ENV_NAME: dev
AWS_ACCOUNT_ID: ${{ vars.AWS_ACCOUNT_ID }}

jobs:
build-validate-test:
runs-on: ubuntu-latest
permissions:
contents: read
steps:
- name: Checkout
uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run type-check

      - name: Lint
        run: npm run lint

      - name: Format check
        run: npm run format:check

      - name: Test with coverage
        run: npm run test:coverage

package-zip:
runs-on: ubuntu-latest
needs: build-validate-test
permissions:
contents: read
steps:
- name: Checkout
uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build and package ZIP
        run: npm run package:lambda

      - name: Upload lambda.zip artifact
        uses: actions/upload-artifact@v4
        with:
          name: lambda-zip
          path: lambda.zip
          if-no-files-found: error
          retention-days: 7

cdk-deploy:
runs-on: ubuntu-latest
needs: package-zip
environment: dev
permissions:
id-token: write
contents: read
steps:
- name: Checkout
uses: actions/checkout@v4

      - name: Download lambda.zip artifact
        uses: actions/download-artifact@v4
        with:
          name: lambda-zip
          path: infrastructure/assets

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::${{ env.AWS_ACCOUNT_ID }}:role/GithubActionsDeploymentRole
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20.x"
          cache: "npm"

      - name: Install infra dependencies
        working-directory: infrastructure
        run: npm ci

      - name: CDK Bootstrap (idempotent)
        working-directory: infrastructure
        run: npx cdk bootstrap aws://${{ env.AWS_ACCOUNT_ID }}/${{ env.AWS_REGION }}

      - name: CDK Deploy
        working-directory: infrastructure
        env:
          ENV_NAME: ${{ env.ENV_NAME }}
          LAMBDA_ZIP_PATH: "./assets/lambda.zip"
        run: |
          # The stack must be coded to use the asset file path (LAMBDA_ZIP_PATH) when present.
          npx cdk deploy --require-approval never -c environment=${ENV_NAME}
```
Notes on ZIP usage in CDK
- Preferred approach:
  - Make the stack accept a path (via environment variable or context) to a pre-built ZIP when running in CI; use cdk-assets to upload automatically.
  - In local dev, allow CDK to bundle code from the project directory (e.g., using aws-cdk-lib.aws_lambda.Code.fromAsset with an output directory).
- Ensure handler path matches the compiled artifact (e.g., dist/index.handler).

Extending to multiple environments
- CDK:
  - Add entries to cdk.json context under environments for test and prod.
  - Parameterize the stack with envName, account, and region; use them to set naming and tags.
  - Use separate bootstrap per account/region: cdk bootstrap aws://<account>/<region>.
- GitHub Actions:
  - Add environments in GitHub (dev, test, prod) with protection rules.
  - Use matrices or separate workflows to target test/prod; require manual approvals for prod.
  - Use different IAM roles per environment (least privilege).
- Resource naming:
  - dev: <lambda-name>-dev
  - test: <lambda-name>-test
  - prod: <lambda-name>

Testing and quality gates
- Application tests
  - Continue using Jest with coverage.
- Infrastructure tests
  - Optional: add CDK assertion tests to validate IAM, memory/timeout, log retention, handler, and runtime.
- Pipeline gates
  - PR: type-check, lint, tests must pass.
  - Main: same as PR before packaging/deployment.

Operational runbook
- First-time setup
  1) Configure AWS OIDC provider and GithubActionsDeploymentRole with necessary permissions.
  2) cdk bootstrap in the target account/region: npx cdk bootstrap aws://<account>/<region> (or via the workflow’s bootstrap step).
- Regular workflow
  - Developer opens PR → CI runs quality gates → merge to main → CD runs:
    - Build and test
    - Package ZIP and publish artifact
    - Deploy the CDK stack to “dev” (CDK uploads ZIP to S3 and updates the function)
- Rollback strategy
  - Use CloudFormation stack rollback (automatic on failure).
  - To rollback a bad version:
    - Re-deploy a previous artifact by re-running the deploy job pointing to an earlier lambda.zip, or revert the commit to re-run CD with the prior artifact.

IAM permissions reference (for GitHub Actions role)
- High-level actions the role should allow (scope to necessary resources/accounts):
  - sts:AssumeRole
  - cloudformation:CreateStack / UpdateStack / Describe* / DeleteStack / CreateChangeSet / ExecuteChangeSet
  - s3:GetObject / PutObject / ListBucket (for CDK bootstrap/deploy buckets)
  - iam:PassRole (scoped to the Lambda execution role created by the stack)
  - lambda:* (scoped to the target function resource for updates)
  - logs:* (scoped to stack log groups as needed)
- Trust policy conditioned for your repo and branches:
  - Allow tokens issued by token.actions.githubusercontent.com for your repo and refs/heads/main (and pull_request if needed).

Acceptance criteria (DoD)
- /infrastructure CDK app compiles and can deploy a Lambda function from a ZIP asset with IAM, logging, and configuration in the dev environment.
- PR workflow (CI) runs on pull_request to main and executes: type-check, lint, test with coverage.
- Main workflow (CD) runs on push to main and:
  - Executes CI steps (type-check, lint, tests).
  - Builds lambda.zip artifact from dist with production dependencies.
  - Uploads artifact and deploys the CDK stack to dev, having CDK upload the ZIP to S3 as an asset.
- No long-lived AWS secrets in GitHub; it uses OIDC.
- Resource names include environment suffixes where applicable.
- Easily extensible to test and prod by adding environment entries and corresponding workflow steps or matrices.

Next steps to implement
1) Ensure the CDK stack reads environment context and deploys Lambda from a ZIP/S3 asset; handler should be dist/index.handler.
2) Configure AWS OIDC and IAM role in the target account.
3) Keep the two GitHub workflows (CI and CD) in .github/workflows/ per this spec.
4) Bootstrap CDK in the target account/region.
5) Test PR flow; merge to main; verify ZIP is uploaded and stack deploys successfully in dev.

