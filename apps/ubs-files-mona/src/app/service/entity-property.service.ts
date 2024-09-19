import { Inject, Injectable } from '@nestjs/common';
import { EntityProperty } from '../model/entity-property.schema';
import { Model } from 'mongoose';
import { EntityPropertyDto } from '../dto/entity-property-dto';

@Injectable()
export class EntityPropertyService {
  /**
   *
   */
  constructor(
    @Inject(EntityProperty.name)
    private entityPropertyModel: Model<EntityProperty>
  ) {}

  async update(ep: EntityPropertyDto) {
    let model = await this.entityPropertyModel.findOne({
      entityGroup: ep.entityGroup,
      entityName: ep.entityName,
    });
    if (!model) {
      model = new this.entityPropertyModel();
      model.entityGroup = ep.entityGroup;
      model.entityName = ep.entityName;
    }
    model.acceptedType = ep.acceptedType;
    model.maxFileSizeBytes = ep.maxFileSizeBytes;
    model.volatileAtInitialized = ep.volatileAtInitialized;
    const finalVal = await model.save();
    return {
      entityGroup: finalVal.entityGroup,
      entityName: finalVal.entityName,
      volatileAtInitialized: finalVal.volatileAtInitialized,
      acceptedType: finalVal.acceptedType,
    } as EntityPropertyDto;
  }
}
