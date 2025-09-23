import { runBrowserAutomation } from './browser-automation';

/**
 * AWS Lambda handler function that invokes the browser automation script.
 * This function is designed to be used as an AWS Lambda function handler.
 *
 * @param event - The AWS Lambda event object
 * @returns A promise that resolves when the browser automation is complete
 */
export const handler = async (event: unknown): Promise<{ statusCode: number; body: string }> => {
  try {
    console.log('AWS Lambda handler invoked with event:', JSON.stringify(event));

    // Run the browser automation
    await runBrowserAutomation();

    // Return a successful response
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Browser automation completed successfully' }),
    };
  } catch (error) {
    // Log the error
    console.error(
      'Error during browser automation:',
      error instanceof Error ? error.message : String(error)
    );

    // Return an error response
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error during browser automation',
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
};
