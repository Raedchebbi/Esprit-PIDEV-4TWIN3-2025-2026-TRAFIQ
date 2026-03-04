import { Test, TestingModule } from '@nestjs/testing';
import { AccidentsController } from './accidents.controller';

describe('AccidentsController', () => {
  let controller: AccidentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccidentsController],
    }).compile();

    controller = module.get<AccidentsController>(AccidentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
