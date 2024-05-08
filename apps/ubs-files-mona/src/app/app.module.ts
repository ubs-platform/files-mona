import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { getMicroserviceConnection } from '@ubs-platform/nest-microservice-setup-util';
import { BackendJwtUtilsModule } from '@ubs-platform/users-mona-microservice-helper';
import { join } from 'path';
import { FileModel, FileSchema } from './model/file.schema';
import { ImageFileController } from './controller/file.controller';
import { FileService } from './service/file.service';

@Module({
  imports: [
    MongooseModule.forRoot(
      `mongodb://${process.env.NX_MONGO_USERNAME}:${
        process.env.NX_MONGO_PASSWORD
      }@${process.env.NX_MONGO_URL || 'localhost'}/?authMechanism=DEFAULT`,
      {
        dbName: process.env.NX_MONGO_DBNAME || 'ubs_users',
      }
    ),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'assets'),
    }),
    MongooseModule.forFeature([{ name: FileModel.name, schema: FileSchema }]),
    ClientsModule.register([
      {
        name: 'META_CHECK_CLIENT',
        ...getMicroserviceConnection(''),
      } as any,
    ]),
    BackendJwtUtilsModule,
  ],
  controllers: [ImageFileController],
  providers: [FileService],
})
export class AppModule {}
