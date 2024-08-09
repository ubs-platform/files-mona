import {
  BadRequestException,
  Body,
  Controller,
  FileTypeValidator,
  Get,
  Inject,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileInformation } from '../dto/file-information';
import { FileService } from '../service/file.service';
import { ObjectId } from 'mongoose';
import { Response } from 'express';

import { UserDTO, UserGeneralInfoDTO } from '@ubs-platform/users-common';
import * as FileSystem from 'fs/promises';
import {
  ClientKafka,
  ClientProxy,
  ClientProxyFactory,
  ClientRMQ,
  MessagePattern,
} from '@nestjs/microservices';
import { FileRequest } from '../dto/file-request';
import { lastValueFrom } from 'rxjs';
import { Multer } from 'multer';
import { getMicroserviceConnection } from '@ubs-platform/nest-microservice-setup-util';
import {
  JwtAuthGuard,
  CurrentUser,
} from '@ubs-platform/users-mona-microservice-helper';
import { FileCategoryResponse } from '../dto/file-category-response';
import { FileVolatileTag } from '../dto/file-volatile-tag';
@Controller('file')
export class ImageFileController {
  uploadClients: { [key: string]: ClientProxy | ClientKafka | ClientRMQ } = {};
  volatileClients: { [key: string]: ClientProxy | ClientKafka | ClientRMQ } =
    {};
  potentialMalicousMimeTypes = [
    'application/x-msdownload',
    // 'application/octet-stream',
    'application/x-shellscript',
    'text/x-shellscript',
  ];
  potentialMalicousExtensions = [
    'exe',
    'apk',
    'sh',
    'bat',
    'ps1',
    'js',
    'bash',
    'zsh',
    'appimage',
    'pisi',
    'deb',
    'yum',
    'rpm',
  ];
  constructor(private fservice: FileService) {}

  @Put('/volatility')
  @UseGuards(JwtAuthGuard)
  async applyVolatilities(@Body() volatilities: FileVolatileTag[]) {
    for (let index = 0; index < volatilities.length; index++) {
      const volatile = volatilities[index];
      const catVolatileClient = this.generateTopicClientForVolatileChange(
        volatile.category
      );
      const topic = this.generateTopicForUpload({ e });

      catVolatileClient.send();
    }
    await this.fservice.updateVolatilities(volatilities);
    // this.checkMimeTypeAndExtension(file);
    // return await this.uploadFile1(file, params, user);
  }

  @Put('/:type/:objectId')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadFile(
    @UploadedFile() file: any,
    @Param() params: { type: string; objectId?: string },
    @CurrentUser() user: UserDTO
  ) {
    this.checkMimeTypeAndExtension(file);
    return await this.uploadFile1(file, params, user);
  }

  @Put('/:type')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadFileOnlyType(
    @UploadedFile() file: any,
    @Param() params: { type: string },
    @CurrentUser() user: UserDTO
  ) {
    this.checkMimeTypeAndExtension(file);
    return await this.uploadFile1(file, params, user);
  }

  @Get('/:category/:name')
  async fetchFileContent(
    @Param() params: { category: string; name: string },
    @Res() response: Response
  ) {
    const fil = await this.fservice.findByName(params.category, params.name);
    if (fil) {
      return response.status(200).contentType(fil.mimetype).send(fil.file);
    } else {
      return response.redirect('/assets/not-found.image.png');
    }
  }

  async uploadFile1(
    file: any,
    params: { type: string; objectId?: string },
    user: UserDTO
  ) {
    const topic = this.generateTopicForUpload(params);
    const client = this.generateTopicClientForUpload(topic);

    const categoryResponse: FileCategoryResponse = await lastValueFrom(
      client.send(topic, { userId: user.id, objectId: params.objectId })
    );
    const maxLimitBytes = categoryResponse.maxLimitBytes | 1000000;
    if (categoryResponse.category && categoryResponse.name) {
      console.info(file);
      this.assertFileLimit(maxLimitBytes, file);
      await this.fservice.uploadFile(
        {
          category: categoryResponse.category,
          name: categoryResponse.name,
          fileBytesBuff: file.buffer,
          // fileBytes: [...file.buffer],
          mimeType: file.mimetype,
          size: file.size,
          volatile: categoryResponse.volatile,
          durationMiliseconds: categoryResponse.durationMiliseconds,
        },
        'start'
      );
      return {
        category: categoryResponse.category,
        name: categoryResponse.name,
      };
    } else {
      throw categoryResponse.error;
    }
  }

  private assertFileLimit(maxLimitBytes: number, file: any) {
    if (maxLimitBytes < file.size) {
      throw new BadRequestException('file-limit-exceed');
    }
  }

  private generateTopicClientForUpload(topic: string) {
    if (this.uploadClients[topic] == null) {
      this.uploadClients[topic] = ClientProxyFactory.create({
        ...getMicroserviceConnection(''),
      } as any) as any as ClientKafka;
      this.uploadClients[topic]['subscribeToResponseOf']?.(topic);

      console.debug(this.uploadClients);
    }
    return this.uploadClients[topic];
  }

  private generateTopicClientForVolatileChange(topic: string) {
    if (this.volatileClients[topic] == null) {
      this.volatileClients[topic] = ClientProxyFactory.create({
        ...getMicroserviceConnection(''),
      } as any) as any as ClientKafka;
      this.volatileClients[topic]['subscribeToResponseOf']?.(topic);

      console.debug(this.volatileClients);
    }
    return this.volatileClients[topic];
  }

  private generateTopicForUpload(params: { type: string; objectId?: string }) {
    return `file-upload-${params.type}`;
  }

  private generateTopicForVolatile(params: {
    type: string;
    objectId?: string;
  }) {
    return `file-volatility-${params.type}`;
  }

  checkMimeTypeAndExtension(file) {
    const mimetype = file.mimetype;
    console.info(file);
    if (this.potentialMalicousMimeTypes.includes(mimetype)) {
      throw new BadRequestException('potential-malicous-file');
    }

    for (
      let index = 0;
      index < this.potentialMalicousExtensions.length;
      index++
    ) {
      const ext = this.potentialMalicousExtensions[index];
      if (file.originalname.endsWith('.' + ext)) {
        throw new BadRequestException('potential-malicous-file');
      }
    }
  }
}
