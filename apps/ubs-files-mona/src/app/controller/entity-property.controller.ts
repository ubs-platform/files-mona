import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { EntityPropertyDto } from '../dto/entity-property-dto';
import { EntityPropertyService } from '../service/entity-property.service';
import { exec } from 'child_process';

@Controller()
export class EntityPropertyController {
  constructor(private epService: EntityPropertyService) {}
  //BURDASIN

  @EventPattern('register-category')
  registerCategory(ep: EntityPropertyDto) {
    console.info('Registering category', ep.category);
    exec(`kdialog --passivepopup 'register-category ${ep.category}' 5`);
    this.epService.update(ep);
  }
}
