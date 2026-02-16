import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Content, AiOption } from './entities/content.entity';
import { ContentStatus } from '../common/constants';
import { AiGeneratorService } from './ai-generator.service';

@Injectable()
export class ContentsService {
  constructor(
    @InjectRepository(Content)
    private contentsRepo: Repository<Content>,
    private aiGeneratorService: AiGeneratorService,
  ) {}

  async findAll(filters?: { status?: string; tiktok_account_id?: string; page?: number; limit?: number }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    const qb = this.contentsRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.tiktokAccount', 'ta')
      .leftJoinAndSelect('c.createdByUser', 'u');

    if (filters?.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters?.tiktok_account_id) {
      qb.andWhere('c.tiktokAccountId = :aid', { aid: filters.tiktok_account_id });
    }

    const [items, total] = await qb
      .orderBy('c.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, meta: { page, limit, total } };
  }

  async findOne(id: string) {
    const content = await this.contentsRepo.findOne({
      where: { id },
      relations: ['tiktokAccount', 'createdByUser'],
    });
    if (!content) throw new NotFoundException('Konten tidak ditemukan.');
    return content;
  }

  async create(data: {
    tiktok_account_id: string;
    drive_url?: string;
    brief_topic: string;
    brief_points: string[];
    target_audience?: string;
    tone?: string;
    niche_template: string;
  }, userId: string) {
    // Normalize brief_points: allow string or array, minimum 1 item
    let points = data.brief_points;
    if (typeof points === 'string') {
      points = (points as string).split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (!points || !Array.isArray(points) || points.length === 0) {
      points = [data.brief_topic]; // Fallback: use topic as single point
    }

    const content = this.contentsRepo.create({
      tiktokAccountId: data.tiktok_account_id,
      driveUrl: data.drive_url || null,
      briefTopic: data.brief_topic,
      briefPoints: points,
      targetAudience: data.target_audience,
      tone: data.tone,
      nicheTemplate: data.niche_template as any,
      createdBy: userId,
      status: ContentStatus.DRAFT,
    });

    return this.contentsRepo.save(content);
  }

  async update(id: string, data: any) {
    const content = await this.findOne(id);
    if (content.status === ContentStatus.USED) {
      throw new BadRequestException('Konten sudah digunakan, tidak bisa diubah.');
    }

    if (data.brief_topic) content.briefTopic = data.brief_topic;
    if (data.brief_points) content.briefPoints = data.brief_points;
    if (data.target_audience !== undefined) content.targetAudience = data.target_audience;
    if (data.tone !== undefined) content.tone = data.tone;
    if (data.drive_url) content.driveUrl = data.drive_url;
    if (data.final_caption !== undefined) content.finalCaption = data.final_caption;
    if (data.final_hashtags !== undefined) {
      content.finalHashtags = data.final_hashtags.map((h: string) => h.replace(/^#/, ''));
    }

    return this.contentsRepo.save(content);
  }

  async remove(id: string) {
    const content = await this.findOne(id);
    if (content.status === ContentStatus.USED) {
      throw new BadRequestException('Konten sudah digunakan, tidak bisa dihapus.');
    }
    await this.contentsRepo.remove(content);
    return { message: 'Konten berhasil dihapus.' };
  }

  async suggestBrief(data: { niche_template: string; drive_url?: string }) {
    return this.aiGeneratorService.suggestBrief(data.niche_template, data.drive_url);
  }

  async generateAi(id: string, customPrompt?: string) {
    const content = await this.findOne(id);

    const options = await this.aiGeneratorService.generateOptions({
      briefTopic: content.briefTopic,
      briefPoints: content.briefPoints,
      targetAudience: content.targetAudience || undefined,
      tone: content.tone || undefined,
      nicheTemplate: content.nicheTemplate,
      customPrompt,
    });

    content.aiOptions = options;
    content.status = ContentStatus.AI_GENERATED;
    await this.contentsRepo.save(content);

    return {
      content_id: content.id,
      options,
      status: content.status,
    };
  }

  async finalize(id: string, data: {
    selected_option_index: number;
    final_caption: string;
    final_hashtags: string[];
  }) {
    const content = await this.findOne(id);

    if (!content.aiOptions || content.aiOptions.length === 0) {
      throw new BadRequestException({
        code: 'CONTENT_NOT_READY',
        message: 'Konten belum di-generate AI. Generate terlebih dahulu.',
      });
    }

    if (data.selected_option_index < 0 || data.selected_option_index > 4) {
      throw new BadRequestException('Index opsi harus 0–4.');
    }

    if (!data.final_hashtags || data.final_hashtags.length === 0) {
      throw new BadRequestException({
        code: 'HASHTAGS_COUNT_INVALID',
        message: 'Hashtag tidak boleh kosong.',
      });
    }

    // Remove # from hashtags if present
    const cleanHashtags = data.final_hashtags.map(h => h.replace(/^#/, ''));

    content.selectedOptionIndex = data.selected_option_index;
    content.finalCaption = data.final_caption;
    content.finalHashtags = cleanHashtags;
    content.status = ContentStatus.READY;

    await this.contentsRepo.save(content);

    // Build copy text
    const copyText = `${content.finalCaption}\n\n${cleanHashtags.map(h => '#' + h).join(' ')}`;

    return {
      id: content.id,
      status: content.status,
      final_caption: content.finalCaption,
      final_hashtags: content.finalHashtags,
      copy_text: copyText,
    };
  }

  async getCopyText(id: string) {
    const content = await this.findOne(id);
    if (!content.finalCaption || !content.finalHashtags) {
      throw new BadRequestException({
        code: 'CONTENT_NOT_READY',
        message: 'Konten belum di-finalize. Selesaikan caption & hashtag terlebih dahulu.',
      });
    }
    return {
      copy_text: `${content.finalCaption}\n\n${content.finalHashtags.map(h => '#' + h).join(' ')}`,
    };
  }
}
