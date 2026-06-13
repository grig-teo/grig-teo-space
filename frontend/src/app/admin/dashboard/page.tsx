'use client';

import { AdminEditor } from '@/components/admin/AdminEditor';
import { adminVerify, clearAdminToken } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    adminVerify().then((ok) => {
      if (!ok) {
        clearAdminToken();
        router.replace('/admin');
        return;
      }
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Checking access…</p>
      </main>
    );
  }

  return <AdminEditor />;
}
