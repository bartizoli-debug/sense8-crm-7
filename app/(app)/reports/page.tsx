'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      setLoading(false);
    }

    loadUser();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  if (loading) return null;

  // if not logged in, don't show anything here (layout will handle redirect later)
  if (!email) return null;

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span style={{ color: '#6b7280', fontSize: 13 }}>{email}</span>
      <button
        onClick={logout}
        style={{
          padding: '6px 10px',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        Logout
      </button>
    </div>
  );
}
