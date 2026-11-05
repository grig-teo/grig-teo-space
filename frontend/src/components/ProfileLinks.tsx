import type { Profile } from '@/lib/api';

type Props = {
  contact: Profile['contact'];
  /** "Email" (or its translation) is the only label that changes per locale. */
  emailLabel: string;
};

const LINK =
  'font-mono text-sm text-muted underline-offset-4 transition-colors hover:text-accent hover:underline';

/**
 * Labelled contact links. The footer keeps icon-only links, but anything a
 * crawler or a CTA should follow gets real text, which is also clearer for
 * screen readers than a bare icon.
 */
export function ProfileLinks({ contact, emailLabel }: Props) {
  const items = [
    { key: 'email', href: `mailto:${contact.email}`, label: emailLabel, text: contact.email },
    { key: 'github', href: contact.github, label: 'GitHub', text: 'GitHub' },
    { key: 'linkedin', href: contact.linkedin, label: 'LinkedIn', text: 'LinkedIn' },
    ...(contact.gitverse
      ? [{ key: 'gitverse', href: contact.gitverse, label: 'GitVerse', text: 'GitVerse' }]
      : []),
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {items.map((item) => (
        <li key={item.key}>
          <a
            href={item.href}
            aria-label={item.label}
            {...(item.href.startsWith('mailto:')
              ? {}
              : { target: '_blank', rel: 'noopener noreferrer' })}
            className={LINK}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
