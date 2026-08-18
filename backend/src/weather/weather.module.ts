import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteContent } from '../entities/site-content.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { WeatherSample } from '../entities/weather-sample.entity';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';

@Module({
  imports: [TypeOrmModule.forFeature([WeatherSample, SiteContent, HealthReading])],
  controllers: [WeatherController],
  providers: [WeatherService],
  exports: [WeatherService],
})
export class WeatherModule {}
