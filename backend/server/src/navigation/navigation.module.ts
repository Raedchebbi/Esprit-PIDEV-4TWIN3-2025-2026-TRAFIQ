// ── TRAFIQ — Navigation Module ────────────────────────────────────────────────
// Session management + public WebSocket gateway for citizen navigation.

import { Module, forwardRef } from '@nestjs/common';
import { NavigationController } from './navigation.controller';
import { NavigationService } from './navigation.service';
import { PublicGateway } from './public.gateway';
import { CentralSessionService } from './central-session.service';
import { AccidentsModule } from '../accidents/accidents.module';
import { CamerasModule } from '../cameras/cameras.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [AccidentsModule, CamerasModule, forwardRef(() => RiskModule)],
  controllers: [NavigationController],
  providers: [NavigationService, PublicGateway, CentralSessionService],
  exports: [NavigationService, PublicGateway, CentralSessionService],
})
export class NavigationModule {}
