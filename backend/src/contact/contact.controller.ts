import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { ContactService, type ContactAccepted, type ContactInput } from './contact.service';
import type { ContactMessage } from '../entities/contact-message.entity';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Public project inquiry. Throttled hard: five submissions per minute per IP
   * is far above any real use and well below what a flood needs.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async submit(
    @Body() body: ContactInput,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<ContactAccepted> {
    return this.contact.submit(body ?? {}, ip, userAgent);
  }

  /** Admin: inspect inquiries. JWT-guarded, like the rest of /api/admin. */
  @Get()
  @UseGuards(AdminAuthGuard)
  async list(@Query('limit') limit?: string): Promise<ContactMessage[]> {
    return this.contact.list(Number(limit) || 50);
  }
}
