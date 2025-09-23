# TypeScript Junie Project

A comprehensive TypeScript project template configured for use with JetBrains IntelliJ IDEA and Junie Agent. This project follows strict TypeScript best practices, comprehensive testing standards, and security guidelines.

## 🚀 Features

- **Strict TypeScript Configuration**: Full type safety with comprehensive compiler options
- **ESLint & Prettier**: Automated code quality and formatting
- **Comprehensive Testing**: Jest with 85%+ coverage requirements
- **Security-First**: Input validation, sanitization, and vulnerability scanning
- **Junie Agent Integration**: AI coding assistant with project-specific guidelines
- **Pre-commit Hooks**: Automated quality gates using Husky
- **IntelliJ IDEA Optimized**: Configured for seamless IDE integration

## 📋 Prerequisites

- Node.js 18+ 
- npm 8+
- JetBrains IntelliJ IDEA Ultimate
- Junie Agent plugin

## 🛠️ Setup Instructions

### 1. Clone and Install

```bash
# Navigate to the project directory
cd typescript-junie-project

# Install dependencies
npm install

# Set up Husky pre-commit hooks
npm run prepare

# Copy environment configuration
cp .env.example .env
```

### 2. IntelliJ IDEA Configuration

1. **Open Project**: File → Open → Select `typescript-junie-project` folder
2. **Enable TypeScript**: File → Settings → Languages & Frameworks → TypeScript → Enable TypeScript Language Service
3. **Configure ESLint**: File → Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint → Enable
4. **Install Junie Agent**: File → Settings → Plugins → Install Junie Agent plugin
5. **Load Junie Guidelines**: Junie will automatically detect `.junie/guidelines.md`

### 3. Verify Setup

```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Run tests with coverage
npm run test:coverage

# Run security audit
npm run audit

# Build the project
npm run build
```

## 📁 Project Structure

```
src/
├── components/         # Reusable UI/business components
├── services/          # Business logic and data operations
├── utils/             # Utility functions and helpers
├── types/             # TypeScript type definitions
├── constants/         # Application constants
└── index.ts           # Application entry point

tests/                 # Test files mirroring src structure
├── components/        # Component tests
├── services/          # Service tests
├── utils/             # Utility tests
└── setup.ts           # Test configuration

.junie/                # Junie Agent configuration
├── guidelines.md      # AI agent guidelines

Configuration files:
├── tsconfig.json      # TypeScript configuration
├── jest.config.js     # Jest testing configuration
├── .eslintrc.json     # ESLint rules
├── .prettierrc        # Prettier formatting
└── package.json       # Dependencies and scripts
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Coverage Requirements

- **Statements**: 85% minimum
- **Branches**: 80% minimum  
- **Functions**: 85% minimum
- **Lines**: 85% minimum

## 🔧 Development Scripts

```bash
# Development
npm run dev              # Run in development mode
npm start               # Run production build

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Fix ESLint issues
npm run format          # Format with Prettier
npm run format:check    # Check formatting

# Testing
npm test                # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage

# Build
npm run build           # Build for production
npm run type-check      # TypeScript type checking
npm run package:lambda  # Package for AWS Lambda deployment

# Security
npm run audit           # Security vulnerability scan
```

## 🤖 Working with Junie Agent

### Configuration

Junie Agent is configured with project-specific guidelines in `.junie/guidelines.md`. These include:

- TypeScript strict mode requirements
- Testing coverage standards
- Security best practices
- Code style conventions
- Anti-hallucination measures

### Best Practices

1. **Clear Instructions**: Provide specific, actionable requirements
2. **Context Awareness**: Ensure Junie understands existing code patterns
3. **Incremental Development**: Break complex features into smaller tasks
4. **Quality Verification**: Always review generated code and tests
5. **Guidelines Adherence**: Junie follows project-specific rules automatically

### Example Interaction

```
Ask Junie: "Create a new ProductService class with CRUD operations following the existing UserService pattern"

Junie will:
✅ Follow TypeScript strict typing
✅ Generate comprehensive tests
✅ Include proper error handling
✅ Apply security best practices
✅ Maintain code coverage requirements
```

## 🔒 Security Guidelines

### Input Validation

- All external inputs validated with Zod schemas
- Runtime type checking for API boundaries
- Sanitization of user-provided data

### Dependencies

```bash
# Regular security audits
npm audit

# Fix vulnerabilities
npm audit fix
```

### Environment Variables

- Never commit secrets to repository
- Use `.env` files for configuration
- Validate environment variables at startup

#### Available Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLAYWRIGHT_SCREENSHOTS_ENABLED` | Controls whether Playwright captures screenshots during errors for debugging purposes. Set to `false` to disable screenshots. | `true` |

## 📊 Code Quality Standards

### TypeScript Configuration

- Strict mode enabled with comprehensive type checking
- No `any` types allowed - use `unknown` or proper types
- Exact optional property types enforced
- Unused locals and parameters detected

### ESLint Rules

- No explicit `any` usage
- Prefer `const` over `let`
- Require array sort compare functions
- Await thenable promises
- No floating promises

### Formatting

- Prettier with consistent configuration
- 2-space indentation
- Single quotes preferred
- Trailing commas for ES5 compatibility
- 100 character line length

## 🚀 Deployment

### Production Build

```bash
# Create production build
npm run build

# The dist/ folder contains compiled JavaScript
# Deploy the contents of dist/ to your production environment
```

### AWS Lambda Deployment

#### Option 1: ZIP Package Deployment (Traditional)

```bash
# Create AWS Lambda deployment package as a ZIP file
npm run package:lambda

# This will:
# 1. Build the TypeScript code
# 2. Copy package.json and package-lock.json to dist/
# 3. Install production dependencies in dist/
# 4. Create lambda.zip file from the contents of dist/

# The lambda.zip file is ready to be uploaded to AWS Lambda
```

#### Option 2: Docker Container Image (Recommended for Browser Automation)

```bash
# Build Docker container image for Lambda
npm run package:docker

# Test the Docker image locally
npm run package:docker:run

# Test function invocation with a sample event
npm run package:docker:test

# Push the image to Amazon ECR (requires AWS credentials)
export AWS_ACCOUNT_ID=12345678991311
export AWS_REGION=eu-central-1
npm run package:docker:push
```

For detailed instructions on both deployment methods, see [Lambda Packaging Documentation](docs/lambda-packaging-docker.md).

### Environment Configuration

Set production environment variables:

```bash
NODE_ENV=production
API_URL=https://api.yourdomain.com
DATABASE_URL=postgresql://user:pass@prod-db:5432/app
SECRET_KEY=your-production-secret
```

## 🤝 Contributing

### Pre-commit Checklist

All commits must pass these automated checks:

- ✅ TypeScript compilation (zero errors)
- ✅ ESLint validation (zero violations)  
- ✅ Prettier formatting (consistent style)
- ✅ Test execution (all tests passing)
- ✅ Coverage thresholds (85%+ minimum)
- ✅ Security audit (no critical issues)

### Development Workflow

1. Create feature branch from main
2. Implement changes following guidelines
3. Add/update tests to maintain coverage
4. Run quality checks locally
5. Submit pull request
6. Automated checks must pass
7. Code review and merge

## 📚 Additional Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)
- [ESLint Rules Reference](https://eslint.org/docs/rules/)
- [Zod Validation Library](https://zod.dev/)
- [IntelliJ IDEA TypeScript Support](https://www.jetbrains.com/help/idea/typescript-support.html)

## 📄 License

MIT License - see LICENSE file for details.

## 🐛 Issues & Support

For issues related to:
- **Project Structure**: Check this README and project guidelines
- **TypeScript Errors**: Verify tsconfig.json and type definitions
- **Test Failures**: Review Jest configuration and test patterns
- **Junie Agent**: Consult `.junie/guidelines.md` for agent behavior

---

**Happy Coding with TypeScript and Junie Agent! 🎉**
