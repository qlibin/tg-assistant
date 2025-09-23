import { handler } from '../src/index';
import { runBrowserAutomation } from '../src/browser-automation';

// Mock the runBrowserAutomation function
jest.mock('../src/browser-automation', () => ({
  runBrowserAutomation: jest.fn().mockResolvedValue(undefined),
}));

describe('AWS Lambda Handler', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const mockRunBrowserAutomation = runBrowserAutomation as jest.MockedFunction<
    typeof runBrowserAutomation
  >;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should invoke runBrowserAutomation and return success response', async () => {
    // Arrange
    const mockEvent = { key: 'value' };

    // Act
    const result = await handler(mockEvent);

    // Assert
    expect(mockRunBrowserAutomation).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Browser automation completed successfully' }),
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'AWS Lambda handler invoked with event:',
      JSON.stringify(mockEvent)
    );
  });

  it('should handle errors and return error response', async () => {
    // Arrange
    const mockEvent = { key: 'value' };
    const mockError = new Error('Test error');
    mockRunBrowserAutomation.mockRejectedValueOnce(mockError);

    // Act
    const result = await handler(mockEvent);

    // Assert
    expect(mockRunBrowserAutomation).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error during browser automation',
        error: 'Test error',
      }),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error during browser automation:', 'Test error');
  });

  it('should handle non-Error objects and return error response', async () => {
    // Arrange
    const mockEvent = { key: 'value' };
    const mockError = 'String error';
    mockRunBrowserAutomation.mockRejectedValueOnce(mockError);

    // Act
    const result = await handler(mockEvent);

    // Assert
    expect(mockRunBrowserAutomation).toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error during browser automation',
        error: 'String error',
      }),
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error during browser automation:',
      'String error'
    );
  });
});
