// Jest setup file
// Keep test environment stable and prevent real network calls unless explicitly mocked

jest.setTimeout(10000);

// Ensure NODE_ENV is test
process.env.NODE_ENV = 'test';
