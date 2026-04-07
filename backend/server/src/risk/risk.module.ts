import { Module } from '@nestjs/common';
import { RiskGateway } from './risk.gateway';

@Module({
  providers: [RiskGateway],
})
export class RiskModule {}
