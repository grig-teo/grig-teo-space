import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { ObjectLiteral, Repository } from 'typeorm';
import { AiChatMessage } from '../entities/ai-chat-message.entity';
import { HealthDocChatMessage } from '../entities/health-doc-chat-message.entity';
import { HealthDocument } from '../entities/health-document.entity';
import { HealthNote } from '../entities/health-note.entity';
import { HealthReading } from '../entities/health-reading.entity';
import { HealthTip } from '../entities/health-tip.entity';
import { MediaItem } from '../entities/media-item.entity';
import { SleepSession } from '../entities/sleep-session.entity';
import { WeatherSample } from '../entities/weather-sample.entity';
import type { GraphEdge, GraphNode } from './graph.types';

/**
 * The project whose pipeline produces the health data. Health rows reference no
 * project themselves, so this is the one edge that has to be stated rather than
 * derived.
 */
export const HEALTH_PROJECT_ID = 'grig-teo-space';

/** How many individual notes and documents to show before falling back to a count. */
const NOTE_LIMIT = 25;
const DOCUMENT_LIMIT = 25;

/** Display names for the metric keys stored in `health_reading.metric`. */
const METRIC_LABELS: Record<string, string> = {
  heart_rate: 'Heart rate',
  spo2: 'SpO2',
  steps: 'Steps',
  calories: 'Calories',
  distance_km: 'Distance (km)',
  stress: 'Stress',
  hrv: 'HRV',
  sleep_duration_h: 'Sleep duration (h)',
  sleep_quality: 'Sleep quality',
};

type Volume = { count: number; first: Date | null; last: Date | null };

/** "12,480" — thousands separators keep big row counts readable. */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** "19 Jul → 9 Oct" — the span a data set covers, or nothing when it is empty. */
function formatRange(first: Date | null, last: Date | null): string {
  if (!first || !last) return 'no data yet';
  const format = (date: Date) =>
    new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const from = format(first);
  const to = format(last);
  return from === to ? from : `${from} → ${to}`;
}

/** "47,136 readings · 19 Jul → 9 Oct" */
function volumeSublabel(unit: string, volume: Volume): string {
  return `${formatCount(volume.count)} ${unit} · ${formatRange(volume.first, volume.last)}`;
}

function metricNode(metric: string, volume: Volume): GraphNode {
  return {
    id: `metric:${metric}`,
    type: 'metric',
    label: METRIC_LABELS[metric] ?? metric,
    sublabel: volumeSublabel('readings', volume),
    degree: 0,
  };
}

function aggregateNode(id: string, label: string, unit: string, volume: Volume): GraphNode {
  return {
    id: `log:${id}`,
    type: 'log',
    label,
    sublabel: volumeSublabel(unit, volume),
    degree: 0,
  };
}

/**
 * Health data as graph nodes.
 *
 * Individual readings are deliberately not nodes — there are tens of thousands
 * of them, and a node per reading would be a cloud rather than a graph. Each
 * metric is one node sized by its row count, notes and documents are listed
 * individually because they are authored content, and the high-volume tables
 * (tips, sleep, media, chats, weather) collapse into one node each.
 */
@Injectable()
export class HealthGraphService {
  constructor(
    @InjectRepository(HealthReading) private readonly readings: Repository<HealthReading>,
    @InjectRepository(HealthTip) private readonly tips: Repository<HealthTip>,
    @InjectRepository(SleepSession) private readonly sleep: Repository<SleepSession>,
    @InjectRepository(HealthNote) private readonly notes: Repository<HealthNote>,
    @InjectRepository(HealthDocument) private readonly documents: Repository<HealthDocument>,
    @InjectRepository(MediaItem) private readonly media: Repository<MediaItem>,
    @InjectRepository(AiChatMessage) private readonly chats: Repository<AiChatMessage>,
    @InjectRepository(HealthDocChatMessage) private readonly docChats: Repository<HealthDocChatMessage>,
    @InjectRepository(WeatherSample) private readonly weather: Repository<WeatherSample>,
  ) {}

  async build(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const add = (node: GraphNode) => {
      nodes.push(node);
      // Health rows carry no project reference, so every node hangs off the
      // pipeline project that stores it.
      edges.push({ source: node.id, target: `project:${HEALTH_PROJECT_ID}`, rel: 'feeds' });
    };

    for (const row of await this.readingVolumes()) {
      add(metricNode(row.metric, row));
    }
    for (const note of await this.notes.find({ order: { recordedAt: 'DESC' }, take: NOTE_LIMIT })) {
      add({
        id: `note:${note.id}`,
        type: 'note',
        label: noteLabel(note.content),
        sublabel: `${note.mood ? `${note.mood} · ` : ''}${formatRange(note.recordedAt, note.recordedAt)}`,
        degree: 0,
      });
    }
    for (const doc of await this.documents.find({ order: { recordedAt: 'DESC' }, take: DOCUMENT_LIMIT })) {
      add({
        id: `document:${doc.id}`,
        type: 'document',
        label: doc.title,
        sublabel: `${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'} · ${formatRange(doc.recordedAt, doc.recordedAt)}`,
        degree: 0,
      });
    }
    for (const node of await this.aggregateNodes()) {
      add(node);
    }

    return { nodes, edges };
  }

  /** Row count, first and last timestamp per metric, biggest first. */
  private async readingVolumes(): Promise<Array<Volume & { metric: string }>> {
    const rows = await this.readings
      .createQueryBuilder('r')
      .select('r.metric', 'metric')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MIN(r.recordedAt)', 'first')
      .addSelect('MAX(r.recordedAt)', 'last')
      .groupBy('r.metric')
      .getRawMany<{ metric: string; count: string; first: Date | null; last: Date | null }>();
    return rows
      .map((row) => ({
        metric: row.metric,
        count: Number(row.count),
        first: row.first,
        last: row.last,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /** Count plus date span for one table, in a single aggregate query. */
  private async volume<T extends ObjectLiteral>(
    repo: Repository<T>,
    alias: string,
    dateProperty: keyof T & string,
  ): Promise<Volume> {
    const row = await repo
      .createQueryBuilder(alias)
      .select('COUNT(*)', 'count')
      .addSelect(`MIN(${alias}.${dateProperty})`, 'first')
      .addSelect(`MAX(${alias}.${dateProperty})`, 'last')
      .getRawOne<{ count: string; first: Date | null; last: Date | null }>();
    return { count: Number(row?.count ?? 0), first: row?.first ?? null, last: row?.last ?? null };
  }

  /** The high-volume tables, as one node each. */
  private async aggregateNodes(): Promise<GraphNode[]> {
    const [tips, sleep, media, chats, docChats, weather] = await Promise.all([
      this.volume(this.tips, 't', 'generatedAt'),
      this.volume(this.sleep, 's', 'startedAt'),
      this.volume(this.media, 'm', 'createdAt'),
      this.volume(this.chats, 'c', 'createdAt'),
      this.volume(this.docChats, 'd', 'createdAt'),
      this.volume(this.weather, 'w', 'recordedAt'),
    ]);

    return [
      ['tips', 'AI health tips', 'tips', tips],
      ['sleep', 'Sleep sessions', 'sessions', sleep],
      ['media', 'Photo & video backup', 'items', media],
      [
        'chats',
        'AI doctor chats',
        'messages',
        {
          count: chats.count + docChats.count,
          first: earliest(chats.first, docChats.first),
          last: latest(chats.last, docChats.last),
        },
      ],
      ['weather', 'Weather samples', 'samples', weather],
    ]
      .filter(([, , , volume]) => (volume as Volume).count > 0)
      .map(([id, label, unit, volume]) =>
        aggregateNode(id as string, label as string, unit as string, volume as Volume),
      );
  }
}

/** First line of a note, trimmed to something that fits under a graph node. */
function noteLabel(content: string): string {
  const line = content.split('\n')[0].trim();
  return line.length > 42 ? `${line.slice(0, 41)}…` : line;
}

function earliest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) < new Date(b) ? a : b;
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}
