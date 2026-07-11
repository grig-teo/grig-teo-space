import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { DocumentsService } from './documents.service';

/** Admin-only read access to scanned health documents (for a future admin view). */
@Controller('admin/health-docs')
@UseGuards(AdminAuthGuard)
export class DocumentsAdminController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  async list(
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.docs.list({
      query,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    });
  }
}
