import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContentService } from './content.service';

@Injectable()
export class CvInitService implements OnModuleInit {
  private readonly logger = new Logger(CvInitService.name);

  constructor(private readonly content: ContentService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.content.rebuildCv();
    } catch (error) {
      this.logger.warn(
        'CV not generated on startup (content may be missing)',
        error instanceof Error ? error.message : error,
      );
    }
  }
}
