import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccidentDocument = Accident & Document;

@Schema()
export class Accident {
  @Prop() incident_id: string;
  @Prop() incident_type: string;
  @Prop() timestamp: string;
  @Prop() snapshot: string;
  @Prop() vehicle_a: number;
  @Prop() vehicle_b: number;
  @Prop() iou: number;
  @Prop() confidence: number;
}

export const AccidentSchema = SchemaFactory.createForClass(Accident);