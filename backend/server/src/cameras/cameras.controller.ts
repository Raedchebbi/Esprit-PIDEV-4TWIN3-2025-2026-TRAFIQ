import { Controller, Get } from '@nestjs/common';
import { CamerasService } from './cameras.service';

@Controller('cameras')
export class CamerasController {
  constructor(private readonly camerasService: CamerasService) {}

  @Get()
  findAll() {
    return this.camerasService.findAll();
  }
}
