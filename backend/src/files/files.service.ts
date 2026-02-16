import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface UploadedFileInfo {
  id: string;
  name: string;
  originalName: string;
  path: string;
  size: number;
  mimeType: string;
  url: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private readonly uploadDir = path.join(process.cwd(), 'data', 'videos');

  /**
   * Process uploaded file and return metadata
   */
  processUploadedFile(file: Express.Multer.File): UploadedFileInfo {
    const id = path.basename(file.filename, path.extname(file.filename));
    
    this.logger.log(`File uploaded: ${file.originalname} -> ${file.filename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    return {
      id,
      name: file.filename,
      originalName: file.originalname,
      path: file.path,
      size: file.size,
      mimeType: file.mimetype,
      url: `local://${file.filename}`,
    };
  }

  /**
   * List all uploaded video files
   */
  listFiles(): UploadedFileInfo[] {
    if (!fs.existsSync(this.uploadDir)) return [];

    const files = fs.readdirSync(this.uploadDir);
    return files
      .filter(f => {
        const ext = path.extname(f).toLowerCase();
        return ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'].includes(ext);
      })
      .map(f => {
        const filePath = path.join(this.uploadDir, f);
        const stat = fs.statSync(filePath);
        const id = path.basename(f, path.extname(f));
        return {
          id,
          name: f,
          originalName: f,
          path: filePath,
          size: stat.size,
          mimeType: `video/${path.extname(f).slice(1)}`,
          url: `local://${f}`,
        };
      })
      .sort((a, b) => {
        const aStat = fs.statSync(a.path);
        const bStat = fs.statSync(b.path);
        return bStat.mtimeMs - aStat.mtimeMs;
      });
  }

  /**
   * Get file info by filename  
   */
  getFile(filename: string): UploadedFileInfo {
    const filePath = path.join(this.uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File tidak ditemukan.');
    }
    const stat = fs.statSync(filePath);
    const id = path.basename(filename, path.extname(filename));
    return {
      id,
      name: filename,
      originalName: filename,
      path: filePath,
      size: stat.size,
      mimeType: `video/${path.extname(filename).slice(1)}`,
      url: `local://${filename}`,
    };
  }

  /**
   * Resolve a local:// URL to actual file path
   */
  resolveLocalFile(localUrl: string): string | null {
    if (!localUrl.startsWith('local://')) return null;
    const filename = localUrl.replace('local://', '');
    const filePath = path.join(this.uploadDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  }

  /**
   * Delete an uploaded file
   */
  deleteFile(filename: string): void {
    const filePath = path.join(this.uploadDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`File deleted: ${filename}`);
    }
  }

  /**
   * Get the file path for serving/streaming
   */
  getFilePath(filename: string): string {
    const filePath = path.join(this.uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('File tidak ditemukan.');
    }
    return filePath;
  }
}
