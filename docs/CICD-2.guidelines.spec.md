# Infrastructure Agent Guidelines (AWS CDK)

This document defines the authoritative rules Junie agent must follow when working in the infrastructure project (AWS CDK TypeScript app located in /infrastructure). It adapts the general engineering guidelines to IaC specifics and establishes guardrails to validate every change.

Scope
- Applies only to the /infrastructure folder and its contents (bin, lib, test, config files).
- Do not modify application/runtime code outside /infrastructure unless explicitly requested and justified by failing guardrails related to infra integration.

Guardrail Commands (must pass in this order)
1) Build: npm run build
2) Type-check: npm run type-check
3) Lint: npm run lint
4) Format check: npm run format:check
5) CDK synth: npm run synth
6) CDK CLI presence/basic health: npm run cdk
7) Tests: npm run test

Notes:
- All guardrails must pass locally in /infrastructure working directory.
- When any guardrail fails, the agent must stop, report the failure, propose minimal changes to fix, and re-run from step 1.

TypeScript Standards (Infrastructure)
- Strict typing throughout. Avoid any. Prefer unknown or precise types for context parsing and constructs.
- No implicit any or untyped catch clauses; use unknown in catch and narrow safely.
- Maintain idiomatic CDK patterns (constructs in lib/, app entry in bin/).
- Ensure successful compilation (build and type-check guardrails).

CDK-Specific Rules
- App/Context
    - Read environment and deployment parameters (e.g., env/account/region, imageTag) from CDK context and/or environment variables in bin/.
    - Validate required context and fail early with clear messages.
    - Default environment must be safe (e.g., dev); never assume prod.

- Stacks and Constructs
    - Each stack resides in lib/ with clear, single responsibility.
    - Resource names include environment suffix where appropriate (e.g., browser-lambda-dev).
    - Do not create duplicate CloudWatch LogGroups when using logRetention on Lambda.
    - IAM policies must follow least privilege. Prefer managed policies where appropriate and narrow ARNs in inline policies.
    - Avoid hardcoding ARNs; derive from constructs when possible.

- Docker/ECR/Lambda (if applicable)
    - Lambda image/tag must be configurable via CDK context (e.g., -c imageTag=<digest-or-tag>).
    - Support “immutable” deploys via image digest or SHA tag. Avoid relying on latest for production.
    - Do not embed secrets; use AWS-managed mechanisms and environment variables only for non-sensitive config.

- Synthesis/Bootstrap/Deploy
    - npm run synth must succeed without side effects (no external calls).
    - Do not commit artifacts from synthesis (e.g., cdk.out) or .jsii/.cache.
    - No deploys triggered by this spec; deployment is handled by CI/CD. This spec only enforces synth/test quality gates.

Testing Requirements (Infrastructure)
- Use Jest for CDK assertions in /infrastructure/test.
- Write or update tests for:
    - Resource presence and configuration (Lambda runtime/arch/memory/timeout/logRetention).
    - IAM policies (principals, actions, resource scoping).
    - Context-driven naming/tagging and environment selection.
- Follow AAA pattern and keep tests deterministic (no network or AWS calls).
- Maintain or improve coverage; add tests alongside substantive changes.

Code Quality
- Run ESLint and resolve all issues before completion.
- Enforce Prettier formatting (format:check must pass).
- Keep imports organized: external -> internal -> relative.
- Use kebab-case for filenames; PascalCase for classes/interfaces; camelCase for variables and functions; SCREAMING_SNAKE_CASE for constants.

Security and Compliance
- Never hardcode credentials, tokens, or account IDs beyond context examples.
- Validate and narrow IAM permissions; avoid wildcards where not required.
- Avoid logging sensitive values in stack outputs. Outputs should be non-sensitive identifiers (ARNs, names) only when necessary.

Project Structure (Infrastructure)
- bin/: CDK app entrypoint (single composition/root).
- lib/: Stacks and constructs with cohesive responsibilities.
- test/: CDK unit/assertion tests mirroring lib/ structure.
- Config files: tsconfig.json, jest.config.ts, cdk.json, .eslintrc.json, tsconfig.eslint.json.
- Do not introduce additional top-level folders without updating this spec.

Change Management Rules
- Minimize blast radius: prefer localized changes in lib/ and corresponding tests.
- If changing context schema (cdk.json), update bin/ parsing and tests that assert naming/tagging/environment behavior.
- If modifying IAM, add or update tests to validate permissions narrowing.
- If changing Lambda or ECR integration, ensure image tag/digest flow is adjustable via context and covered by tests.

Operational Conventions
- Naming pattern: <resource>-<env> (e.g., browser-lambda-dev).
- Tags: include app and env where supported.
- logRetention is required for functions (e.g., 30 days) to prevent unbounded log growth.

Workflow the Agent Must Follow
1) Understand task and identify impacted files strictly within /infrastructure.
2) Update code and/or tests adhering to this spec.
3) Run guardrails from /infrastructure:
    - npm run build
    - npm run type-check
    - npm run lint
    - npm run format:check
    - npm run synth
    - npm run cdk
    - npm run test
4) If any step fails:
    - Stop and report which step failed with the exact error summary.
    - Propose minimal, targeted fixes aligned with this document.
    - Apply fixes and restart the guardrail sequence from step 1.

Acceptance Criteria for Any PR Touching /infrastructure
- All guardrails pass locally and in CI.
- Tests cover key changes (resources, IAM, context, naming).
- No policy over-permissions or leaked secrets.
- CDK synth produces a sane, minimal change set (no drift-inducing noise).
- Documentation/comments updated when context schema or naming/tagging changes.

Prohibited Actions
- Committing synthesized artifacts (cdk.out) or node_modules.
- Bypassing guardrails or ignoring lint/formatting errors.
- Introducing any any types without justification and safe narrowing.
- Adding broad IAM wildcards without strong rationale and tests.

How to Propose Non-Trivial Changes
- Document the intended context changes (keys, defaults) in cdk.json and code comments.
- Add tests demonstrating expected behavior per environment and tag/digest.
- Include a brief rationale in the PR description for IAM expansions or architectural changes.

By adhering to these guidelines and passing all guardrails, Junie ensures reliable, secure, and maintainable AWS infrastructure changes for the project.