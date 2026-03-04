import { ConfigService } from '@nestjs/config';

export const getMongoConfig = (configService: ConfigService) => ({
  uri: configService.get<string>('MONGODB_URI'),
});
