import { Controller, Post, Body, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { TelegramService } from './telegram.service';

@Controller('webhook')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private usersService: UsersService,
    private telegramService: TelegramService,
  ) {}

  @Post('telegram')
  async handleWebhook(@Body() body: any) {
    try {
      const message = body.message;
      if (!message || !message.text) return { ok: true };

      const chatId = String(message.chat.id);
      const text = message.text.trim();

      // Handle /start <CODE>
      if (text.startsWith('/start ')) {
        const code = text.replace('/start ', '').trim();

        if (!code || code.length < 4) {
          await this.telegramService.sendMessage(chatId,
            '❌ Kode tidak valid. Pastikan format: /start KODE');
          return { ok: true };
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
      this.logger.error('Telegram webhook error', error);
    }

    return { ok: true };
  }
}
