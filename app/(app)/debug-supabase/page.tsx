'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function DebugSupabasePage() {
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      // 1) Show what env vars are visible in the browser
      const envInfo = {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        ANON_KEY_EXISTS: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        ANON_KEY_PREFIX: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 12) ?? null,
      };

      // 2) Try a tiny request to Supabase (auth user)
      const { data: userData, error: userError } = await supabase.auth.getUser();

      // 3) Try a tiny DB call (your "companies" table)
      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id')
        .limit(1);

      setResult({
        envInfo,
        user: userData?.user ? { id: userData.user.id, email: userData.user.email } : null,
        userError: userError?.message ?? null,
        companiesSample: companies ?? null,
        companiesError: companiesError?.message ?? null,
      });
    })();
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Supabase Debug</h1>
      <p>Open DevTools Console too (F12) to see any errors.</p>
      <pre style={{ marginTop: 16, padding: 12, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'auto' }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
