import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TiktokAccount } from './entities/tiktok-account.entity';
import { NicheType } from '../common/constants';

@Injectable()
export class TiktokAccountsService {
  constructor(
    @InjectRepository(TiktokAccount)
    private accountsRepo: Repository<TiktokAccount>,
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

    return qb.orderBy('a.username', 'ASC').getMany();
  }

  async findOne(id: string) {
    const account = await this.accountsRepo.findOne({
      where: { id },
      relations: ['defaultOperator'],
    });
    if (!account) throw new NotFoundException('Akun TikTok tidak ditemukan.');
    return account;
  }

  async create(data: {
    username: string;
    display_name?: string;
    niche: NicheType;
    default_operator_id?: string;
    notes?: string;
  }) {
    const account = this.accountsRepo.create({
      username: data.username,
      displayName: data.display_name,
      niche: data.niche,
      defaultOperatorId: data.default_operator_id,
      notes: data.notes,
    });
    return this.accountsRepo.save(account);
  }

  async update(id: string, data: any) {
    const account = await this.findOne(id);
    if (data.username) account.username = data.username;
    if (data.display_name !== undefined) account.displayName = data.display_name;
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
    return { message: 'Akun berhasil dinonaktifkan.' };
  }

  async bulkReassign(operatorId: string, accountIds: string[]) {
    await this.accountsRepo.update(
      { id: In(accountIds) },
      { defaultOperatorId: operatorId },
    );
    return { message: `${accountIds.length} akun berhasil di-reassign.` };
  }

  async getActiveAccounts(accountIds?: string[]) {
    const where: any = { isActive: true };
    if (accountIds && accountIds.length > 0) {
      where.id = In(accountIds);
    }
    return this.accountsRepo.find({
      where,
      relations: ['defaultOperator'],
      order: { username: 'ASC' },
    });
  }
}
