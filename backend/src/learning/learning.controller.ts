import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { LearningService } from './learning.service';
import type { LearningSnapshot } from './learning.types';

@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /** Public: the hero bars read this. Returns null when there is no data. */
  @Get()
  async publicSnapshot(): Promise<LearningSnapshot | null> {
    return this.learning.getPublic();
  }

  /**
   * Admin: records the self-assessed CEFR level for one course. Deliberately
   * manual, because a level inferred from XP would be a lie on a public page.
   */
  @Patch('level')
  @UseGuards(AdminAuthGuard)
  async setLevel(
    @Body() body: { code?: string; level?: string; since?: string },
  ): Promise<LearningSnapshot> {
    const code = String(body?.code ?? '').trim();
    const level = String(body?.level ?? '').trim();
    if (!code || !level) {
      throw new BadRequestException('code and level are required, e.g. {"code":"it","level":"A1"}');
    }
    return this.learning.setLevel(code, level, body?.since);
  }
}
