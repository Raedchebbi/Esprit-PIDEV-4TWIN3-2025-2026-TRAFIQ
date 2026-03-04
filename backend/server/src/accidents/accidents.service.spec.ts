import { Test, TestingModule } from '@nestjs/testing';
import { AccidentsService } from './accidents.service';

describe('AccidentsService', () => {
  let service: AccidentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccidentsService],
    }).compile();

    service = module.get<AccidentsService>(AccidentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
