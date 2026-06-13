import { Injectable, OnModuleInit } from '@nestjs/common';
import { ContentService } from '../content/content.service';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private readonly content: ContentService) {}

  async onModuleInit(): Promise<void> {
    await this.content.seedIfEmpty();
  }
}
