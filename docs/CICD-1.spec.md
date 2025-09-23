Below is a complete, implementation-ready specification for your CI/CD that builds, tests, and deploys your AWS resources using GitHub Actions and AWS CDK (TypeScript). It is designed to work now for a single environment (“dev”) and be easily extended to multiple environments (“dev”, “test”, “prod”).

High-level goals
- CI on Pull Requests: build, validate (lint + type-check), test.
- CD on merge to main: build, validate, test, package Lambda into container image, push to ECR, and deploy via AWS CDK.
- Infrastructure code in /infrastructure as an AWS CDK TypeScript app.
- CDK stack provisions all required AWS resources for the Lambda, including IAM roles, policies, log groups, and permissions.
- Ready for multi-environment extension with naming/tagging conventions, parameterized configuration, and environment-specific contexts.

Architecture overview
- Repository layout
    - application code in existing root (src, tests, package.json).
    - infrastructure code in /infrastructure: a CDK TypeScript app with a Lambda stack that deploys Lambda from an ECR image.
- Registry
    - Amazon ECR repository to host browser-lambda images.
    - Image tagging strategy: latest for dev, plus immutable tags based on Git SHA.
- IAM and security
    - CDK stack creates a dedicated Lambda execution role with baseline permissions (CloudWatch Logs, ECR pull).
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
    - /infrastructure/bin/browser-lambda.ts (CDK app entrypoint)
    - /infrastructure/lib/browser-lambda-stack.ts (main stack)
    - /infrastructure/cdk.json (context and app config)
    - Optional: /infrastructure/test/… for CDK assertions (Jest)
- Stack responsibilities (browser-lambda-stack)
    - ECR
        - Reference an existing ECR repository by name (recommended), or create one if absent.
        - Repository name: qlibin/browser-lambda.
    - Lambda function
        - Runtime: from container image in ECR.
        - Architecture: arm64.
        - Memory: 1024 MB.
        - Timeout: 300 seconds.
        - Env vars: NODE_ENV=production (plus room for future configuration).
        - Permissions:
            - Create and write logs in CloudWatch.
            - Pull images from ECR (least privilege).
        - Logging: managed via function logRetention (e.g., 30 days). Do not create a separate LogGroup when logRetention is set.
    - IAM
        - Create a Lambda execution role with:
            - Trust policy for lambda.amazonaws.com.
            - AWSLambdaBasicExecutionRole managed policy.
            - Inline policy to access ECR pull actions with least privilege:
                - ecr:GetAuthorizationToken on "*"
                - ecr:BatchCheckLayerAvailability, ecr:GetDownloadUrlForLayer, ecr:BatchGetImage scoped to the specific repository ARN
    - Parameters/config
        - Context-driven configuration: account, region, env name, repository name, and base resource naming prefix.
        - Resource naming pattern: <resource>-<env> (e.g., browser-lambda-dev).
    - Outputs
        - Function name, function ARN, and image URI deployed.

Example CDK context model
- cdk.json example context
```json
{
  "app": "npx ts-node --esm bin/browser-lambda.ts",
  "context": {
    "environments": {
      "dev": {
        "account": "123456789012",
        "region": "us-east-1",
        "envName": "dev",
        "ecrRepoName": "qlibin/browser-lambda",
        "lambdaName": "browser-lambda-dev",
        "tags": {
          "app": "browser-lambda",
          "env": "dev"
        }
      },
      "test": {
        "account": "123456789012",
        "region": "us-east-1",
        "envName": "test",
        "ecrRepoName": "qlibin/browser-lambda",
        "lambdaName": "browser-lambda-test",
        "tags": {
          "app": "browser-lambda",
          "env": "test"
        }
      },
      "prod": {
        "account": "123456789012",
        "region": "us-east-1",
        "envName": "prod",
        "ecrRepoName": "qlibin/browser-lambda",
        "lambdaName": "browser-lambda",
        "tags": {
          "app": "browser-lambda",
          "env": "prod"
        }
      }
    },
    "defaultEnvironment": "dev"
  }
}
```


- bin/browser-lambda.ts responsibilities
    - Read context environment (default dev) via direct context keys (no tryGetContext('/') workaround).
    - Accept imageTag (or digest) from context for immutable deployments.
    - Optionally, if AWS_ACCOUNT_ID env var is set during deploy, verify it matches the selected environment and fail otherwise.
    - Instantiate BrowserLambdaStack with env and naming config.

- lib/browser-lambda-stack.ts responsibilities
    - Create/lookup ECR repository.
    - Define lambda function from Docker image: ecr.Repository.fromRepositoryName + lambda.DockerImageCode.fromEcr or directly DockerImageFunction referencing a specific tag or digest.
    - Attach IAM policies and manage logging via function logRetention (no separate LogGroup when using logRetention).
    - Export outputs.

Note: The CDK stack deploys the Lambda to consume an existing image in ECR. CI/CD will build and push the image prior to the CDK deploy step.

GitHub Actions: security and access
- Use GitHub OIDC to assume an AWS role without storing long-lived secrets.
- AWS prerequisites (one-time per account):
    - Configure AWS OIDC Identity Provider (sts.amazonaws.com) for your GitHub Org/Repo.
    - Create IAM Role: GithubActionsDeploymentRole with trust policy allowing your repo and branches (ref:refs/heads/main, pull_request) to assume it.
    - Attach policy allowing:
        - CloudFormation (cdk deploy uses this)
        - S3, ECR (read/write for pushing images), Logs, IAM PassRole (scoped to the Lambda role), Lambda, STS AssumeRole
- In GitHub repo:
    - Add environment “dev” for deployment protection rules (optional).
    - Configure aws-actions/configure-aws-credentials with role-to-assume and aws-region.

CI workflow (Pull Request)
- Name: ci.yml
- Triggers: pull_request targeting main
- Jobs:
    - build-and-test
        - Runs on ubuntu-latest
        - Steps:
            - Checkout
            - Setup Node (use version aligned with your project, e.g., 18.x or 20.x)
            - Cache npm
            - Install deps: npm ci
            - Type-check: npm run type-check
            - Lint: npm run lint
            - Format check: npm run format:check (optional; fail if not formatted)
            - Test with coverage: npm run test:coverage
        - Artifacts: coverage/lcov-report (optional)

Example workflow (PR)
```yaml
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
    2) package-and-push-image
        - Needs: build-validate-test
        - Steps:
            - Configure AWS credentials via OIDC
            - Login to ECR
            - Build Docker image:
                - Tag: latest and $GITHUB_SHA for traceability
            - Push image to ECR
        - Outputs: IMAGE_TAG (GITHUB_SHA) for deploy job
    3) cdk-deploy
        - Needs: package-and-push-image
        - Steps:
            - Configure AWS creds via OIDC
            - Install CDK (local to infra)
            - npm ci in /infrastructure
            - cdk bootstrap (idempotent; optionally conditional)
            - Pass env context to deploy (env=dev); the stack will use the latest image or the SHA tag if configured
            - cdk deploy --require-approval never

Example workflow (CD)
```yaml
name: CD

on:
  push:
    branches: [ "main" ]

concurrency:
  group: browser-lambda-${{ github.ref_name }}
  cancel-in-progress: true

env:
  AWS_REGION: eu-central-1
  ECR_REPOSITORY: ${{ vars.ECR_REPOSITORY }}
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

  package-and-push-image:
    runs-on: ubuntu-latest
    needs: build-validate-test
    permissions:
      id-token: write
      contents: read
    outputs:
      image_tag: ${{ steps.meta.outputs.image_tag }}
      image_digest: ${{ steps.resolve_digest.outputs.image_digest }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

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

      - name: Login to Amazon ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set image tags
        id: meta
        run: |
          echo "image_tag=${GITHUB_SHA}" >> "$GITHUB_OUTPUT"

      - name: Build image
        run: |
          npm ci
          npm run dist
          docker build \
            -t $ECR_REPOSITORY:latest \
            -t $ECR_REPOSITORY:${{ steps.meta.outputs.image_tag }} .

      - name: Tag with account registry
        run: |
          ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
          REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
          docker tag $ECR_REPOSITORY:latest $REGISTRY/$ECR_REPOSITORY:latest
          docker tag $ECR_REPOSITORY:${{ steps.meta.outputs.image_tag }} $REGISTRY/$ECR_REPOSITORY:${{ steps.meta.outputs.image_tag }}
          echo "REGISTRY=$REGISTRY" >> $GITHUB_ENV

      - name: Push images
        run: |
          docker push $REGISTRY/$ECR_REPOSITORY:latest
          docker push $REGISTRY/$ECR_REPOSITORY:${{ steps.meta.outputs.image_tag }}

      - name: Resolve image digest for SHA tag
        id: resolve_digest
        run: |
          DIGEST=$(aws ecr describe-images \
            --repository-name "$ECR_REPOSITORY" \
            --image-ids imageTag=${{ steps.meta.outputs.image_tag }} \
            --query 'imageDetails[0].imageDigest' \
            --output text)
          echo "image_digest=$DIGEST" >> "$GITHUB_OUTPUT"

  cdk-deploy:
    runs-on: ubuntu-latest
    needs: package-and-push-image
    environment: dev
    permissions:
      id-token: write
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

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
          IMAGE_TAG: ${{ needs.package-and-push-image.outputs.image_digest }}
          ENV_NAME: ${{ env.ENV_NAME }}
        run: |
          npx cdk deploy --require-approval never \
            -c environment=${ENV_NAME} \
            -c imageTag=${IMAGE_TAG}
```


Notes on image usage in CDK
- If you want the stack to always use latest:
    - Keep DockerImageCode pointing to the ECR URI with tag latest.
    - Pros: simple; Cons: CloudFormation might not detect changes (same tag). Consider Versioned image updates using a parameter.
- If you want immutable deployments per commit (recommended):
    - Build and push image with tag $GITHUB_SHA.
    - Pass imageTag via CDK context (as shown), and resolve the image URI with that tag in the stack. This guarantees a change set on each deploy.

Extending to multiple environments
- CDK:
    - Add entries to cdk.json context under environments for test and prod.
    - Parameterize the stack with the envName, account, and region, and use them to set naming and tags.
    - Use separate bootstrap per account/region: cdk bootstrap aws://<account>/<region>.
- GitHub Actions:
    - Add environments in GitHub (dev, test, prod) with protection rules.
    - Create per-branch or per-tag workflows to target test/prod.
    - Use a matrix or separate jobs to deploy to different envs; for prod require manual approval.
    - Use different IAM roles per environment (least privilege).
- Resource naming:
    - dev: browser-lambda-dev
    - test: browser-lambda-test
    - prod: browser-lambda
- Image tagging:
    - Always push both latest (only for non-prod) and immutable $GITHUB_SHA.
    - For prod, deploy immutable tags only.

Testing and quality gates
- Application tests
    - Continue using Jest with coverage.
- Infrastructure tests
    - Optional but recommended: add CDK assertion tests in /infrastructure/test (using @aws-cdk/assertions) to validate IAM, memory/timeout, log retention, etc.
- Pipeline gates
    - PR: type-check, lint, tests must pass.
    - Main: same as PR before any packaging/deployment.

Operational runbook
- First-time setup
    1) Create/verify ECR repository qlibin/browser-lambda.
    2) Configure AWS OIDC provider and GithubActionsDeploymentRole with necessary permissions.
    3) cdk bootstrap in the target account/region: npx cdk bootstrap aws://<account>/<region> (or via the workflow’s bootstrap step).
- Regular workflow
    - Developer opens PR → CI runs quality gates → merge to main → CD runs:
        - Build and test
        - Build/push image
        - Deploy CDK stack to “dev”.
- Rollback strategy
    - Use CloudFormation stack rollback (automatic on failure).
    - To rollback a bad version:
        - Re-deploy a previous known-good image tag via manually triggering a deploy with the prior SHA tag, or revert the commit to re-run CD with prior imageTag.

IAM permissions reference (for GitHub Actions role)
- High-level actions the role should allow (scope to necessary resources/accounts):
    - sts:AssumeRole
    - ecr:GetAuthorizationToken
    - ecr:BatchCheckLayerAvailability
    - ecr:GetDownloadUrlForLayer
    - ecr:BatchGetImage
    - ecr:PutImage
    - ecr:InitiateLayerUpload
    - ecr:UploadLayerPart
    - ecr:CompleteLayerUpload
    - cloudformation:CreateStack / UpdateStack / Describe* / DeleteStack / CreateChangeSet / ExecuteChangeSet
    - s3:GetObject / PutObject / ListBucket (for CDK bootstrap/deploy buckets)
    - iam:PassRole (scoped to the Lambda execution role created by the stack)
    - lambda:* (scoped to the target function resource for updates)
    - logs:* (scoped to stack log groups as needed)
- Trust policy conditioned for your repo and branches:
    - Allow tokens issued by token.actions.githubusercontent.com for your repo and refs/heads/main (and pull_request if needed for PR previews in the future).

Acceptance criteria (DoD)
- /infrastructure CDK app compiles and can deploy a Lambda function from an ECR image with IAM, logging, and configuration in the dev environment.
- PR workflow (CI) runs on pull_request to main and executes: type-check, lint, test with coverage.
- Main workflow (CD) runs on push to main and:
    - Executes CI steps (type-check, lint, tests).
    - Builds Docker image for browser-lambda (ARM64), tags latest and $GITHUB_SHA, pushes to ECR, then resolves the image digest for the SHA tag.
    - Deploys the CDK stack to dev using the image digest (immutable), passing it to CDK via `-c imageTag=<digest>`.
- No long-lived AWS secrets in GitHub; it uses OIDC.
- Resource names include environment suffixes where applicable.
- Easily extensible to test and prod by adding environment entries and corresponding workflow steps or matrices.

Next steps to implement
1) Create /infrastructure CDK app and stacks as described; wire stack to use ECR and Docker image tag via context (imageTag default “latest”).
2) Configure AWS OIDC and IAM role in the target account.
3) Add the two GitHub workflows (CI and CD) to .github/workflows/.
4) Bootstrap CDK (first time) in the target account/region.
5) Test PR flow; merge to main; verify image is pushed and stack deploys successfully in dev.