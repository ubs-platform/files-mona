import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { FileDoc, FileModel } from '../model/file.schema';
import { Model, ObjectId, Schema } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserDTO } from '@ubs-platform/users-common';
import { FileMeta } from '../dto/file-meta';
import { FileRequest } from '../dto/file-request';

@Injectable()
export class FileService {
  constructor(@InjectModel(FileModel.name) private fileModel: Model<FileDoc>) {}

  async removeByName(name: string): Promise<void> {
    this.fileModel.findOneAndRemove(
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
    // if there is existing
    const exist = await this.findByNamePure(ft.category, ft.name);
    let f = exist || new this.fileModel();

    const size = ft.size;

    const bytesNew =
      mode == 'start'
        ? Buffer.from(ft.fileBytes)
        : Buffer.from([...f.file, ...ft.fileBytes]);
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
}
