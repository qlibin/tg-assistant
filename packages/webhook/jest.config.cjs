module.exports = {
  displayName: 'webhook',
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 75,
      functions: 85,
      lines: 85,
    },
  },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': ['ts-jest', { useESM: false }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: ['node_modules/(?!@qlibin/tg-assistant-contracts)'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@tg-assistant/common$': '<rootDir>/../common/src/index.ts',
  },
};
