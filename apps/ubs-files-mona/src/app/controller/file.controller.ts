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
@Controller('file')
export class ImageFileController {
  clients: { [key: string]: ClientProxy | ClientKafka | ClientRMQ } = {};
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

  async uploadFile1(
    file: any,
    params: { type: string; objectId?: string },
    user: UserDTO
  ) {
    const topic = this.generateTopic(params);
    const client = this.generateTopicClient(topic);

    const categoryResponse: FileCategoryResponse = await lastValueFrom(
      client.send(topic, { userId: user.id, objectId: params.objectId })
    );
    const maxLimitBytes = categoryResponse.maxLimitBytes | 1000000;
    if (categoryResponse.category && categoryResponse.name) {
      console.info(file);
      if (maxLimitBytes < file.size) {
        throw new BadRequestException('file-limit-exceed');
      }
      await this.fservice.uploadFile(
        {
          category: categoryResponse.category,
          name: categoryResponse.name,
          fileBytesBuff: file.buffer,
          // fileBytes: [...file.buffer],
          mimeType: file.mimetype,
          size: file.size,
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

  private generateTopicClient(topic: string) {
    if (this.clients[topic] == null) {
      this.clients[topic] = ClientProxyFactory.create({
        ...getMicroserviceConnection(''),
      } as any) as any as ClientKafka;
      this.clients[topic]['subscribeToResponseOf']?.(topic);

      console.debug(this.clients);
    }
    return this.clients[topic];
  }

  private generateTopic(params: { type: string; objectId?: string }) {
    return `file-upload-${params.type}`;
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
