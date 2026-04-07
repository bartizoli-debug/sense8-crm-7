'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import PageHeader from '../components/PageHeader';

type Company = {
  id: string;
  company_name: string;
  created_at: string;
};

const UI = {
  text: '#0f172a',
  text2: '#475569',
  secondary: '#475569',
  muted: '#64748b',
  border: '#e1e4e8',
  borderLight: '#f1f3f5',
  bg: '#ffffff',
  soft: '#f8f9fa',
  rowHover: '#f8f9fa',
  link: '#2563eb',
  primaryBtn: '#2DA745',
  primaryBtnHover: '#27923d',
  shadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  shadowMd: '0 4px 8px rgba(0, 0, 0, 0.08)',
};

const FW = {
  title: 700,
  strong: 600,
  normal: 500,
  body: 500,
};

const H = 42;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.border}`, background: UI.bg }}>
      {children}
    </div>
  );
}

function Button({
  children,
  href,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const [isHovered, setIsHovered] = useState(false);

  const base: React.CSSProperties = {
    height: H,
    padding: '0 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.01em',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    textDecoration: 'none',
    transition: 'all 150ms ease',
  };

  const style: React.CSSProperties =
    variant === 'primary'
      ? { ...base, border: 'none', background: disabled ? UI.muted : 'linear-gradient(to right, #2DA745 0%, #27923d 100%)', color: '#fff', boxShadow: '0 2px 4px rgba(45, 167, 69, 0.2)' }
      : { ...base, border: `1px solid ${UI.border}`, background: isHovered ? UI.soft : '#fff', color: UI.text };

  if (href) {
    return (
      <Link
        href={href}
        style={style}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  // Hover state for cards (row-hover equivalent)
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    async function loadCompanies() {
      setLoading(true);

      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, created_at')
        .order('company_name', { ascending: true });

      if (!error) {
        setCompanies((data ?? []) as Company[]);
      }

      setLoading(false);
    }

    loadCompanies();
  }, []);

  const subtitle = useMemo(() => `${companies.length} companies`, [companies.length]);

  return (
    <div style={{ padding: 16, background: 'linear-gradient(to bottom, #fafbfc 0%, #f8f9fa 100%)', minHeight: '100vh' }}>
      <PageHeader
        title="Companies"
        subtitle={subtitle}
        right={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button href="/companies/new" variant="primary">
              + New Company
            </Button>
          </div>
        }
      />

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ fontSize: 13, color: UI.muted }}>Loading…</div>
        ) : companies.length === 0 ? (
          <div style={{ fontSize: 13, color: UI.muted }}>No companies yet.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {companies.map((company) => {
              const isHover = hoverId === company.id;

              return (
                <Link
                  key={company.id}
                  href={`/companies/${company.id}`}
                  onMouseEnter={() => setHoverId(company.id)}
                  onMouseLeave={() => setHoverId(null)}
                  style={{
                    display: 'block',
                    padding: 12,
                    borderRadius: 12,
                    border: `1px solid ${UI.border}`,
                    background: isHover ? UI.soft : UI.bg,
                    textDecoration: 'none',
                    color: UI.text,
                    transition: 'background 120ms ease, transform 120ms ease, box-shadow 120ms ease',
                    transform: isHover ? 'translateY(-1px)' : 'translateY(0px)',
                    boxShadow: isHover ? UI.shadowMd : UI.shadow,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: UI.text, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                    {company.company_name}
                  </div>

                  <div style={{ fontSize: 12, color: UI.muted, marginTop: 6, fontWeight: 500 }}>
                    Created: {new Date(company.created_at).toLocaleDateString()}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
