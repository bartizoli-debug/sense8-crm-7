'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function AuthButton() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setEmail(session?.user?.email ?? null);
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

  if (!email) return null;

  const initial = email.charAt(0).toUpperCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Avatar */}
      <div
        style={{
          width: 30, height: 30, borderRadius: '50%',
          background: '#374151',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, color: '#d1d5db',
          flexShrink: 0,
        }}
      >
        {initial}
      </div>

      {/* Email truncated */}
      <span
        style={{
          color: '#9ca3af', fontSize: 12,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1, minWidth: 0,
        }}
        title={email}
      >
        {email}
      </span>

      {/* Logout button */}
      <button
        onClick={logout}
        title="Logout"
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          border: '1px solid #374151',
          borderRadius: 6,
          background: 'transparent',
          color: '#6b7280',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 600,
          transition: 'all 120ms ease',
        }}
      >
        Out
      </button>
    </div>
  );
}