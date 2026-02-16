import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/constants';
import { GoogleDriveService, DriveFileInfo } from './google-drive.service';

@Controller('google-drive')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class GoogleDriveController {
  constructor(private driveService: GoogleDriveService) {}

  /**
   * List files in a Google Drive folder
   * GET /google-drive/files?folderId=FOLDER_ID
   */
  @Get('files')
  @Roles(UserRole.ADMIN)
  async listFiles(@Query('folderId') folderId: string): Promise<DriveFileInfo[]> {
    return this.driveService.listFiles(folderId);
  }

  /**
   * Get info about a single file
   * GET /google-drive/file-info?fileId=FILE_ID
   */
  @Get('file-info')
  @Roles(UserRole.ADMIN)
  async getFileInfo(@Query('fileId') fileId: string): Promise<DriveFileInfo> {
    return this.driveService.getFileInfo(fileId);
  }

  /**
   * Read and parse a txt content metadata file from Google Drive
   * GET /google-drive/read-txt?fileId=FILE_ID_OR_URL
   */
  @Get('read-txt')
  @Roles(UserRole.ADMIN)
  async readTxtFile(@Query('fileId') fileId: string) {
    const text = await this.driveService.readTextFile(fileId);
    const parsed = this.driveService.parseContentMetadata(text);
    return { raw: text, parsed };
  }
}
