import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  thumbnailLink?: string;
  modifiedTime: string;
  webViewLink?: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private readonly apiKey: string;
  private readonly downloadDir: string;

  constructor(private config: ConfigService) {
    this.apiKey = (this.config.get<string>('GOOGLE_API_KEY', '') || '').trim();
    this.downloadDir = path.join(process.cwd(), 'data', 'videos');

    // Ensure download directory exists
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Extract Google Drive File ID from various URL formats
   */
  extractFileId(driveUrl: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,           // /file/d/FILE_ID/...
      /[?&]id=([a-zA-Z0-9_-]+)/,               // ?id=FILE_ID
      /\/open\?id=([a-zA-Z0-9_-]+)/,           // /open?id=FILE_ID
      /\/d\/([a-zA-Z0-9_-]+)/,                  // /d/FILE_ID
      /drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/, // uc?id=FILE_ID
    ];

    for (const pattern of patterns) {
      const match = driveUrl.match(pattern);
      if (match) return match[1];
    }

    // If the URL itself looks like a file ID (no slashes)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(driveUrl)) {
      return driveUrl;
    }

    return null;
  }

  /**
   * List files in a Google Drive folder
   */
  async listFiles(folderId: string): Promise<DriveFileInfo[]> {
    if (!this.apiKey) {
      throw new BadRequestException({
        code: 'GOOGLE_API_NOT_CONFIGURED',
        message: 'GOOGLE_API_KEY belum dikonfigurasi di .env',
      });
    }

    try {
      const { data } = await axios.get('https://www.googleapis.com/drive/v3/files', {
        params: {
          q: `'${folderId}' in parents and trashed = false and (mimeType contains 'video/' or mimeType = 'application/vnd.google-apps.folder' or mimeType = 'text/plain')`,
          fields: 'files(id,name,mimeType,size,thumbnailLink,modifiedTime,webViewLink)',
          orderBy: 'modifiedTime desc',
          pageSize: 100,
          key: this.apiKey,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
      });

      return data.files || [];
    } catch (error: any) {
      this.logger.error(`Failed to list Drive files: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
      if (error.response?.status === 404) {
        throw new BadRequestException(
          'Folder Google Drive tidak ditemukan. Ini bisa terjadi karena: ' +
          '(1) Google Drive API belum di-enable di Google Cloud Console, ' +
          '(2) Folder belum benar-benar publik (coba buka URL folder di mode Incognito), ' +
          '(3) API Key memiliki restricsi. ' +
          'Alternatif: gunakan fitur "Upload Langsung" untuk upload video dari komputer.'
        );
      }
      throw new BadRequestException(`Gagal mengakses Google Drive: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get file metadata from Google Drive
   */
  async getFileInfo(fileId: string): Promise<DriveFileInfo> {
    if (!this.apiKey) {
      throw new BadRequestException({
        code: 'GOOGLE_API_NOT_CONFIGURED',
        message: 'GOOGLE_API_KEY belum dikonfigurasi di .env',
      });
    }

    try {
      const { data } = await axios.get(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          params: {
            fields: 'id,name,mimeType,size,thumbnailLink,modifiedTime,webViewLink',
            key: this.apiKey,
            supportsAllDrives: true,
          },
        },
      );
      return data;
    } catch (error: any) {
      this.logger.error(`Failed to get file info: ${error.message}`);
      throw new BadRequestException('Gagal mendapatkan info file dari Google Drive.');
    }
  }

  /**
   * Download a file from Google Drive to local disk
   * Returns the local file path
   */
  async downloadFile(fileIdOrUrl: string): Promise<{ localPath: string; fileName: string; mimeType: string; fileSize: number }> {
    let fileId = this.extractFileId(fileIdOrUrl);
    if (!fileId) {
      throw new BadRequestException('URL Google Drive tidak valid. Pastikan format URL benar.');
    }

    // Get file metadata
    let fileName: string;
    let mimeType: string;

    if (this.apiKey) {
      const info = await this.getFileInfo(fileId);
      fileName = info.name;
      mimeType = info.mimeType;
    } else {
      fileName = `video_${fileId}.mp4`;
      mimeType = 'video/mp4';
    }

    const localPath = path.join(this.downloadDir, `${fileId}_${Date.now()}_${fileName}`);

    this.logger.log(`Downloading file ${fileId} (${fileName}) from Google Drive...`);

    try {
      // Try API download first (for API key users with shared files)
      if (this.apiKey) {
        const response = await axios.get(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            params: { alt: 'media', key: this.apiKey },
            responseType: 'stream',
            maxRedirects: 5,
          },
        );

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
      } else {
        // Fallback: direct download URL for publicly shared files
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

        const response = await axios.get(downloadUrl, {
          responseType: 'stream',
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });

        const writer = fs.createWriteStream(localPath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
      }

      const stats = fs.statSync(localPath);
      this.logger.log(`Downloaded ${fileName}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

      return {
        localPath,
        fileName,
        mimeType,
        fileSize: stats.size,
      };
    } catch (error: any) {
      // Cleanup partial file
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
      this.logger.error(`Download failed: ${error.message}`);
      throw new BadRequestException(
        'Gagal mendownload file dari Google Drive. Pastikan file sudah di-share sebagai "Anyone with the link".',
      );
    }
  }

  /**
   * Read a text file from Google Drive and return its content
   */
  async readTextFile(fileIdOrUrl: string): Promise<string> {
    let fileId = this.extractFileId(fileIdOrUrl);
    if (!fileId) {
      throw new BadRequestException('URL Google Drive tidak valid.');
    }

    try {
      if (this.apiKey) {
        const response = await axios.get(
          `https://www.googleapis.com/drive/v3/files/${fileId}`,
          {
            params: { alt: 'media', key: this.apiKey },
            responseType: 'text',
            maxRedirects: 5,
          },
        );
        return response.data;
      } else {
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
        const response = await axios.get(downloadUrl, {
          responseType: 'text',
          maxRedirects: 5,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        });
        return response.data;
      }
    } catch (error: any) {
      this.logger.error(`Failed to read text file: ${error.message}`);
      throw new BadRequestException('Gagal membaca file teks dari Google Drive.');
    }
  }

  /**
   * Parse content metadata file (txt) with key: value format
   */
  parseContentMetadata(text: string): { title: string; hashtags: string; description: string } {
    // Normalize line endings
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const result: Record<string, string> = {};
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      const match = line.match(/^(title|hashtags|description|keywords|timestamps|model\/provider|prompt_used|score|created_at):\s*(.*)$/i);
      if (match) {
        // Save previous key
        if (currentKey) {
          result[currentKey] = currentValue.trim();
        }
        currentKey = match[1].toLowerCase();
        currentValue = match[2];
      } else if (currentKey) {
        // Multi-line value
        currentValue += '\n' + line;
      }
    }
    // Save last key
    if (currentKey) {
      result[currentKey] = currentValue.trim();
    }

    return {
      title: result['title'] || '',
      hashtags: result['hashtags'] || '',
      description: result['description'] || '',
    };
  }

  /**
   * Clean up downloaded file
   */
  cleanupFile(localPath: string) {
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        this.logger.log(`Cleaned up: ${localPath}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup ${localPath}`);
    }
  }
}
