# Development Guide

## Getting Started

### Environment Setup

1. Install Node.js 18+ and npm 8+
2. Install IntelliJ IDEA Ultimate
3. Install Junie Agent plugin
4. Clone the repository and run `npm install`

### IntelliJ IDEA Configuration

#### TypeScript Settings
- File → Settings → Languages & Frameworks → TypeScript
- Enable "TypeScript Language Service"
- Set "Use TypeScript service: ✓"
- Node interpreter: Project node
- TypeScript: Local TypeScript package

#### ESLint Integration
- File → Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
- Manual ESLint configuration
- ESLint package: `[project_root]/node_modules/eslint`
- Configuration file: `[project_root]/.eslintrc.json`

#### Code Style
- File → Settings → Editor → Code Style → TypeScript
- Import project code style from `.editorconfig`
- Enable "Use Prettier" formatting

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes following guidelines
# Add comprehensive tests
# Ensure all quality gates pass

# Commit with descriptive message
git commit -m "feat: add new feature with comprehensive tests"
```

### 2. Quality Checks

```bash
# Before committing, run all checks
npm run type-check  # TypeScript compilation
npm run lint       # ESLint validation
npm run format     # Prettier formatting
npm run test       # All tests with coverage
npm run audit      # Security vulnerability scan
```

### 3. Testing Strategy

- **Unit Tests**: Test individual functions/methods
- **Integration Tests**: Test service interactions
- **Coverage**: Maintain 85%+ statement coverage
- **Mocking**: Mock external dependencies

### 4. Code Review Guidelines

- Review for TypeScript best practices
- Ensure test coverage meets requirements
- Verify security practices implementation
- Check error handling completeness
- Validate documentation updates

## Junie Agent Usage

### Effective Prompts

✅ **Good**: "Create a ProductService following the UserService pattern with CRUD operations, validation, and comprehensive tests"

❌ **Bad**: "Make a product thing"

### Quality Verification

After Junie generates code:

1. Review TypeScript types and interfaces
2. Verify test coverage and quality
3. Check error handling implementation
4. Validate security best practices
5. Ensure code follows project conventions

### Common Issues

- **Missing Error Handling**: Junie might skip try-catch blocks
- **Incomplete Tests**: Review test coverage and edge cases  
- **Type Safety**: Verify no `any` types are used
- **Security**: Check input validation and sanitization

## Troubleshooting

### TypeScript Issues

```bash
# Clear TypeScript cache
rm -rf dist/ .tsbuildinfo
npm run build

# Check for circular dependencies
npx madge --circular src/
```

### Test Issues

```bash
# Clear Jest cache
npx jest --clearCache

# Run specific test file
npm test -- browser.service.test.ts

# Debug failing tests
npm test -- --verbose
```

### ESLint Issues

```bash
# Fix auto-fixable issues
npm run lint:fix

# Show detailed error information
npx eslint src/ --ext .ts --format detailed
```
