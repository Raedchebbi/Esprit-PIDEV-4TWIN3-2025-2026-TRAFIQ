import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AccidentsModule } from './accidents/accidents.module';
import { CamerasModule } from './cameras/cameras.module';
import { RiskModule } from './risk/risk.module';
import { AuthModule } from './auth/auth.module';
import { PublicApiModule } from './public-api/public-api.module';
import { NavigationModule } from './navigation/navigation.module';
import { MetricsModule } from './metrics/metrics.module';
import { MongoDbModule } from './mongodb/mongodb.module';
import { RedisModule } from './redis/redis.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    AuthModule,
    MetricsModule,
    MongoDbModule,
    RedisModule,
    RateLimitModule,
    AccidentsModule,
    CamerasModule,
    forwardRef(() => RiskModule),
    PublicApiModule,
    forwardRef(() => NavigationModule),
  ],
})
export class AppModule {}
