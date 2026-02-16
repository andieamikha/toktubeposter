import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { YoutubeAccount } from './entities/youtube-account.entity';
import { NicheType } from '../common/constants';

@Injectable()
export class YoutubeAccountsService {
  constructor(
    @InjectRepository(YoutubeAccount)
    private accountsRepo: Repository<YoutubeAccount>,
  ) {}

  async findAll(filters?: { niche?: string; operator_id?: string }) {
    const qb = this.accountsRepo.createQueryBuilder('a')
      .leftJoinAndSelect('a.defaultOperator', 'op')
      .where('a.isActive = :active', { active: true });

    if (filters?.niche) {
      qb.andWhere('a.niche = :niche', { niche: filters.niche });
    }
    if (filters?.operator_id) {
      qb.andWhere('a.defaultOperatorId = :opId', { opId: filters.operator_id });
    }

    return qb.orderBy('a.channelName', 'ASC').getMany();
  }

  async findOne(id: string) {
    const account = await this.accountsRepo.findOne({
      where: { id },
      relations: ['defaultOperator'],
    });
    if (!account) throw new NotFoundException('Akun YouTube tidak ditemukan.');
    return account;
  }

  async create(data: {
    channel_name: string;
    channel_url?: string;
    email?: string;
    niche: NicheType;
    default_operator_id?: string;
    notes?: string;
  }) {
    const account = this.accountsRepo.create({
      channelName: data.channel_name,
      channelUrl: data.channel_url,
      email: data.email,
      niche: data.niche,
      defaultOperatorId: data.default_operator_id,
      notes: data.notes,
    });
    return this.accountsRepo.save(account);
  }

  async update(id: string, data: any) {
    const account = await this.findOne(id);
    if (data.channel_name) account.channelName = data.channel_name;
    if (data.channel_url !== undefined) account.channelUrl = data.channel_url;
    if (data.email !== undefined) account.email = data.email;
    if (data.niche) account.niche = data.niche;
    if (data.default_operator_id !== undefined) account.defaultOperatorId = data.default_operator_id;
    if (data.notes !== undefined) account.notes = data.notes;
    if (data.is_active !== undefined) account.isActive = data.is_active;
    return this.accountsRepo.save(account);
  }

  async remove(id: string) {
    const account = await this.findOne(id);
    account.isActive = false;
    await this.accountsRepo.save(account);
    return { message: 'Akun YouTube berhasil dinonaktifkan.' };
  }
}
