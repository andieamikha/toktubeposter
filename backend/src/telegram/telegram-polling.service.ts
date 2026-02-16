import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private botToken: string;
  private polling = false;
  private offset = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private telegramService: TelegramService,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
  }

  async onModuleInit() {
    if (!this.botToken || this.botToken === 'YOUR_TELEGRAM_BOT_TOKEN') {
      this.logger.warn('Telegram bot token not configured, polling disabled');
      return;
    }

    // Delete any existing webhook first so polling works
    try {
      const { default: axios } = await import('axios');
      await axios.post(`https://api.telegram.org/bot${this.botToken}/deleteWebhook`);
      this.logger.log('Deleted existing webhook, switching to polling mode');
    } catch (err) {
      this.logger.warn('Could not delete webhook', err);
    }

    this.polling = true;
    this.logger.log('Telegram polling started');
    this.poll();
  }

  onModuleDestroy() {
    this.polling = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.logger.log('Telegram polling stopped');
  }

  private async poll() {
    if (!this.polling) return;

    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(
        `https://api.telegram.org/bot${this.botToken}/getUpdates`,
        {
          params: {
            offset: this.offset,
            timeout: 10,
            allowed_updates: ['message'],
          },
          timeout: 15000,
        },
      );

      const updates = response.data?.result || [];

      for (const update of updates) {
        this.offset = update.update_id + 1;
        await this.handleUpdate(update);
      }
    } catch (error: any) {
      if (error.code !== 'ECONNABORTED') {
        this.logger.error('Polling error', error?.response?.data || error.message);
      }
    }

    // Schedule next poll
    if (this.polling) {
      this.pollTimer = setTimeout(() => this.poll(), 1000);
    }
  }

  private async handleUpdate(update: any) {
    try {
      const message = update.message;
      if (!message || !message.text) return;

      const chatId = String(message.chat.id);
      const text = message.text.trim();

      if (text.startsWith('/start ')) {
        const code = text.replace('/start ', '').trim();

        if (!code || code.length < 4) {
          await this.telegramService.sendMessage(chatId,
            '❌ Kode tidak valid. Pastikan format: /start KODE');
          return;
        }

        const linked = await this.usersService.linkTelegram(code, chatId);

        if (linked) {
          await this.telegramService.sendMessage(chatId,
            '✅ Telegram berhasil dihubungkan!\n\nKamu akan menerima notifikasi posting di sini.');
        } else {
          await this.telegramService.sendMessage(chatId,
            '❌ Kode link Telegram sudah kedaluwarsa atau tidak valid. Buat kode baru dari profil.');
        }
      } else if (text === '/start') {
        await this.telegramService.sendMessage(chatId,
          '👋 Halo! Saya bot TikTok Posting Manager.\n\nUntuk menghubungkan akun, kirim:\n/start KODE\n\nDapatkan kode dari halaman Profil di aplikasi.');
      }
    } catch (error) {
      this.logger.error('Error handling update', error);
    }
  }
}
