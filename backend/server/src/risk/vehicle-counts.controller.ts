import { Controller, Get } from '@nestjs/common';
import { VehicleCountsStore } from './vehicle-counts.store';

@Controller('vehicle-counts')
export class VehicleCountsController {
  constructor(private readonly store: VehicleCountsStore) {}

  @Get()
  getLatest() {
    return this.store.getLatest();
  }
}
