import {
  Repository,
  FindOptionsWhere,
  FindManyOptions,
  DeepPartial,
  ObjectLiteral,
  FindOneOptions,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

export interface PaginationOptions<T> {
  page?: number;
  pageSize?: number;
  where?: FindOptionsWhere<T> | FindOptionsWhere<T>[];
  order?: FindManyOptions<T>['order'];
  relations?: FindManyOptions<T>['relations'];
  select?: FindManyOptions<T>['select'];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export abstract class BaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly repository: Repository<T>) {}

  getRepository(): Repository<T> {
    return this.repository;
  }

  async findWithPagination(
    options: PaginationOptions<T>,
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || 10));
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.repository.findAndCount({
      where: options.where,
      order: options.order,
      relations: options.relations,
      select: options.select,
      skip,
      take: pageSize,
    });

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(options);
  }

  async findById(
    id: string | number,
    options?: FindOneOptions<T>,
  ): Promise<T | null> {
    const where = { id } as unknown as FindOptionsWhere<T>;
    return this.repository.findOne({
      where,
      ...options,
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(options);
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async createMany(data: DeepPartial<T>[]): Promise<T[]> {
    const entities = this.repository.create(data);
    return this.repository.save(entities);
  }

  async update(
    id: string | number,
    data: QueryDeepPartialEntity<T>,
  ): Promise<T | null> {
    await this.repository.update(id, data);
    return this.findById(id);
  }

  async delete(id: string | number): Promise<boolean> {
    const result = await this.repository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async softDelete(id: string | number): Promise<boolean> {
    const result = await this.repository.softDelete(id);
    return (result.affected ?? 0) > 0;
  }
}
