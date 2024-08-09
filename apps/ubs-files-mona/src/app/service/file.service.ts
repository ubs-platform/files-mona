import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { FileDoc, FileModel } from '../model/file.schema';
import { Model, ObjectId, Schema } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserDTO } from '@ubs-platform/users-common';
import { FileMeta } from '../dto/file-meta';
import { FileRequest } from '../dto/file-request';
import sharp from 'sharp';
import Jimp from 'jimp';
import * as WebpConverter from 'webp-converter';
@Injectable()
export class FileService {
  constructor(@InjectModel(FileModel.name) private fileModel: Model<FileDoc>) {}

  async removeByName(name: string): Promise<void> {
    this.fileModel.findOneAndDelete(
      {
        name: name,
      },
      console.error
    );
  }

  async findByName(category: string, name: string): Promise<FileMeta | null> {
    const file = await this.findByNamePure(category, name);
    if (file != null) {
      file.lastFetch = new Date();
      file.save();

      return {
        id: file._id,
        file: file.file,
        mimetype: file.mimeType,
        userId: file.userId,
      };
    } else {
      return null;
    }
  }

  private async findByNamePure(category: string, name: string) {
    console.debug(category, name);
    return await this.fileModel.findOne({
      name,
      category,
    });
  }

  async uploadFile(
    ft: FileRequest,
    mode: 'start' | 'continue'
  ): Promise<number> {
    ft = await this.applyOptimisations(ft);
    // if there is existing
    const exist = await this.findByNamePure(ft.category, ft.name);
    let f = exist || new this.fileModel();

    const size = ft.size;

    const bytesNew =
      mode == 'start'
        ? ft.fileBytesBuff
        : Buffer.from([...f.file, ...ft.fileBytesBuff]);
    const remaining = size - bytesNew.length;

    try {
      f.file = bytesNew;
      f.mimeType = ft.mimeType;
      f.length = ft.size;
      f.name = ft.name;
      f.category = ft.category;
      f = await f.save();
      return remaining;
    } catch (error) {
      console.error(error);
    }
  }
  async applyOptimisations(ft: FileRequest): Promise<FileRequest> {
    if (
      ft.mimeType == 'image/jpeg' ||
      ft.mimeType == 'image/png' ||
      ft.mimeType == 'image/gif' ||
      ft.mimeType == 'image/apng' ||
      ft.mimeType == 'image/avif'
    ) {
      // const img = await Jimp.read(ft.fileBytes as any);
      // const webp = img.web
      // const ext = ft.mimeType.
      // let [, extension] = ft.mimeType.split('/');
      // if (extension == 'jpeg') extension = 'jpg';
      // const newBUff = await WebpConverter.buffer2webpbuffer(
      //   ft.fileBytes,
      //   extension,
      //   '-q 80'
      // );
      const buff = await sharp(ft.fileBytesBuff, {}).webp({}).toBuffer();
      ft.fileBytesBuff = buff;
      ft.mimeType = 'image/webp';
    }
    return ft;
  }
}
