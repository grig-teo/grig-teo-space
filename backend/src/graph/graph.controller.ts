import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { GraphService } from './graph.service';

/**
 * The content graph is derived from every stored content item, including
 * unpublished drafts, so it is admin-only rather than public.
 */
@Controller('admin/graph')
@UseGuards(AdminAuthGuard)
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get()
  async get() {
    return this.graph.build();
  }
}
