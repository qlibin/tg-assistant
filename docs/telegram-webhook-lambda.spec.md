# Telegram Webhook Lambda (TypeScript) — Implementation Spec

## Goal
Implement a TypeScript Lambda handler for Telegram webhook, mirroring the reference JS file, with strict typing, separation by layers, and tests/quality gates.

## Source of Truth
Use docs/lambda-handler-example.mjs as the authoritative reference for the handler’s behavior and flow. Port its logic to TypeScript without changing semantics unless required by typing, security, or project guidelines.

## Constraints
- Do not modify anything under infrastructure/.
- The application is a headless, asynchronous webhook processor (no UI).
- Follow docs/development.md and .junie/guidelines.md (coding standards, testing, quality gates).
- Packaging must follow docs/lambda-packaging.md.
- Keep architecture separation per docs/architecture.md.

## Required Context Files
Before implementation, ensure access to:
- `docs/lambda-handler-example.mjs` - Reference implementation
- `docs/architecture.md` - Project architecture patterns
- `docs/development.md` - Development standards
- `docs/lambda-packaging.md` - Deployment packaging
- `.junie/guidelines.md` - Coding standards and anti-patterns

## Entry Point
- The Lambda handler must be exported from src/index.ts and invoked by API Gateway (Lambda Proxy Integration).

## Implementation Plan
- Translate docs/lambda-handler-example.mjs into TypeScript:
    - Strong typing (no any). Use precise types or unknown + narrowing.
    - Extract concerns:
        - src/services/telegram.service.ts — Telegram Bot API sendMessage.
        - src/utils/validation.ts — safe JSON parse and minimal shape checks.
        - src/utils/http.ts — API Gateway response helpers.
        - src/types/telegram.ts — minimal Telegram and Lambda event types used by the handler.
- Preserve behavior defined in docs/lambda-handler-example.mjs while aligning with project standards (logging, error handling, security).

## Testing
- Mirror src structure under tests/.
- Unit tests for:
    - Handler happy path and error paths (missing env, invalid JSON, invalid shape, non-message update, Telegram API failures).
    - Telegram service (success, non-200, ok=false, malformed JSON, timeout).
    - Validation utilities.
- Achieve >= 85% coverage; follow AAA and mock external network I/O.

## Quality Gates
- TypeScript strict mode passes.
- ESLint and Prettier pass.
- Tests with coverage pass
- Build the project succeeds
- No secrets logged or leaked in responses.
- No changes to infrastructure/.
- Build/package per docs/lambda-packaging.md.

## Security Requirements
- Never log sensitive data (tokens, user IDs, message content)
- Validate webhook authenticity if required by Telegram
- Sanitize all external inputs before processing
- Use environment variables for bot token (TELEGRAM_BOT_TOKEN)
- Error responses that don't leak internal details

## Error Handling Strategy
- Network failures: Return 200 to prevent Telegram retries, log internally
- Validation failures: Return 200, log validation error
- Service failures: Return 500 only for infrastructure issues
- Unknown update types: Return 200, log warning
- Missing environment variables: Fail fast with 500

## Acceptance Criteria
- [ ] Handler processes valid Telegram message updates successfully
- [ ] Handler ignores non-message updates without errors
- [ ] Handler responds appropriately to malformed JSON
- [ ] Telegram service handles API failures gracefully
- [ ] All environment variables are validated at startup
- [ ] No sensitive data appears in CloudWatch logs
- [ ] Response times < 5 seconds for typical payloads
- [ ] Zero infrastructure changes required

## Testing Requirements

### Unit Tests (Required)
```typescript
// Example test structure for telegram.service.ts
describe('TelegramService', () => {
  describe('sendMessage', () => {
    it('should send message successfully with valid parameters');
    it('should handle API 4xx errors gracefully');
    it('should handle API 5xx errors with retries');
    it('should handle network timeouts');
    it('should handle malformed API responses');
  });
});
```

### Integration Tests
- Mock API Gateway events with real Telegram webhook payloads
- Test complete handler flow from event to response
- Verify no sensitive data in response bodies

## Performance & Monitoring
- Handler should complete within Lambda timeout (15 seconds max)
- Log structured data for CloudWatch insights
- Include correlation IDs for request tracing
- Monitor success/failure rates
- Track response times and payload sizes


## Dependencies & Environment
- Runtime: Node.js 18.x (latest Lambda supported)
- Required environment variables:
    - `TELEGRAM_BOT_TOKEN`: Bot API token (required)
    - `LOG_LEVEL`: Debug/Info/Warn/Error (optional, default: Info)
- External dependencies: Minimize bundle size for cold start optimization
- AWS SDK: Use v3 if required (tree-shakeable)
