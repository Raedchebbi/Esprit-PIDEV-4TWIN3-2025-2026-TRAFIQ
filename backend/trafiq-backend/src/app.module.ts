import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MailerModule } from '@nestjs-modules/mailer';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const mailUser = configService.get('MAIL_USER');
        return {
          transport: {
            host: configService.get('MAIL_HOST'),
            port: +configService.get('MAIL_PORT'),
            ...(mailUser
              ? {
                  auth: {
                    user: mailUser,
                    pass: configService.get('MAIL_PASS'),
                  },
                }
              : {}),
          },
          defaults: {
            from: configService.get('MAIL_FROM'),
          },
          verifyTransporters: false,
        };
      },
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
