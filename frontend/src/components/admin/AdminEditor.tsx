'use client';

import {
  adminGetContent,
  adminSaveBlog,
  adminSaveExperience,
  adminSaveProfile,
  adminSaveProjects,
  clearAdminToken,
  type BlogPost,
  type ExperienceItem,
  type Locale,
  type LocalizedList,
  type LocalizedString,
  type Profile,
  type Project,
  type SiteContent,
} from '@/lib/admin-api';
import { BlogBodyEditor } from '@/components/admin/BlogBodyEditor';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const locales: Locale[] = ['en', 'ru', 'ro'];
const localeLabels: Record<Locale, string> = { en: 'English', ru: 'Russian', ro: 'Romanian' };
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

function newExperienceItem(): ExperienceItem {
  const suffix = Date.now().toString(36);
  return {
    id: `experience-${suffix}`,
    period: emptyLocalizedString(),
    role: emptyLocalizedString(),
    company: 'New company',
    companyUrl: '',
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
    'mt-1 w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <label className="block text-sm">
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
  const [locale, setLocale] = useState<Locale>('en');
  const [content, setContent] = useState<SiteContent | null>(null);
  const [selectedProject, setSelectedProject] = useState(0);
  const [selectedExperience, setSelectedExperience] = useState(0);
  const [selectedBlog, setSelectedBlog] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

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

  function logout() {
    clearAdminToken();
    router.push('/admin');
  }

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
    const label = item.company || item.id;
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
        <p className="text-red-400 mb-4">{error}</p>
        <button type="button" onClick={() => router.push('/admin')} className="text-sm text-accent underline">
          Back to login
        </button>
      </main>
    );
  }

  if (!content) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
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
          <h1 className="text-xl font-semibold">Content admin</h1>
          <p className="text-sm text-muted">Changes save automatically after you stop typing.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`text-xs ${
              autosaveStatus === 'error'
                ? 'text-red-400'
                : autosaveStatus === 'pending'
                  ? 'text-muted'
                  : 'text-accent'
            }`}
          >
            {autosaveLabel()}
          </span>
          <button
            type="button"
            onClick={logout}
            className="border border-border/60 px-3 py-1.5 text-sm hover:border-accent/60"
          >
            Log out
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['profile', 'blog', 'projects', 'experience'] as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-3 py-1.5 text-sm border ${
              tab === item ? 'border-accent text-accent' : 'border-border/60 text-muted hover:text-foreground'
            }`}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {locales.map((loc) => (
          <button
            key={loc}
            type="button"
            onClick={() => setLocale(loc)}
            className={`px-3 py-1 text-xs border ${
              locale === loc ? 'border-accent text-accent' : 'border-border/60 text-muted'
            }`}
          >
            {localeLabels[loc]}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <section className="space-y-4 border border-border/60 p-4 md:p-6">
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
            label="Email"
            value={content.profile.contact.email}
            onChange={(value) =>
              updateProfile((profile) => ({
                ...profile,
                contact: { ...profile.contact, email: value },
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
        <section className="space-y-4 border border-border/60 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.blog.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedBlog(index)}
                className={`px-3 py-1 text-xs border ${
                  selectedBlog === index ? 'border-accent text-accent' : 'border-border/60 text-muted'
                }`}
              >
                {item.title.en || item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addBlogPost}
              className="px-3 py-1 text-xs border border-accent/60 text-accent"
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
              <label className="block text-sm">
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
                  className="border border-red-500/60 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
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
        <section className="space-y-4 border border-border/60 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.projects.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedProject(index)}
                className={`px-3 py-1 text-xs border ${
                  selectedProject === index ? 'border-accent text-accent' : 'border-border/60 text-muted'
                }`}
              >
                {item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addProject}
              className="px-3 py-1 text-xs border border-accent/60 text-accent"
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
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
                className="border border-red-500/60 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                Remove project
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab === 'experience' && experienceItem ? (
        <section className="space-y-4 border border-border/60 p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {content.experience.map((item, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={() => setSelectedExperience(index)}
                className={`px-3 py-1 text-xs border ${
                  selectedExperience === index ? 'border-accent text-accent' : 'border-border/60 text-muted'
                }`}
              >
                {item.company || item.id}
              </button>
            ))}
            <button
              type="button"
              onClick={addExperienceItem}
              className="px-3 py-1 text-xs border border-accent/60 text-accent"
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
            label="Company"
            value={experienceItem.company}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({ ...item, company: value }))
            }
          />
          <Field
            label="Company URL"
            value={experienceItem.companyUrl ?? ''}
            onChange={(value) =>
              updateExperienceItem(selectedExperience, (item) => ({ ...item, companyUrl: value || undefined }))
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
          <div className="flex flex-wrap gap-2">
            {content.experience.length > 1 ? (
              <button
                type="button"
                onClick={() => removeExperienceItem(selectedExperience)}
                className="border border-red-500/60 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
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
