import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { LoginDto } from './dto/auth.dto';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../common/constants';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.usersRepository.findOne({
      where: { email: dto.email, isActive: true },
    });

    if (!user) {
      await this.auditService.log({
        action: 'user.login_failed',
        entityType: 'users',
        entityId: 'unknown',
        newValue: { email: dto.email, reason: 'user_not_found' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau password salah.',
      });
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.auditService.log({
        action: 'user.login_failed',
        entityType: 'users',
        entityId: user.id,
        newValue: { email: dto.email, reason: 'invalid_password' },
        ipAddress: ip,
        userAgent,
      });
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau password salah.',
      });
    }

    const tokens = await this.generateTokens(user);

    // Save refresh token hash
    const refreshHash = await bcrypt.hash(tokens.refresh_token, 10);
    await this.usersRepository.update(user.id, {
      refreshTokenHash: refreshHash,
      lastLoginAt: new Date(),
    });

    await this.auditService.log({
      userId: user.id,
      action: 'user.login',
      entityType: 'users',
      entityId: user.id,
      ipAddress: ip,
      userAgent,
    });

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: 3600,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        has_telegram: !!user.telegramChatId,
      },
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const user = await this.usersRepository.findOne({
        where: { id: payload.sub, isActive: true },
      });

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException();
      }

      const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!isValid) {
        throw new UnauthorizedException();
      }

      const tokens = await this.generateTokens(user);
      const refreshHash = await bcrypt.hash(tokens.refresh_token, 10);
      await this.usersRepository.update(user.id, { refreshTokenHash: refreshHash });

      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: 3600,
      };
    } catch {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Sesi kamu sudah habis. Silakan login kembali.',
      });
    }
  }

  async logout(userId: string) {
    await this.usersRepository.update(userId, { refreshTokenHash: null });
    return { message: 'Berhasil keluar.' };
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRY', '1h') as any,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any,
      }),
    ]);

    return { access_token, refresh_token };
  }

  async seedAdmin() {
    const defaultEmail = 'admin@tiktokmanager.com';
    const defaultPassword = 'Admin123!';

    // Cek apakah ada user admin sama sekali
    const existingAdmin = await this.usersRepository.findOne({
      where: { role: 'admin' as any },
    });

    if (!existingAdmin) {
      // Belum ada admin → buat baru
      const hash = await bcrypt.hash(defaultPassword, 12);
      await this.usersRepository.save({
        email: defaultEmail,
        passwordHash: hash,
        fullName: 'Administrator',
        role: UserRole.ADMIN,
        isActive: true,
      });
      this.logger.log(`Admin seed created: ${defaultEmail} / ${defaultPassword}`);
      return;
    }

    // Admin sudah ada → pastikan email default ada dan aktif
    const defaultAdmin = await this.usersRepository.findOne({
      where: { email: defaultEmail },
    });

    if (!defaultAdmin) {
      // Email default tidak ada (mungkin dihapus/diubah) → buat ulang
      const hash = await bcrypt.hash(defaultPassword, 12);
      await this.usersRepository.save({
        email: defaultEmail,
        passwordHash: hash,
        fullName: 'Administrator',
        role: UserRole.ADMIN,
        isActive: true,
      });
      this.logger.log(`Admin seed re-created: ${defaultEmail} / ${defaultPassword}`);
    } else if (!defaultAdmin.isActive) {
      // Admin ada tapi non-aktif → aktifkan kembali dan reset password
      const hash = await bcrypt.hash(defaultPassword, 12);
      defaultAdmin.isActive = true;
      defaultAdmin.passwordHash = hash;
      await this.usersRepository.save(defaultAdmin);
      this.logger.log(`Admin seed reactivated & password reset: ${defaultEmail} / ${defaultPassword}`);
    } else {
      this.logger.log(`Admin exists: ${defaultAdmin.email} (active)`);
    }
  }
}
