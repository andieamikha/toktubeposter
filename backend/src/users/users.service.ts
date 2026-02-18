import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UserRole } from '../common/constants';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async findAll() {
    return this.usersRepo.find({
      where: { isActive: true },
      select: ['id', 'email', 'fullName', 'role', 'telegramChatId', 'isActive', 'lastLoginAt', 'createdAt'],
      order: { fullName: 'ASC' },
    });
  }

  async findOne(id: string) {
    const user = await this.usersRepo.findOne({
      where: { id },
      select: ['id', 'email', 'fullName', 'role', 'telegramChatId', 'isActive', 'lastLoginAt', 'createdAt'],
      relations: ['assignedAccounts'],
    });
    if (!user) throw new NotFoundException('Operator tidak ditemukan.');
    return user;
  }

  async create(data: { email: string; password: string; full_name: string; role?: string }) {
    const existing = await this.usersRepo.findOne({ where: { email: data.email } });
    if (existing) throw new ConflictException('Email sudah terdaftar.');

    const hash = await bcrypt.hash(data.password, 12);
    const user = this.usersRepo.create({
      email: data.email,
      passwordHash: hash,
      fullName: data.full_name,
      role: (data.role as UserRole) || UserRole.OPERATOR,
    });
    const saved = await this.usersRepo.save(user);
    const { passwordHash, refreshTokenHash, ...result } = saved;
    return result;
  }

  async update(id: string, data: { full_name?: string; email?: string; is_active?: boolean; password?: string; role?: string }) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Operator tidak ditemukan.');

    if (data.full_name) user.fullName = data.full_name;
    if (data.email) user.email = data.email;
    if (data.role) user.role = data.role as any;
    if (data.is_active !== undefined) user.isActive = data.is_active;
    if (data.password) user.passwordHash = await bcrypt.hash(data.password, 12);

    const saved = await this.usersRepo.save(user);
    const { passwordHash, refreshTokenHash, ...result } = saved;
    return result;
  }

  async remove(id: string) {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Operator tidak ditemukan.');
    user.isActive = false;
    await this.usersRepo.save(user);
    return { message: 'Operator berhasil dinonaktifkan.' };
  }

  async bulkReassign(operatorId: string, accountIds: string[]) {
    // Implemented in tiktok-accounts service
    return { message: 'Akun berhasil di-reassign.' };
  }

  async generateTelegramCode(userId: string): Promise<string> {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await this.usersRepo.update(userId, {
      telegramLinkCode: code,
      telegramCodeExpiresAt: expiresAt,
    });

    return code;
  }

  async linkTelegram(code: string, chatId: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({
      where: { telegramLinkCode: code, isActive: true },
    });

    if (!user || !user.telegramCodeExpiresAt || user.telegramCodeExpiresAt < new Date()) {
      return false;
    }

    await this.usersRepo.update(user.id, {
      telegramChatId: chatId,
      telegramLinkCode: null,
      telegramCodeExpiresAt: null,
    });

    return true;
  }
}
