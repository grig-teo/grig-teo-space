import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { LearningService } from './learning.service';
import type { LearningSnapshot } from './learning.types';

@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /** Public: the hero chip reads this. Returns 204-ish null when there is no data. */
  @Get()
  async publicSnapshot(): Promise<LearningSnapshot | null> {
    return this.learning.getPublic();
  }

  /**
   * Admin: records the self-assessed CEFR level. Deliberately manual, because
   * a level inferred from XP would be a lie on a public page.
   */
  @Patch('level')
  @UseGuards(AdminAuthGuard)
  async setLevel(@Body() body: { level?: string; since?: string }): Promise<LearningSnapshot> {
    const level = String(body?.level ?? '').trim();
    if (!level) {
      throw new BadRequestException('level is required, e.g. {"level":"B1"}');
    }
    return this.learning.setLevel(level, body?.since);
  }
}
