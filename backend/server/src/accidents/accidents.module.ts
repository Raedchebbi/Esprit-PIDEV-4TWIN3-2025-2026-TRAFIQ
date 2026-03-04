import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccidentsController } from './accidents.controller';
import { AccidentsService } from './accidents.service';
import { Accident, AccidentSchema } from './accident.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Accident.name, schema: AccidentSchema }])],
  controllers: [AccidentsController],
  providers: [AccidentsService],
})
export class AccidentsModule {}