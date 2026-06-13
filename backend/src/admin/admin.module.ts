import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ContentModule } from '../content/content.module';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthController, AdminContentController } from './admin.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    ContentModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AdminAuthController, AdminContentController],
  providers: [JwtStrategy, AdminAuthGuard],
})
export class AdminModule {}
