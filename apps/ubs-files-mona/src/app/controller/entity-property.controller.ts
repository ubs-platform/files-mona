import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { EntityPropertyDto } from '../dto/entity-property-dto';
import { EntityPropertyService } from '../service/entity-property.service';

@Controller('entity-property')
export class ImageFileController {
  constructor(private epService: EntityPropertyService) {}
  //BURDASIN

  @EventPattern('register-category')
  registerCategory(ep: EntityPropertyDto) {
    this.epService.update(ep);
  }
}
