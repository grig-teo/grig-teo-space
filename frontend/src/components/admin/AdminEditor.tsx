'use client';

import {
  adminGetContent,
  adminSaveExperience,
  adminSaveProfile,
  adminSaveProjects,
  clearAdminToken,
  type ExperienceItem,
  type Locale,
  type LocalizedList,
  type LocalizedString,
  type Profile,
  type Project,
  type SiteContent,
} from '@/lib/admin-api';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const locales: Locale[] = ['en', 'ru', 'ro'];
const localeLabels: Record<Locale, string> = { en: 'English', ru: 'Russian', ro: 'Romanian' };

type Tab = 'profile' | 'projects' | 'experience';

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

function newProject(): Project {
  const suffix = Date.now().toString(36);
  return {
    id: `project-${suffix}`,
    title: emptyLocalizedString(),
    description: emptyLocalizedString(),
    overview: emptyLocalizedString(),
    highlights: emptyLocalizedList(),
    url: '',
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

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const className =
    'mt-1 w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent';
  return (
    <label className="block text-sm">
      {label}
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={className} />
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
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await adminGetContent();
      setContent(data);
    } catch {
      setError('Failed to load content. Try signing in again.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function logout() {
    clearAdminToken();
    router.push('/admin');
  }

  async function saveProfile() {
    if (!content) return;
    setSaving(true);
    setStatus('');
    try {
      const cvRebuilt = await adminSaveProfile(content.profile);
      setStatus(cvRebuilt ? 'Profile saved. CV updated (all languages).' : 'Profile saved.');
    } catch {
      setStatus('Failed to save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function saveProjects() {
    if (!content) return;
    setSaving(true);
    setStatus('');
    try {
      const cvRebuilt = await adminSaveProjects(content.projects);
      setStatus(cvRebuilt ? 'Projects saved. CV updated (all languages).' : 'Projects saved.');
    } catch {
      setStatus('Failed to save projects.');
    } finally {
      setSaving(false);
    }
  }

  async function saveExperience() {
    if (!content) return;
    setSaving(true);
    setStatus('');
    try {
      const cvRebuilt = await adminSaveExperience(content.experience);
      setStatus(cvRebuilt ? 'Experience saved. CV updated (all languages).' : 'Experience saved.');
    } catch {
      setStatus('Failed to save experience.');
    } finally {
      setSaving(false);
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
    if (!window.confirm(`Remove project "${project.id}"? Click Save projects to apply.`)) {
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
    if (!window.confirm(`Remove experience "${label}"? Click Save experience to apply.`)) {
      return;
    }
    setContent((prev) => {
      if (!prev || prev.experience.length <= 1) return prev;
      const experience = prev.experience.filter((_, i) => i !== index);
      setSelectedExperience(Math.max(0, Math.min(index, experience.length - 1)));
      return { ...prev, experience };
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

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-semibold">Content admin</h1>
          <p className="text-sm text-muted">Edit portfolio texts stored in the database.</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="border border-border/60 px-3 py-1.5 text-sm hover:border-accent/60"
        >
          Log out
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['profile', 'projects', 'experience'] as Tab[]).map((item) => (
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
          <button
            type="button"
            onClick={saveProfile}
            disabled={saving}
            className="border border-accent/60 px-4 py-2 text-sm hover:bg-accent/10 disabled:opacity-50"
          >
            Save profile
          </button>
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
            label="URL"
            value={project.url}
            onChange={(value) => updateProject(selectedProject, (item) => ({ ...item, url: value }))}
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
            <button
              type="button"
              onClick={saveProjects}
              disabled={saving}
              className="border border-accent/60 px-4 py-2 text-sm hover:bg-accent/10 disabled:opacity-50"
            >
              Save projects
            </button>
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
            <button
              type="button"
              onClick={saveExperience}
              disabled={saving}
              className="border border-accent/60 px-4 py-2 text-sm hover:bg-accent/10 disabled:opacity-50"
            >
              Save experience
            </button>
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

      {status ? <p className="mt-4 text-sm text-accent">{status}</p> : null}
    </main>
  );
}
