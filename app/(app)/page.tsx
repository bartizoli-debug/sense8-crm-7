'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';

interface Company {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  created_at: string;
  contact_id?: string | null;
}

interface KPIs {
  companies: number;
  activeContracts: number;
  openDeals: number;
  expiringContracts: number;
}

const C = {
  text: '#0f172a',
  text2: '#475569',
  muted: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  bg: '#f8fafc',
  card: '#ffffff',
  primary: '#2DA745',
  primarySoft: '#f0fdf4',
  danger: '#991b1b',
  dangerSoft: '#fef2f2',
  dangerBorder: '#fecaca',
  warn: '#92400e',
  warnSoft: '#fffbeb',
  warnBorder: '#fde68a',
  blue: '#1e40af',
  blueSoft: '#eff6ff',
  blueBorder: '#bfdbfe',
  shadow: '0 1px 3px rgba(0,0,0,0.06)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08)',
};

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
}

export default function HomePage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [kpis, setKpis] = useState<KPIs>({
    companies: 0,
    activeContracts: 0,
    openDeals: 0,
    expiringContracts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        window.location.href = `/login?next=${encodeURIComponent(
          window.location.pathname || '/'
        )}`;
        return;
      }

      const [
        { data: companiesData },
        { count: contractCount },
        { count: dealsCount },
        { count: expiringCount },
      ] = await Promise.all([
        supabase
          .from('companies')
          .select(
            'id, company_name, contact_name, email, created_at, contact_id'
          )
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('contracts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Active'),
        supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .in('stage', ['Lead', 'Qualified', 'Proposal']),
        supabase
          .from('contracts')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'Active')
          .lt(
            'expiry_date',
            new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)
          )
          .not('expiry_date', 'is', null),
      ]);

      if (!mounted) return;

      setCompanies((companiesData ?? []) as Company[]);
      setKpis({
        companies: companiesData?.length ?? 0,
        activeContracts: contractCount ?? 0,
        openDeals: dealsCount ?? 0,
        expiringContracts: expiringCount ?? 0,
      });
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.company_name, c.contact_name, c.email].some(
        (v) => v && v.toLowerCase().includes(q)
      )
    );
  }, [companies, search]);

  function contactHref(c: Company) {
    if (c.contact_id) return `/contacts/${c.contact_id}`;
    return `/contacts?companyId=${encodeURIComponent(c.id)}`;
  }

  const QUICK_LINKS = [
    { href: '/companies/new', label: '+ New Company', primary: true },
    { href: '/deals/new', label: '+ New Deal', primary: true },
    { href: '/contracts?new=1', label: '+ New Contract', primary: true },
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/renewal-center', label: 'Renewal Center' },
    { href: '/expiring-contracts', label: 'Expiring Contracts' },
  ];

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1400 }}>
      {/* KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        {[
          {
            label: 'Companies',
            value: loading ? '…' : kpis.companies,
            icon: '🏢',
            soft: C.blueSoft,
            border: C.blueBorder,
            text: C.blue,
          },
          {
            label: 'Active Contracts',
            value: loading ? '…' : kpis.activeContracts,
            icon: '📄',
            soft: C.primarySoft,
            border: '#bbf7d0',
            text: '#166534',
          },
          {
            label: 'Open Deals',
            value: loading ? '…' : kpis.openDeals,
            icon: '💼',
            soft: C.warnSoft,
            border: C.warnBorder,
            text: C.warn,
          },
          {
            label: 'Expiring (90d)',
            value: loading ? '…' : kpis.expiringContracts,
            icon: '⏰',
            soft: kpis.expiringContracts > 0 ? C.dangerSoft : C.primarySoft,
            border: kpis.expiringContracts > 0 ? C.dangerBorder : '#bbf7d0',
            text: kpis.expiringContracts > 0 ? C.danger : '#166534',
          },
        ].map(({ label, value, icon, soft, border, text }) => (
          <div
            key={label}
            style={{
              background: soft,
              border: `1px solid ${border}`,
              borderRadius: 12,
              padding: '16px 18px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ fontSize: 20 }}>{icon}</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: text,
                marginTop: 6,
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: text,
                marginTop: 4,
                opacity: 0.8,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: C.shadow,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.muted,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Quick actions
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {QUICK_LINKS.map(({ href, label, primary }) => (
            <Link
              key={href}
              href={href}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                border: primary ? 'none' : `1px solid ${C.border}`,
                background: primary ? C.primary : C.card,
                color: primary ? '#fff' : C.text2,
                transition: 'all 120ms ease',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Companies Table */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          boxShadow: C.shadow,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              Recent Companies
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {loading ? 'Loading…' : `${companies.length} companies`}
            </div>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact, email…"
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              fontSize: 13,
              color: C.text,
              background: '#fff',
              outline: 'none',
              width: 'min(300px, 100%)',
              boxSizing: 'border-box',
            }}
          />
          <Link
            href="/companies"
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              border: `1px solid ${C.border}`,
              color: C.text2,
              whiteSpace: 'nowrap',
            }}
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: C.muted,
              fontSize: 13,
            }}
          >
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: C.muted,
              fontSize: 13,
            }}
          >
            No matches.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 13,
                minWidth: 700,
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Company', 'Contact', 'Email', 'Created', ''].map((h) => (
                    <th
                      key={h || 'actions'}
                      style={{
                        textAlign: 'left',
                        padding: '10px 16px',
                        fontSize: 11,
                        fontWeight: 700,
                        color: C.muted,
                        borderBottom: `1px solid ${C.border}`,
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const hover = hoveredId === c.id;
                  return (
                    <tr
                      key={c.id}
                      onMouseEnter={() => setHoveredId(c.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      style={{
                        background: hover ? '#f8fafc' : 'transparent',
                        transition: 'background 100ms',
                      }}
                    >
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                        }}
                      >
                        <Link
                          href={`/companies/${c.id}`}
                          style={{
                            color: C.text,
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          {c.company_name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                        }}
                      >
                        {c.contact_name ? (
                          <Link
                            href={contactHref(c)}
                            style={{ color: C.text2, textDecoration: 'none' }}
                          >
                            {c.contact_name}
                          </Link>
                        ) : (
                          <span style={{ color: C.muted }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                        }}
                      >
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            style={{ color: C.primary, textDecoration: 'none' }}
                          >
                            {c.email}
                          </a>
                        ) : (
                          <span style={{ color: C.muted }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                          color: C.muted,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatDate(c.created_at)}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                          whiteSpace: 'nowrap',
                          textAlign: 'right',
                        }}
                      >
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: 6,
                            opacity: hover ? 1 : 0,
                            transition: 'opacity 120ms',
                            pointerEvents: hover ? 'auto' : 'none',
                          }}
                        >
                          <Link
                            href={`/companies/${c.id}`}
                            style={{
                              height: 28,
                              padding: '0 10px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              background: C.primary,
                              color: '#fff',
                              border: 'none',
                            }}
                          >
                            Open
                          </Link>
                          <Link
                            href={contactHref(c)}
                            style={{
                              height: 28,
                              padding: '0 10px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              background: '#fff',
                              color: C.text2,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            People
                          </Link>
                          <Link
                            href={`/deals?companyId=${encodeURIComponent(
                              c.id
                            )}`}
                            style={{
                              height: 28,
                              padding: '0 10px',
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                              background: '#fff',
                              color: C.text2,
                              border: `1px solid ${C.border}`,
                            }}
                          >
                            Deals
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
