import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { BlogPost } from '../types';
import { ContentService } from './content.service';

@Injectable()
export class BlogInitService implements OnModuleInit {
  private readonly logger = new Logger(BlogInitService.name);

  private static readonly SEED_POSTS = ['supermarkety-bez-api'];

  constructor(private readonly content: ContentService) {}

  async onModuleInit(): Promise<void> {
    for (const postId of BlogInitService.SEED_POSTS) {
      try {
        await this.seedPostIfMissing(postId);
      } catch (error) {
        this.logger.warn(
          `Blog seed "${postId}" skipped`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  private async seedPostIfMissing(postId: string): Promise<void> {
    const posts = await this.content.getBlogPosts();
    if (posts.some((post) => post.id === postId)) {
      return;
    }

    const seed = this.loadSeedPost(postId);
    await this.content.updateBlogPosts([seed, ...posts]);
    this.logger.log(`Seeded blog post "${postId}"`);
  }

  private loadSeedPost(postId: string): BlogPost {
    const path = join(this.scriptsDir(), 'blog_posts', `${postId}.json`);
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as BlogPost;
  }

  private scriptsDir(): string {
    const candidates = [
      join(process.cwd(), 'scripts'),
      join(process.cwd(), 'backend', 'scripts'),
      join(__dirname, '..', '..', 'scripts'),
    ];
    for (const dir of candidates) {
      if (existsSync(join(dir, 'blog_posts'))) {
        return dir;
      }
    }
    throw new Error('scripts/blog_posts directory not found');
  }
}
