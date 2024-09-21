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

import {
  UserAuthBackendDTO,
  UserDTO,
  UserFullDto,
  UserGeneralInfoDTO,
} from '@ubs-platform/users-common';
import * as FileSystem from 'fs/promises';
import {
  ClientKafka,
  ClientProxy,
  ClientProxyFactory,
  ClientRMQ,
  MessagePattern,
  TcpClientOptions,
  Transport,
} from '@nestjs/microservices';
import { FileRequest } from '../dto/file-request';
import { lastValueFrom } from 'rxjs';
import { Multer } from 'multer';
import { getMicroserviceConnection } from '@ubs-platform/nest-microservice-setup-util';
import {
  JwtAuthGuard,
  CurrentUser,
} from '@ubs-platform/users-mona-microservice-helper';
import {
  UploadFileCategoryRequest,
  UploadFileCategoryResponse,
} from '../dto/file-category-response';
import { FileVolatileTag } from '../dto/file-volatile-tag';
import { FileVolatilityIssue } from '../dto/file-volatility-issue';
import { EntityPropertyService } from '../service/entity-property.service';
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
  constructor(
    private fservice: FileService,
    private entityPropertyService: EntityPropertyService
  ) {}

  @Put('/volatility')
  @UseGuards(JwtAuthGuard)
  async applyVolatilities(
    @Body() volatilities: FileVolatileTag[],
    @CurrentUser() currentUser: UserAuthBackendDTO
  ) {
    for (let index = 0; index < volatilities.length; index++) {
      const volatile = volatilities[index];
      await this.sendCheckForVolatile(volatile, currentUser);
    }
    await this.fservice.updateVolatilities(volatilities);
  }

  @Put('/:type/:objectId')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadFile(
    @UploadedFile() file: any,
    @Param() params: { type: string; objectId?: string },
    @CurrentUser() user: UserAuthBackendDTO
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
    @CurrentUser() user: UserAuthBackendDTO
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
    user: UserAuthBackendDTO
  ) {
    console.info('Category Response Befor');

    // const topic = this.generateTopicForUpload(params);
    const categoryResponse: UploadFileCategoryResponse =
      await this.sendCheckForUpload(params.type, {
        userId: user.id,
        objectId: params.objectId,
        roles: user.roles,
      });

    console.info('Category Response', categoryResponse);

    //  = await lastValueFrom(
    //   client.send(topic)
    // );
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

  private async sendCheckForUpload(type: string, v: UploadFileCategoryRequest) {
    console.info(type, v);
    const topic = `file-upload-${type}`;
    const cl = await this.createClient(type);
    return await lastValueFrom(cl.send(topic, v));
  }

  private async sendCheckForVolatile(
    volatileTag: FileVolatileTag,
    user?: UserAuthBackendDTO
  ) {
    const topic = `file-volatility-${volatileTag.category}`;

    const client = await this.createClient(volatileTag.category);
    const issue = (await lastValueFrom(
      client.send(topic, {
        ...volatileTag,
        userId: user?.id,
        roles: user.roles,
      })
    )) as FileVolatilityIssue;
    if (issue) {
      throw new BadRequestException(issue.error);
    }
  }

  private async createClient(categoryName: string) {
    if (this.clients[categoryName] != null) {
      return this.clients[categoryName];
    }
    const ep = await this.entityPropertyService.findOne({
      category: categoryName,
    });
    const cl = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: {
        host: `${ep.serviceTcpHost}`,
        port: `${ep.serviceTcpPort}`,
      },
    } as any) as any as ClientProxy;
    this.clients[categoryName] = cl;
    return cl;
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
