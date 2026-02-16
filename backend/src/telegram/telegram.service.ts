import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private botToken: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  async sendMessage(chatId: string, text: string, url?: string): Promise<string | undefined> {
    if (!this.botToken || this.botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
      this.logger.warn('Telegram bot token not configured, skipping notification');
      return undefined;
    }

    try {
      const { default: axios } = await import('axios');

      const inlineKeyboard = url
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: '👉 Buka Halaman Eksekusi', url }],
              ],
            },
          }
        : {};

      const response = await axios.post(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          ...inlineKeyboard,
        },
        { timeout: 10000 },
      );

      return String(response.data.result.message_id);
    } catch (error: any) {
      this.logger.error(`Failed to send Telegram message to ${chatId}`, error?.response?.data || error.message);
      throw error;
    }
  }
}
