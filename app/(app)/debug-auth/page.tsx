'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';


export default function DebugAuthPage() {
  const [out, setOut] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      setOut({
        supabaseUrlPrefix: (process.env.NEXT_PUBLIC_SUPABASE_URL || '').slice(0, 40),
        sessionExists: Boolean(sessionData.session),
        userId: userData.user?.id ?? null,
        userEmail: userData.user?.email ?? null,
        sessionError: sessErr?.message ?? null,
        userError: userErr?.message ?? null,
      });
    })();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Debug Auth</h1>
      <pre style={{ marginTop: 12, padding: 12, background: '#f3f4f6', borderRadius: 8, overflow: 'auto' }}>
        {JSON.stringify(out, null, 2)}
      </pre>
    </div>
  );
}
