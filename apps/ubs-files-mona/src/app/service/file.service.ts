import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { FileDoc, FileModel } from '../model/file.schema';
import { Model, ObjectId, Schema } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserDTO } from '@ubs-platform/users-common';
import { FileMeta } from '../dto/file-meta';
import { FileRequest } from '../dto/file-request';
import sharp from 'sharp';
import { FileVolatileTag } from '../dto/file-volatile-tag';
import { Cron } from '@nestjs/schedule';
@Injectable()
export class FileService {
  constructor(@InjectModel(FileModel.name) private fileModel: Model<FileDoc>) {}

  async removeByName(name: string): Promise<void> {
    this.fileModel.findOneAndDelete(
      {
        name: name,
      },
      console.error,
    );
  }

  async updateVolatilities(volatilities: FileVolatileTag[]) {
    for (let index = 0; index < volatilities.length; index++) {
      const volatility = volatilities[index];
      const existFile = await this.findByNamePure(
        volatility.category,
        volatility.name,
      );
      this.setVotaility(
        existFile,
        volatility.volatile,
        volatility.durationMiliseconds,
      );

      // existFile.volatile = volatility.volatile;
      // existFile.expireAt = new Date(
      //   Date.now() + volatility.durationMiliseconds
      // );
      await existFile.save();
    }
  }

  async findByName(
    category: string,
    name: string,
    widthForImage_?: string | number | null,
  ): Promise<FileMeta | null> {
    const file = await this.findByNamePure(category, name);
    if (file != null) {
      file.lastFetch = new Date();
      let fileBin = file.file;

      const widthForImage = parseInt(widthForImage_ as any);
      if (this.isImage(file.mimeType) && !isNaN(widthForImage)) {
        // file.scaledImages = [];
        const a = file.scaledImages.find((a) => a.width - widthForImage < 50);
        if (a) {
          if (!a.useSame) {
            fileBin = a.file;
          }
        } else {
          const imageSharp = await sharp(fileBin, {});
          const meta = await imageSharp.metadata();
          if (meta.width > widthForImage) {
            const resized = await imageSharp.resize({
              width: widthForImage,
              withoutEnlargement: true,
              fit: 'contain',
            });

            const buff = await resized.toBuffer();
            fileBin = buff;
            file.scaledImages.push({
              width: widthForImage,
              file: buff,
              useSame: false,
            });
          } else {
            file.scaledImages.push({
              width: widthForImage,
              file: null,
              useSame: true,
            });
          }
        }
      }
      // file.
      file.save();

      return {
        id: file._id,
        file: fileBin,
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
    mode: 'start' | 'continue',
  ): Promise<number> {
    ft = await this.applyUploadOptimisations(ft);
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
      this.setVotaility(f, ft.volatile, ft.durationMiliseconds);
      f = await f.save();
      return remaining;
    } catch (error) {
      console.error(error);
    }
  }

  private setVotaility(
    f: import('mongoose').Document<unknown, {}, FileDoc> &
      FileModel &
      Document & { _id: import('mongoose').Types.ObjectId },
    volatile,
    durationMiliseconds,
  ) {
    f.volatile = volatile ?? true;
    f.expireAt = new Date(Date.now() + (durationMiliseconds ?? 3600000));
  }

  async applyUploadOptimisations(ft: FileRequest): Promise<FileRequest> {
    if (this.isImageNonWebP(ft.mimeType)) {
      const buff = await sharp(ft.fileBytesBuff, {}).webp({}).toBuffer();
      ft.fileBytesBuff = buff;
      ft.mimeType = 'image/webp';
    }
    return ft;
  }

  private isImageNonWebP(mimeType: string) {
    return (
      mimeType == 'image/jpeg' ||
      mimeType == 'image/png' ||
      mimeType == 'image/gif' ||
      mimeType == 'image/apng' ||
      mimeType == 'image/avif'
    );
  }

  private isImage(mimeType: string) {
    return this.isImageNonWebP(mimeType) || mimeType == 'image/webp';
  }

  @Cron('0 20 4 * * *')
  async handleCron() {
    console.info('Expired Volatile Files about to be removed');
    console.info(
      await this.fileModel.deleteMany({
        volatile: true,
        expireAt: {
          $lte: new Date(),
        },
      }),
    );
  }
}
