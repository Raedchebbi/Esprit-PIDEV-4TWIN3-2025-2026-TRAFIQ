import { Test, TestingModule } from '@nestjs/testing';
import { AccidentsController } from './accidents.controller';
import { AccidentsService } from './accidents.service';
import { CamerasService } from '../cameras/cameras.service';

describe('AccidentsController', () => {
  let controller: AccidentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccidentsController],
      providers: [
        {
          provide: AccidentsService,
          useValue: {},
        },
        {
          provide: CamerasService,
          useValue: {
            getCameraIdsForCountry: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AccidentsController>(AccidentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
