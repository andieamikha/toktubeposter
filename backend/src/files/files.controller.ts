import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('files')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class FilesController {
  constructor(private filesService: FilesService) {}

  /**
   * Upload a single video file
   * POST /files/upload
   */
  @Post('upload')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File video harus disertakan.');
    }
    return this.filesService.processUploadedFile(file);
  }

  /**
   * Upload multiple video files
   * POST /files/upload-multiple
   */
  @Post('upload-multiple')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @UseInterceptors(FilesInterceptor('files', 10)) // max 10 files
  uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Minimal satu file video harus disertakan.');
    }
    return files.map(f => this.filesService.processUploadedFile(f));
  }

  /**
   * List all uploaded video files
   * GET /files
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  listFiles() {
    return this.filesService.listFiles();
  }

  /**
   * Get file info
   * GET /files/:filename/info
   */
  @Get(':filename/info')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  getFileInfo(@Param('filename') filename: string) {
    return this.filesService.getFile(filename);
  }

  /**
   * Stream/serve a video file (for preview)
   * GET /files/:filename/stream
   */
  @Get(':filename/stream')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async streamFile(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const filePath = this.filesService.getFilePath(filename);
    const stat = fs.statSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.webm': 'video/webm',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  /**
   * Delete an uploaded file
   * DELETE /files/:filename
   */
  @Delete(':filename')
  @Roles(UserRole.ADMIN)
  deleteFile(@Param('filename') filename: string) {
    this.filesService.deleteFile(filename);
    return { message: 'File berhasil dihapus.' };
  }
}
