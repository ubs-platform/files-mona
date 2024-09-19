import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { FileModel } from './file.schema';

@Schema()
export class EntityProperty {
  @Prop(String)
  entityGroup: String;
  @Prop(String)
  entityName: String;
  @Prop({ type: Number, default: 3000000 })
  maxFileSizeBytes: number;
  @Prop([String])
  acceptedType: String[];
}

export type FileDoc = FileModel & Document;
export const FileSchema = SchemaFactory.createForClass(FileModel);
