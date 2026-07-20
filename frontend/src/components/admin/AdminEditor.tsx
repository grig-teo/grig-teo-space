'use client';

import {
  adminGetContent,
  adminSaveBlog,
  adminSaveExperience,
  adminSaveProfile,
  adminSaveProjects,
  adminUploadMedia,
  type BlogPost,
  type ExperienceItem,
  type LocalizedList,
  type LocalizedString,
  type Profile,
  type Project,
  type SiteContent,
} from '@/lib/admin-api';
import { attachmentType } from '@/lib/attachments';
import { useAdminLocale } from '@/components/admin/AdminLocale';
import { BlogBodyEditor } from '@/components/admin/BlogBodyEditor';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const AUTOSAVE_DELAY_MS = 1500;

type Tab = 'profile' | 'blog' | 'projects' | 'experience';
type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

function getTabSnapshot(content: SiteContent, tab: Tab): string {
  switch (tab) {
    case 'profile':
      return JSON.stringify(content.profile);
    case 'blog':
      return JSON.stringify(content.blog);
    case 'projects':
      return JSON.stringify(content.projects);
    case 'experience':
      return JSON.stringify(content.experience);
  }
}

function emptySnapshots(): Record<Tab, string> {
  return { profile: '', blog: '', projects: '', experience: '' };
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function listToLines(items: string[]): string {
  return items.join('\n');
}

function emptyLocalizedString(): LocalizedString {
  return { en: '', ru: '', ro: '' };
}

function emptyLocalizedList(): LocalizedList {
  return { en: [], ru: [], ro: [] };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeProject(project: Project & { url?: LocalizedString | string }): Project {
  const url = project.url;
  if (typeof url === 'string') {
    return { ...project, url: { en: url, ru: url, ro: url } };
  }
  return {
    ...project,
    url: {
      en: url.en ?? '',
      ru: url.ru ?? '',
      ro: url.ro ?? '',
    },
  };
}

function newProject(): Project {
  const suffix = Date.now().toString(36);
  return {
    id: `project-${suffix}`,
    title: emptyLocalizedString(),
    description: emptyLocalizedString(),
    overview: emptyLocalizedString(),
    highlights: emptyLocalizedList(),
    url: emptyLocalizedString(),
    tags: [],
    inDevelopment: false,
  };
}

function normalizeExperience(
  item: ExperienceItem & { company?: LocalizedString | string; companyUrl?: LocalizedString | string },
): ExperienceItem {
  const company = item.company;
  const normalizedCompany: LocalizedString =
    typeof company === 'string'
      ? { en: company, ru: company, ro: company }
      : {
          en: company?.en ?? '',
          ru: company?.ru ?? '',
          ro: company?.ro ?? '',
        };

  const companyUrl = item.companyUrl;
  let normalizedCompanyUrl: LocalizedString | undefined;
  if (companyUrl === undefined || companyUrl === null || companyUrl === '') {
    normalizedCompanyUrl = undefined;
  } else if (typeof companyUrl === 'string') {
    normalizedCompanyUrl = companyUrl ? { en: companyUrl, ru: companyUrl, ro: companyUrl } : undefined;
  } else {
    const hasAny = Boolean(companyUrl.en || companyUrl.ru || companyUrl.ro);
    normalizedCompanyUrl = hasAny
      ? {
          en: companyUrl.en ?? '',
          ru: companyUrl.ru ?? '',
          ro: companyUrl.ro ?? '',
        }
      : undefined;
  }

  return { ...item, company: normalizedCompany, companyUrl: normalizedCompanyUrl };
}

function newExperienceItem(): ExperienceItem {
  const suffix = Date.now().toString(36);
  return {
    id: `experience-${suffix}`,
    period: emptyLocalizedString(),
    role: emptyLocalizedString(),
    company: emptyLocalizedString(),
    companyUrl: emptyLocalizedString(),
    description: emptyLocalizedString(),
    summary: emptyLocalizedString(),
    highlights: emptyLocalizedList(),
    stack: emptyLocalizedString(),
  };
}

function newBlogPost(): BlogPost {
  const suffix = Date.now().toString(36);
  return {
    id: `article-${suffix}`,
    title: emptyLocalizedString(),
    excerpt: emptyLocalizedString(),
    body: emptyLocalizedString(),
    publishedAt: new Date().toISOString().slice(0, 10),
  };
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
}) {
  const className =
    'mt-1 w-full rounded border border-border bg-background px-3 py-2 font-sans text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent';
  return (
    <label className="block font-mono text-xs uppercase tracking-wider text-muted">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={className} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={className} />
      )}
    </label>
  );
}

export function AdminEditor() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('profile');
  const { locale } = useAdminLocale();
  const [content, setContent] = useState<SiteContent | null>(null);
  const [selectedProject, setSelectedProject] = useState(0);
  const [selectedExperience, setSelectedExperience] = useState(0);
  const [selectedBlog, setSelectedBlog] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentUploading, setAttachmentUploading] = useState(false);

  const contentRef = useRef<SiteContent | null>(null);
  const savedSnapshotsRef = useRef<Record<Tab, string>>(emptySnapshots());
  const savingRef = useRef(false);
  const pendingTabRef = useRef<Tab | null>(null);
  const prevTabRef = useRef<Tab>('profile');

  contentRef.current = content;

  const load = useCallback(async () => {
    setError('');
    setReady(false);
    try {
      const data = await adminGetContent();
      const nextContent = {
        ...data,
        blog: data.blog ?? [],
        projects: data.projects.map(normalizeProject),
        experience: data.experience.map(normalizeExperience),
      };
      setContent(nextContent);
      savedSnapshotsRef.current = {
        profile: JSON.stringify(nextContent.profile),
        blog: JSON.stringify(nextContent.blog),
        projects: JSON.stringify(nextContent.projects),
        experience: JSON.stringify(nextContent.experience),
      };
      setAutosaveStatus('saved');
      setReady(true);
    } catch {
      setError('Failed to load content. Try signing in again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persistTab = useCallback(async (targetTab: Tab) => {
    const snapshot = contentRef.current;
    if (!snapshot) return;

    if (savingRef.current) {
      pendingTabRef.current = targetTab;
      return;
    }

    savingRef.current = true;
    setAutosaveStatus('saving');

    try {
      switch (targetTab) {
        case 'profile':
          await adminSaveProfile(snapshot.profile);
          break;
        case 'blog':
          await adminSaveBlog(snapshot.blog);
          break;
        case 'projects':
          await adminSaveProjects(snapshot.projects);
          break;
        case 'experience':
          await adminSaveExperience(snapshot.experience);
          break;
      }

      savedSnapshotsRef.current[targetTab] = getTabSnapshot(snapshot, targetTab);
      setAutosaveStatus('saved');
    } catch {
      setAutosaveStatus('error');
    } finally {
      savingRef.current = false;
      const pending = pendingTabRef.current;
      pendingTabRef.current = null;
      if (pending) {
        void persistTab(pending);
      }
    }
  }, []);

  useEffect(() => {
    if (!ready || !content) return;

    const currentSnapshot = getTabSnapshot(content, tab);
    if (currentSnapshot === savedSnapshotsRef.current[tab]) {
      return;
    }

    setAutosaveStatus('pending');
    const timer = window.setTimeout(() => {
      void persistTab(tab);
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [content, tab, ready, persistTab]);

  useEffect(() => {
    if (!ready || !content) return;

    const prev = prevTabRef.current;
    if (prev !== tab) {
      const prevSnapshot = getTabSnapshot(content, prev);
      if (prevSnapshot !== savedSnapshotsRef.current[prev]) {
        void persistTab(prev);
      }
      prevTabRef.current = tab;
    }
  }, [tab, content, ready, persistTab]);

  useEffect(() => {
    if (!ready) return;

    return () => {
      const snapshot = contentRef.current;
      if (!snapshot) return;

      for (const targetTab of ['profile', 'blog', 'projects', 'experience'] as Tab[]) {
        if (getTabSnapshot(snapshot, targetTab) !== savedSnapshotsRef.current[targetTab]) {
          void persistTab(targetTab);
        }
      }
    };
  }, [ready, persistTab]);

  function autosaveLabel(): string {
    switch (autosaveStatus) {
      case 'pending':
        return 'Unsaved changes…';
      case 'saving':
        return 'Saving…';
      case 'saved':
        return 'All changes saved';
      case 'error':
        return 'Autosave failed';
      default:
        return 'Autosave enabled';
    }
  }

  function addProject() {
    setContent((prev) => {
      if (!prev) return prev;
      const maxOrder = Math.max(0, ...prev.projects.map((p) => p.sortOrder ?? 0));
      const project = { ...newProject(), sortOrder: maxOrder + 1 };
      const projects = [project, ...prev.projects];
      setSelectedProject(0);
      return { ...prev, projects };
    });
  }

  function removeProject(index: number) {
    if (!content || content.projects.length <= 1) return;
    const project = content.projects[index];
    if (!window.confirm(`Remove project "${project.id}"? This will autosave.`)) {
      return;
    }
    setContent((prev) => {
      if (!prev || prev.projects.length <= 1) return prev;
      const projects = prev.projects.filter((_, i) => i !== index);
      setSelectedProject(Math.max(0, Math.min(index, projects.length - 1)));
      return { ...prev, projects };
    });
  }

  function addExperienceItem() {
    setContent((prev) => {
      if (!prev) return prev;
      const experience = [...prev.experience, newExperienceItem()];
      setSelectedExperience(experience.length - 1);
      return { ...prev, experience };
    });
  }

  function removeExperienceItem(index: number) {
    if (!content || content.experience.length <= 1) return;
    const item = content.experience[index];
    const label = item.company.en || item.id;
    if (!window.confirm(`Remove experience "${label}"? This will autosave.`)) {
      return;
    }
    setContent((prev) => {
      if (!prev || prev.experience.length <= 1) return prev;
      const experience = prev.experience.filter((_, i) => i !== index);
      setSelectedExperience(Math.max(0, Math.min(index, experience.length - 1)));
      return { ...prev, experience };
    });
  }

  function addBlogPost() {
    setContent((prev) => {
      if (!prev) return prev;
      const blog = [newBlogPost(), ...prev.blog];
      setSelectedBlog(0);
      return { ...prev, blog };
    });
  }

  function removeBlogPost(index: number) {
    if (!content) return;
    const post = content.blog[index];
    const label = post.title.en || post.id;
    if (!window.confirm(`Remove article "${label}"? This will autosave.`)) {
      return;
    }
    setContent((prev) => {
      if (!prev) return prev;
      const blog = prev.blog.filter((_, i) => i !== index);
      setSelectedBlog(Math.max(0, Math.min(index, blog.length - 1)));
      return { ...prev, blog };
    });
  }

  function updateProfile(updater: (profile: Profile) => Profile) {
    setContent((prev) => (prev ? { ...prev, profile: updater(prev.profile) } : prev));
  }

  function updateProject(index: number, updater: (project: Project) => Project) {
    setContent((prev) => {
      if (!prev) return prev;
      const projects = [...prev.projects];
      projects[index] = updater(projects[index]);
      return { ...prev, projects };
    });
  }

  function updateExperienceItem(index: number, updater: (item: ExperienceItem) => ExperienceItem) {
    setContent((prev) => {
      if (!prev) return prev;
      const experience = [...prev.experience];
      experience[index] = updater(experience[index]);
      return { ...prev, experience };
    });
  }

  /** Appends an attachment (video/image/doc) to the selected experience item. */
  function addExperienceAttachment(url: string) {
    const clean = url.trim();
    if (!clean) return;
    updateExperienceItem(selectedExperience, (item) => ({
      ...item,
      attachments: [...(item.attachments ?? []), { url: clean }],
    }));
  }

  /** Uploads files to media storage, then attaches the returned URLs. */
  async function uploadExperienceAttachments(files: File[]) {
    setAttachmentUploading(true);
    setError('');
    try {
      for (const file of files) {
        const url = await adminUploadMedia(file);
        addExperienceAttachment(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setAttachmentUploading(false);
    }
  }

  function updateBlogPost(index: number, updater: (post: BlogPost) => BlogPost) {
    setContent((prev) => {
      if (!prev) return prev;
      const blog = [...prev.blog];
      blog[index] = updater(blog[index]);
      return { ...prev, blog };
    });
  }

  if (error) {
    return (
      <main className="min-h-screen p-6 max-w-5xl mx-auto">
        <p className="mb-4 font-mono text-sm text-red-400">{error}</p>
        <button type="button" onClick={() => router.push('/admin')} className="font-mono text-sm text-accent underline">
          Back to login
        </button>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-muted">Loading…</p>
      </main>
    );
  }

  const project = content.projects[selectedProject];
  const experienceItem = content.experience[selectedExperience];
  const blogPost = content.blog[selectedBlog];

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-mono text-xl font-semibold">Content admin</h1>
          <p className="text-sm text-muted">Changes save automatically after you stop typing.</p>
        </div>
        <a
          href="https://grig-teo.space/OpenHands/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-accent/60 px-3 py-1.5 font-mono text-sm text-accent transition-colors hover:bg-accent/10"
        >
          OpenHands ↗
        </a>
      </div>

      <div className="sticky top-[57px] z-10 mb-6 border-b border-border bg-background/80 py-2 backdrop-blur">
        <span
          className={`font-mono text-xs ${
            autosaveStatus === 'error'
              ? 'text-red-400'
              : autosaveStatus === 'pending'
                ? 'text-muted'
                : 'text-accent'
          }`}
        >
          {autosaveLabel()}
        </span>
      </div>

      <div className="mb-6 inline-flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
        {(['profile', 'blog', 'projects', 'experience'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-md px-3 py-1.5 font-mono text-sm transition-colors ${
              tab === item ? 'bg-accent text-background' : 'text-muted hover:text-foreground'
            }`}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <Field
            label={`Name (${locale})`}
            value={content.profile.name[locale]}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                name: { ...profile.name, [locale]: value },
              }))
            }
          />
          <Field
            label={`Title (${locale})`}
            value={content.profile.title[locale]}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                title: { ...profile.title, [locale]: value },
              }))
            }
          />
          <Field
            label={`Location (${locale})`}
            value={content.profile.location[locale]}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                location: { ...profile.location, [locale]: value },
              }))
            }
          />
          <Field
            label={`About / Life story (${locale})`}
            value={content.profile.about[locale]}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                about: { ...profile.about, [locale]: value },
              }))
            }
            multiline
            rows={8}
          />
          <Field
            label={`Email (${locale})`}
            value={content.profile.contact.email[locale]}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                contact: {
                  ...profile.contact,
                  email: { ...profile.contact.email, [locale]: value },
                },
              }))
            }
          />
          <Field
            label="GitHub URL"
            value={content.profile.contact.github}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                contact: { ...profile.contact, github: value },
              }))
            }
          />
          <Field
            label="LinkedIn URL"
            value={content.profile.contact.linkedin}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                contact: { ...profile.contact, linkedin: value },
              }))
            }
          />
          <Field
            label={`Phone (${locale})`}
            value={content.profile.contact.phone?.[locale] ?? ''}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                contact: {
                  ...profile.contact,
                  phone: { en: '', ru: '', ro: '', ...profile.contact.phone, [locale]: value },
                },
              }))
            }
          />
        </section>
      ) : null}

      {tab === 'blog' ? (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.blog.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedBlog(index)}
                className={`rounded border px-3 py-1 font-mono text-xs transition-colors ${
                  selectedBlog === index ? 'border-accent text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {item.title.en || item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addBlogPost}
              className="rounded border border-accent/60 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
            >
              + Add article
            </button>
          </div>

          {blogPost ? (
            <>
              <Field
                label="ID (used in URLs, e.g. /blog/my-article)"
                value={blogPost.id}
                onChange={(value) =>
                  updateBlogPost(selectedBlog, (item) => ({
                    ...item,
                    id: slugify(value) || item.id,
                  }))
                }
              />
              <Field
                label="Published date (YYYY-MM-DD)"
                value={blogPost.publishedAt}
                onChange={(value) =>
                  updateBlogPost(selectedBlog, (item) => ({ ...item, publishedAt: value }))
                }
              />
              <Field
                label={`Title (${locale})`}
                value={blogPost.title[locale]}
                onChange={(value) =>
                  updateBlogPost(selectedBlog, (item) => ({
                    ...item,
                    title: { ...item.title, [locale]: value },
                  }))
                }
              />
              <Field
                label={`Excerpt (${locale})`}
                value={blogPost.excerpt[locale]}
                onChange={(value) =>
                  updateBlogPost(selectedBlog, (item) => ({
                    ...item,
                    excerpt: { ...item.excerpt, [locale]: value },
                  }))
                }
                multiline
              />
              <label className="block font-mono text-xs uppercase tracking-wider text-muted">
                Body ({locale})
                <BlogBodyEditor
                  key={`${blogPost.id}-${locale}`}
                  value={blogPost.body[locale]}
                  onChange={(value) =>
                    updateBlogPost(selectedBlog, (item) => ({
                      ...item,
                      body: { ...item.body, [locale]: value },
                    }))
                  }
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => removeBlogPost(selectedBlog)}
                  className="rounded border border-red-400/40 px-4 py-2 font-mono text-sm text-red-400 transition-colors hover:bg-red-400/10"
                >
                  Remove article
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No articles yet. Click “Add article” to create one.</p>
          )}
        </section>
      ) : null}

      {tab === 'projects' && project ? (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.projects.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedProject(index)}
                className={`rounded border px-3 py-1 font-mono text-xs transition-colors ${
                  selectedProject === index ? 'border-accent text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addProject}
              className="rounded border border-accent/60 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
            >
              + Add project
            </button>
          </div>
          <Field
            label="ID (used in URLs)"
            value={project.id}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                id: slugify(value) || item.id,
              }))
            }
          />
          <Field
            label={`Title (${locale})`}
            value={project.title[locale]}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                title: { ...item.title, [locale]: value },
              }))
            }
          />
          <Field
            label={`Description (${locale})`}
            value={project.description[locale]}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                description: { ...item.description, [locale]: value },
              }))
            }
            multiline
          />
          <Field
            label={`Overview (${locale})`}
            value={project.overview[locale]}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                overview: { ...item.overview, [locale]: value },
              }))
            }
            multiline
          />
          <Field
            label={`Highlights (${locale}, one per line)`}
            value={listToLines(project.highlights[locale])}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                highlights: { ...item.highlights, [locale]: linesToList(value) },
              }))
            }
            multiline
          />
          <Field
            label={`URL (${locale})`}
            value={project.url[locale]}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                url: { ...item.url, [locale]: value },
              }))
            }
          />
          <Field
            label="Tags (comma-separated)"
            value={project.tags.join(', ')}
            onChange={(value) =>
              updateProject(selectedProject, (item) => ({
                ...item,
                tags: value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              }))
            }
          />
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--color-accent))]"
              checked={project.inDevelopment ?? false}
              onChange={(e) =>
                updateProject(selectedProject, (item) => ({
                  ...item,
                  inDevelopment: e.target.checked,
                }))
              }
            />
            In development
          </label>
          <div className="flex flex-wrap gap-2">
            {content.projects.length > 1 ? (
              <button
                type="button"
                onClick={() => removeProject(selectedProject)}
                className="rounded border border-red-400/40 px-4 py-2 font-mono text-sm text-red-400 transition-colors hover:bg-red-400/10"
              >
                Remove project
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'experience' && experienceItem ? (
        <section className="space-y-4 rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.experience.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedExperience(index)}
                className={`rounded border px-3 py-1 font-mono text-xs transition-colors ${
                  selectedExperience === index ? 'border-accent text-accent' : 'border-border text-muted hover:text-foreground'
                }`}
              >
                {item.company.en || item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addExperienceItem}
              className="rounded border border-accent/60 px-3 py-1 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
            >
              + Add experience
            </button>
          </div>
          <Field
            label="ID (used in URLs, e.g. /experience/my-id)"
            value={experienceItem.id}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                id: slugify(value) || item.id,
              }))
            }
          />
          <Field
            label={`Period (${locale})`}
            value={experienceItem.period[locale]}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                period: { ...item.period, [locale]: value },
              }))
            }
          />
          <Field
            label={`Role (${locale})`}
            value={experienceItem.role[locale]}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                role: { ...item.role, [locale]: value },
              }))
            }
          />
          <Field
            label={`Company (${locale})`}
            value={experienceItem.company[locale]}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                company: { ...item.company, [locale]: value },
              }))
            }
          />
          <Field
            label={`Company URL (${locale})`}
            value={experienceItem.companyUrl?.[locale] ?? ''}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                companyUrl: { en: '', ru: '', ro: '', ...item.companyUrl, [locale]: value },
              }))
            }
          />
          <Field
            label={`Description (${locale})`}
            value={experienceItem.description[locale]}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                description: { ...item.description, [locale]: value },
              }))
            }
            multiline
          />
          <Field
            label={`Summary (${locale})`}
            value={experienceItem.summary?.[locale] ?? ''}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                summary: { en: '', ru: '', ro: '', ...item.summary, [locale]: value },
              }))
            }
            multiline
          />
          <Field
            label={`Highlights (${locale}, one per line)`}
            value={listToLines(experienceItem.highlights[locale])}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                highlights: { ...item.highlights, [locale]: linesToList(value) },
              }))
            }
            multiline
          />
          <Field
            label={`Stack (${locale})`}
            value={experienceItem.stack?.[locale] ?? ''}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({
                ...item,
                stack: { en: '', ru: '', ro: '', ...item.stack, [locale]: value },
              }))
            }
          />
          <div className="space-y-2 rounded border border-border p-3">
            <span className="block font-mono text-xs uppercase tracking-wider text-muted">
              Attachments (video, images, docs)
            </span>
            {(experienceItem.attachments ?? []).map((attachment, index) => (
              <div key={`${attachment.url}-${index}`} className="flex items-center gap-2">
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent">
                  {attachmentType(attachment)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={attachment.url}>
                  {attachment.title ?? attachment.url.split('/').pop()}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateExperienceItem(selectedExperience, (item) => ({
                      ...item,
                      attachments: (item.attachments ?? []).filter((_, i) => i !== index),
                    }))
                  }
                  className="rounded border border-red-400/40 px-2 py-0.5 font-mono text-[10px] text-red-400 transition-colors hover:bg-red-400/10"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://…/file.mp4"
                className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted/60"
              />
              <button
                type="button"
                onClick={() => {
                  addExperienceAttachment(attachmentUrl);
                  setAttachmentUrl('');
                }}
                className="rounded border border-accent/60 px-3 py-2 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
              >
                Add URL
              </button>
              <label
                className={`rounded border px-3 py-2 font-mono text-xs transition-colors ${
                  attachmentUploading
                    ? 'border-border text-muted'
                    : 'cursor-pointer border-accent/60 text-accent hover:bg-accent/10'
                }`}
              >
                {attachmentUploading ? 'Uploading…' : 'Upload file(s)'}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  disabled={attachmentUploading}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (files.length > 0) void uploadExperienceAttachments(files);
                  }}
                />
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {content.experience.length > 1 ? (
              <button
                type="button"
                onClick={() => removeExperienceItem(selectedExperience)}
                className="rounded border border-red-400/40 px-4 py-2 font-mono text-sm text-red-400 transition-colors hover:bg-red-400/10"
              >
                Remove experience
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
