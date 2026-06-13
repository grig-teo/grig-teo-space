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
      <div className="w-full max-w-md border border-border/60 bg-background/80 p-8">
        <h1 className="text-xl font-semibold mb-2">Admin</h1>
        <p className="text-sm text-muted mb-6">Enter your access key to edit site content.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block text-sm">
            Access key
            <input
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              className="mt-1 w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full border border-accent/60 px-4 py-2 text-sm hover:bg-accent/10 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
