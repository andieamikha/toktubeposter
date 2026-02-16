import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, In } from 'typeorm';
import { ScheduledPost } from './entities/scheduled-post.entity';
import { Content } from '../contents/entities/content.entity';
import {
  PostStatus, ContentStatus, TIKTOK_URL_REGEX,
  POSTING_WINDOW, MIN_POST_GAP_HOURS,
} from '../common/constants';

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(ScheduledPost)
    private schedulesRepo: Repository<ScheduledPost>,
    @InjectRepository(Content)
    private contentsRepo: Repository<Content>,
  ) {}

  async findAll(filters?: {
    date?: string; status?: string; operator_id?: string;
    tiktok_account_id?: string; page?: number; limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;

    const qb = this.schedulesRepo.createQueryBuilder('s')
      .leftJoinAndSelect('s.content', 'c')
      .leftJoinAndSelect('s.tiktokAccount', 'ta')
      .leftJoinAndSelect('s.assignedOperator', 'op');

    if (filters?.date) {
      // Filter by date in WIB (UTC+7)
      const startUtc = new Date(`${filters.date}T00:00:00+07:00`);
      const endUtc = new Date(`${filters.date}T23:59:59+07:00`);
      qb.andWhere('s.scheduledAt BETWEEN :start AND :end', { start: startUtc, end: endUtc });
    }

    if (filters?.status) {
      qb.andWhere('s.status = :status', { status: filters.status });
    }
    if (filters?.operator_id) {
      qb.andWhere('s.assignedOperatorId = :opId', { opId: filters.operator_id });
    }
    if (filters?.tiktok_account_id) {
      qb.andWhere('s.tiktokAccountId = :taId', { taId: filters.tiktok_account_id });
    }

    const [items, total] = await qb
      .orderBy('s.scheduledAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string) {
    const schedule = await this.schedulesRepo.findOne({
      where: { id },
      relations: ['content', 'tiktokAccount', 'assignedOperator'],
    });
    if (!schedule) throw new NotFoundException('Jadwal tidak ditemukan.');
    return schedule;
  }

  async create(data: {
    content_id: string;
    tiktok_account_id: string;
    assigned_operator_id: string;
    scheduled_at: string;
    notes?: string;
  }, userId: string) {
    const scheduledAt = new Date(data.scheduled_at);

    // Validate future time
    if (scheduledAt <= new Date()) {
      throw new BadRequestException({
        code: 'SCHEDULE_IN_PAST',
        message: 'Tidak bisa membuat jadwal di waktu yang sudah lewat.',
      });
    }

    // Validate posting window (08:00-22:00 WIB)
    const wibHour = (scheduledAt.getUTCHours() + 7) % 24;
    if (wibHour < POSTING_WINDOW.START_HOUR_WIB || wibHour >= POSTING_WINDOW.END_HOUR_WIB) {
      throw new BadRequestException({
        code: 'SCHEDULE_OUTSIDE_WINDOW',
        message: 'Jadwal harus berada dalam rentang 08:00 – 22:00 WIB.',
      });
    }

    // Check content is ready
    const content = await this.contentsRepo.findOne({ where: { id: data.content_id } });
    if (!content) throw new NotFoundException('Konten tidak ditemukan.');

    if (content.status !== ContentStatus.READY) {
      throw new BadRequestException({
        code: 'CONTENT_NOT_READY',
        message: 'Konten belum di-finalize. Selesaikan caption & hashtag terlebih dahulu.',
      });
    }

    if (content.tiktokAccountId !== data.tiktok_account_id) {
      throw new BadRequestException('Konten tidak sesuai dengan akun TikTok.');
    }

    // Check content not already scheduled
    const existingSchedule = await this.schedulesRepo.findOne({
      where: { contentId: data.content_id },
    });
    if (existingSchedule) {
      throw new BadRequestException({
        code: 'CONTENT_ALREADY_USED',
        message: 'Konten ini sudah digunakan untuk jadwal lain.',
      });
    }

    // Check 2-hour gap
    await this.validateGap(data.tiktok_account_id, scheduledAt);

    const schedule = this.schedulesRepo.create({
      contentId: data.content_id,
      tiktokAccountId: data.tiktok_account_id,
      assignedOperatorId: data.assigned_operator_id,
      scheduledAt,
      createdBy: userId,
      notes: data.notes,
    });

    const saved = await this.schedulesRepo.save(schedule);

    // Mark content as used
    await this.contentsRepo.update(data.content_id, {
      status: ContentStatus.USED,
      usedCount: () => 'used_count + 1',
    } as any);

    return this.findOne(saved.id);
  }

  async update(id: string, data: any) {
    const schedule = await this.findOne(id);

    if (schedule.status !== PostStatus.SCHEDULED) {
      throw new BadRequestException('Jadwal hanya bisa diubah jika masih berstatus terjadwal.');
    }

    if (data.assigned_operator_id) schedule.assignedOperatorId = data.assigned_operator_id;
    if (data.scheduled_at) {
      const newTime = new Date(data.scheduled_at);
      await this.validateGap(schedule.tiktokAccountId, newTime, id);
      schedule.scheduledAt = newTime;
    }
    if (data.notes !== undefined) schedule.notes = data.notes;

    return this.schedulesRepo.save(schedule);
  }

  async cancel(id: string) {
    const schedule = await this.findOne(id);
    if (schedule.status === PostStatus.DONE || schedule.status === PostStatus.CANCELED) {
      throw new BadRequestException('Jadwal sudah selesai atau dibatalkan.');
    }

    schedule.status = PostStatus.CANCELED;
    await this.schedulesRepo.save(schedule);

    // Release content back to ready
    await this.contentsRepo.update(schedule.contentId, { status: ContentStatus.READY });

    return { message: 'Jadwal berhasil dibatalkan.' };
  }

  async markDone(id: string, tiktokUrl: string, operatorId: string) {
    const schedule = await this.findOne(id);

    // Validate operator
    if (schedule.assignedOperatorId !== operatorId) {
      throw new ForbiddenException('Kamu tidak memiliki akses untuk menyelesaikan tugas ini.');
    }

    // Validate status
    const allowedStatuses = [PostStatus.DUE, PostStatus.OVERDUE, PostStatus.MISSED];
    if (!allowedStatuses.includes(schedule.status)) {
      throw new BadRequestException({
        code: 'CANNOT_MARK_DONE',
        message: 'Posting ini belum waktunya atau sudah selesai/dibatalkan.',
      });
    }

    // Validate URL
    if (!TIKTOK_URL_REGEX.test(tiktokUrl)) {
      throw new BadRequestException({
        code: 'INVALID_TIKTOK_URL',
        message: 'URL TikTok wajib diawali https://www.tiktok.com/ — link pendek atau format lain tidak diterima.',
      });
    }

    schedule.status = PostStatus.DONE;
    schedule.tiktokUrl = tiktokUrl;
    schedule.postedAt = new Date();

    return this.schedulesRepo.save(schedule);
  }

  async getMyTasks(operatorId: string, date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const startUtc = new Date(`${targetDate}T00:00:00+07:00`);
    const endUtc = new Date(`${targetDate}T23:59:59+07:00`);

    const tasks = await this.schedulesRepo.find({
      where: {
        assignedOperatorId: operatorId,
        scheduledAt: Between(startUtc, endUtc),
      },
      relations: ['content', 'tiktokAccount'],
      order: { scheduledAt: 'ASC' },
    });

    const summary = {
      total: tasks.length,
      scheduled: tasks.filter(t => t.status === PostStatus.SCHEDULED).length,
      due: tasks.filter(t => t.status === PostStatus.DUE).length,
      overdue: tasks.filter(t => t.status === PostStatus.OVERDUE).length,
      done: tasks.filter(t => t.status === PostStatus.DONE).length,
      missed: tasks.filter(t => t.status === PostStatus.MISSED).length,
      canceled: tasks.filter(t => t.status === PostStatus.CANCELED).length,
    };

    return { date: targetDate, summary, tasks };
  }

  private async validateGap(accountId: string, scheduledAt: Date, excludeId?: string) {
    const gapMs = MIN_POST_GAP_HOURS * 60 * 60 * 1000;
    const rangeStart = new Date(scheduledAt.getTime() - gapMs);
    const rangeEnd = new Date(scheduledAt.getTime() + gapMs);

    const qb = this.schedulesRepo.createQueryBuilder('s')
      .where('s.tiktokAccountId = :accountId', { accountId })
      .andWhere('s.scheduledAt BETWEEN :start AND :end', { start: rangeStart, end: rangeEnd })
      .andWhere('s.status != :canceled', { canceled: PostStatus.CANCELED });

    if (excludeId) {
      qb.andWhere('s.id != :excludeId', { excludeId });
    }

    const conflict = await qb.getOne();
    if (conflict) {
      throw new BadRequestException({
        code: 'SCHEDULE_GAP_VIOLATION',
        message: 'Jarak antar posting di akun ini minimal 2 jam. Silakan pilih waktu lain.',
      });
    }
  }
}
