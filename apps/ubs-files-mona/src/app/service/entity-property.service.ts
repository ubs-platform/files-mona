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
    @Inject(EntityProperty.name) private entityProperty: Model<EntityProperty>
  ) {}

  async update(ep: EntityPropertyDto) {}
}
