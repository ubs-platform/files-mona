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
@Controller('file')
export class ImageFileController {
  clients: { [key: string]: ClientProxy | ClientKafka | ClientRMQ } = {};
  // alreadyResponseRegistered: string[] = [];
  constructor(
    private fservice: FileService,
    @Inject('META_CHECK_CLIENT') private kafka: ClientProxy //
  ) {}

  // @MessagePattern('file-upload-start')
  // async uploadFileStart(file: FileRequest): Promise<number> {
  //   console.debug('İmage upload msg has been received');
  //   return await this.fservice.uploadFile(file, 'start');
  // }

  // @MessagePattern('file-upload-continue')
  // async uploadFileContinue(file: FileRequest): Promise<number> {
  //   console.debug('İmage upload msg has been received');
  //   return await this.fservice.uploadFile(file, 'continue');
  // }

  @Put('/:type/:objectId')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Param() params: { type: string; objectId?: string },
    @CurrentUser() user: UserDTO
  ) {
    return await this.uploadFile1(file, params, user);
  }

  @Put('/:type')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadFileOnlyType(
    @UploadedFile() file: Express.Multer.File,
    @Param() params: { type: string },
    @CurrentUser() user: UserDTO
  ) {
    return await this.uploadFile1(file, params, user);
  }

  async uploadFile1(
    file: Express.Multer.File,
    params: { type: string; objectId?: string },
    user: UserDTO
  ) {
    const topic = `file-upload-${params.type}`;
    if (this.clients[topic] == null) {
      this.clients[topic] = ClientProxyFactory.create({
        ...getMicroserviceConnection(''),
      } as any) as any as ClientKafka;
      this.clients[topic]['subscribeToResponseOf']?.(topic);

      console.debug(this.clients);
    }
    const client = this.clients[topic];

    const {
      category,
      name,
      error,
    }: { category?: string; name?: string; error?: string } =
      await lastValueFrom(
        client.send(topic, { userId: user.id, objectId: params.objectId })
      );
    if (category && name) {
      await this.fservice.uploadFile(
        {
          category,
          name,
          fileBytes: [...file.buffer],
          mimeType: file.mimetype,
          size: file.size,
        },
        'start'
      );
      return { category, name };
    } else {
      throw error;
    }
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
}
