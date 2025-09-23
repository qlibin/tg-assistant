/**
 * AWS Lambda function to process Telegram bot webhooks
 * Node.js 22 runtime
 *
 * Environment Variables Required:
 * - TELEGRAM_BOT_TOKEN: Your bot token from BotFather
 */

// Built-in Node.js modules
import https from 'https';

/**
 * Main Lambda handler function
 * @param {Object} event - API Gateway Lambda Proxy Integration event
 * @param {Object} context - Lambda Context runtime methods and attributes
 * @returns {Object} - API Gateway Lambda Proxy Integration response
 */
export const handler = async (event, context) => {
    // Log the entire event for debugging
    console.log('🔄 Lambda function started');
    console.log('📨 Received event:', JSON.stringify(event, null, 2));

    try {
        // Validate environment variables
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
            console.error('❌ TELEGRAM_BOT_TOKEN environment variable is not set');
            return createErrorResponse(500, 'Bot token not configured');
        }

        // Parse the webhook payload from Telegram
        let update;
        try {
            update = JSON.parse(event.body);
            console.log('📦 Parsed webhook update:', JSON.stringify(update, null, 2));
        } catch (parseError) {
            console.error('❌ Failed to parse webhook body:', parseError.message);
            return createErrorResponse(400, 'Invalid JSON payload');
        }

        // Validate webhook structure
        if (!update || typeof update.update_id === 'undefined') {
            console.error('❌ Invalid webhook structure - missing update_id');
            return createErrorResponse(400, 'Invalid webhook structure');
        }

        // Check if this is a message update
        if (!update.message) {
            console.log('ℹ️  Webhook update does not contain a message, ignoring');
            return createSuccessResponse('Webhook processed (non-message update)');
        }

        const message = update.message;

        // Extract message information
        const messageInfo = extractMessageInfo(message);
        console.log('💬 Extracted message info:', JSON.stringify(messageInfo, null, 2));

        // Log the user message
        console.log(`📝 Message from user: ${messageInfo.userFirstName} (${messageInfo.userId})`);
        console.log(`📄 Message text: "${messageInfo.messageText}"`);

        // Create reply message
        const replyText = createReplyMessage(messageInfo, event);

        // Send reply to the user
        await sendTelegramMessage(botToken, messageInfo.chatId, replyText);

        console.log('✅ Successfully processed webhook and sent reply');
        return createSuccessResponse('Webhook processed successfully');

    } catch (error) {
        console.error('💥 Unexpected error in Lambda handler:', error);
        console.error('Stack trace:', error.stack);
        return createErrorResponse(500, 'Internal server error');
    }
};

/**
 * Extract relevant information from the Telegram message
 * @param {Object} message - Telegram Message object
 * @returns {Object} - Extracted message information
 */
function extractMessageInfo(message) {
    const messageInfo = {
        messageId: message.message_id,
        userId: null,
        userFirstName: 'User',
        userLastName: null,
        username: null,
        chatId: message.chat.id,
        messageText: message.text || '[Non-text message]',
        messageDate: message.date,
        chatType: message.chat.type
    };

    // Extract user information from the 'from' field
    if (message.from) {
        messageInfo.userId = message.from.id;
        messageInfo.userFirstName = message.from.first_name || 'User';
        messageInfo.userLastName = message.from.last_name || null;
        messageInfo.username = message.from.username || null;
    }

    return messageInfo;
}

/**
 * Create a reply message that greets the user and echoes the Lambda event
 * @param {Object} messageInfo - Extracted message information
 * @param {Object} event - Original Lambda event
 * @returns {string} - Reply message text
 */
function createReplyMessage(messageInfo, event) {
    const greeting = `Hello ${messageInfo.userFirstName}! 👋`;

    // Create a simplified version of the event for echoing (remove sensitive data)
    const eventEcho = {
        httpMethod: event.httpMethod,
        headers: event.headers ? Object.keys(event.headers) : [],
        requestContext: {
            requestId: event.requestContext?.requestId,
            stage: event.requestContext?.stage,
            httpMethod: event.requestContext?.httpMethod
        },
        body: event.body ? JSON.parse(event.body) : null
    };

    const echoText = `\n\n📡 AWS Lambda Event Echo:\n\`\`\`json\n${JSON.stringify(eventEcho, null, 2)}\n\`\`\``;

    return greeting + echoText;
}

/**
 * Send a message to Telegram using the Bot API
 * @param {string} botToken - Telegram bot token
 * @param {number} chatId - Target chat ID
 * @param {string} text - Message text to send
 * @returns {Promise<Object>} - Telegram API response
 */
function sendTelegramMessage(botToken, chatId, text) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${botToken}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        console.log(`🚀 Sending message to Telegram API: chat_id=${chatId}, text_length=${text.length}`);

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(responseBody);

                    if (res.statusCode === 200 && response.ok) {
                        console.log('✅ Message sent successfully to Telegram');
                        console.log('📤 Telegram API response:', JSON.stringify(response, null, 2));
                        resolve(response);
                    } else {
                        console.error(`❌ Telegram API error: ${res.statusCode}`);
                        console.error('📤 Error response:', responseBody);
                        reject(new Error(`Telegram API error: ${response.description || responseBody}`));
                    }
                } catch (parseError) {
                    console.error('❌ Failed to parse Telegram API response:', parseError.message);
                    console.error('📤 Raw response:', responseBody);
                    reject(new Error(`Failed to parse Telegram API response: ${parseError.message}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ HTTPS request error:', error.message);
            reject(new Error(`HTTPS request failed: ${error.message}`));
        });

        req.on('timeout', () => {
            console.error('❌ HTTPS request timeout');
            req.destroy();
            reject(new Error('Request timeout'));
        });

        // Set request timeout (30 seconds)
        req.setTimeout(30000);

        // Send the request
        req.write(payload);
        req.end();
    });
}

/**
 * Create a success response for API Gateway
 * @param {string} message - Success message
 * @returns {Object} - API Gateway response object
 */
function createSuccessResponse(message) {
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            success: true,
            message: message,
            timestamp: new Date().toISOString()
        })
    };
}

/**
 * Create an error response for API Gateway
 * @param {number} statusCode - HTTP status code
 * @param {string} errorMessage - Error message
 * @returns {Object} - API Gateway response object
 */
function createErrorResponse(statusCode, errorMessage) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            success: false,
            error: errorMessage,
            timestamp: new Date().toISOString()
        })
    };
}