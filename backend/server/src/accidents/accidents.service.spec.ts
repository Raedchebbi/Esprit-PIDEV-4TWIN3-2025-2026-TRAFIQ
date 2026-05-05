import { Test, TestingModule } from '@nestjs/testing';
import { MongoPrimaryRepository } from '../mongodb/mongo-primary.repository';
import { AccidentsService } from './accidents.service';

describe('AccidentsService', () => {
  let service: AccidentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccidentsService,
        {
          provide: MongoPrimaryRepository,
          useValue: { isPrimaryEnabled: jest.fn(() => false) },
        },
      ],
    }).compile();

    service = module.get<AccidentsService>(AccidentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
