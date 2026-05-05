import { ConfigService } from '@nestjs/config';
import { MongoDbService } from './mongodb.service';
import { MongoPrimaryRepository } from './mongo-primary.repository';

describe('MongoPrimaryRepository', () => {
  it('is disabled unless MongoDB is connected and USE_MONGO_AS_PRIMARY is true', () => {
    const repo = new MongoPrimaryRepository(
      { get: jest.fn(() => 'true') } as unknown as ConfigService,
      { isConnected: jest.fn(() => false) } as unknown as MongoDbService,
    );

    expect(repo.isPrimaryEnabled()).toBe(false);
  });

  it('is enabled only when MongoDB is connected and flag is true', () => {
    const repo = new MongoPrimaryRepository(
      { get: jest.fn(() => 'true') } as unknown as ConfigService,
      { isConnected: jest.fn(() => true) } as unknown as MongoDbService,
    );

    expect(repo.isPrimaryEnabled()).toBe(true);
  });
});
