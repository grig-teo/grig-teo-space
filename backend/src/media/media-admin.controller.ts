import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { MediaService } from './media.service';

/** Admin-only read access to backed-up media (for a future admin gallery). */
@Controller('admin/media')
@UseGuards(AdminAuthGuard)
export class MediaAdminController {
  constructor(private readonly media: MediaService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('kind') kind?: string,
  ) {
    return this.media.list({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      kind,
    });
  }
}
