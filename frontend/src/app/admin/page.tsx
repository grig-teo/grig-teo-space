'use client';

import { adminLogin } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminLogin(accessKey.trim());
      router.push('/admin/dashboard');
    } catch {
      setError('Invalid access key');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8">
        <h1 className="mb-2 font-mono text-xl font-semibold">grig-teo:~$ admin</h1>
        <p className="mb-6 text-sm text-muted">Enter your access key to edit site content.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block font-mono text-xs uppercase tracking-wider text-muted">
            Access key
            <input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              className="mt-1 w-full rounded border border-border bg-background px-3 py-2 font-sans text-sm normal-case tracking-normal text-foreground outline-none focus:border-accent"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="font-mono text-xs text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-4 py-2 font-mono text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
