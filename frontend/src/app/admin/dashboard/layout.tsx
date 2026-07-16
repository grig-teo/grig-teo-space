'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clearAdminToken } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';

const links: Array<{ href: string; label: string }> = [
  { href: '/admin/dashboard', label: 'Content' },
  { href: '/admin/dashboard/health', label: 'Health' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = () => {
    clearAdminToken();
    router.replace('/admin');
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="font-mono text-sm text-muted">grig-teo:~$ admin</span>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {links.map((link) => {
              const active =
                link.href === '/admin/dashboard'
                  ? pathname === '/admin/dashboard'
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 font-mono text-sm transition-colors ${
                    active ? 'bg-accent text-background' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto">
            <button
              onClick={logout}
              className="rounded px-3 py-1.5 text-sm font-mono text-muted transition-colors hover:text-foreground hover:bg-foreground/5"
            >
              Logout
            </button>
          </div>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
