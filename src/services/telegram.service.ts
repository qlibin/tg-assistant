import https from 'https';
import { TelegramApiResponse, TelegramSentMessage } from '../types/telegram';

export interface SendMessageParams {
  botToken: string;
  chatId: number;
  text: string;
  timeoutMs?: number;
}

export class TelegramService {
  static async sendMessage(
    params: SendMessageParams
  ): Promise<TelegramApiResponse<TelegramSentMessage>> {
    const { botToken, chatId, text, timeoutMs = 30000 } = params;

    // Build payload
    const payload = JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    const options: https.RequestOptions = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const exec = async (): Promise<TelegramApiResponse<TelegramSentMessage>> =>
      new Promise((resolve, reject) => {
        // Avoid logging tokens, chat IDs, or message text
        // Limited, non-sensitive telemetry:
        // eslint-disable-next-line no-console
        console.log(`Sending Telegram message (length=${text.length})`);

        const req = https.request(options, res => {
          let responseBody = '';
          res.on('data', (chunk: Buffer) => {
            responseBody += chunk.toString('utf8');
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(responseBody) as TelegramApiResponse<TelegramSentMessage>;
              if (res.statusCode === 200 && parsed.ok === true) {
                resolve(parsed);
              } else {
                const description =
                  parsed.ok === false && parsed.description ? parsed.description : responseBody;
                const err = new Error(`Telegram API error ${res.statusCode}: ${description}`);
                (err as Error & { statusCode?: number }).statusCode = res.statusCode ?? 0;
                reject(err);
              }
            } catch (e) {
              const err = e instanceof Error ? e : new Error('Malformed Telegram API response');
              reject(err);
            }
          });
        });

        req.on('error', (e: Error) => {
          reject(e);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.setTimeout(timeoutMs);
        req.write(payload);
        req.end();
      });

    // Retry once on 5xx per testing requirements
    try {
      return await exec();
    } catch (e) {
      const status = (e as Error & { statusCode?: number }).statusCode ?? 0;
      if (status >= 500) {
        // eslint-disable-next-line no-console
        console.warn('Retrying Telegram API after 5xx');
        return await exec();
      }
      throw e;
    }
  }
}
