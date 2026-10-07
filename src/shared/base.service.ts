import {
  DeepPartial,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
  BaseRepository,
  PaginatedResult,
  PaginationOptions,
} from '../common/repositories/base.repository';

export abstract class BaseService<
  T extends ObjectLiteral,
  R extends BaseRepository<T> = BaseRepository<T>,
> {
  constructor(protected readonly repository: R) {}

  async findWithPagination(
    options: PaginationOptions<T>,
  ): Promise<PaginatedResult<T>> {
    return this.repository.findWithPagination(options);
  }

  async findAll(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.findAll(options);
  }

  async findById(
    id: string | number,
    options?: FindOneOptions<T>,
  ): Promise<T | null> {
    return this.repository.findById(id, options);
  }

  async create(data: DeepPartial<T>): Promise<T> {
    return this.repository.create(data);
  }

  async update(
    id: string | number,
    data: QueryDeepPartialEntity<T>,
  ): Promise<T | null> {
    return this.repository.update(id, data);
  }

  async delete(id: string | number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async softDelete(id: string | number): Promise<boolean> {
    return this.repository.softDelete(id);
  }
}
