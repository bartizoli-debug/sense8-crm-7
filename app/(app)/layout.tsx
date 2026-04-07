'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import TopNav from './components/TopNav';
import AuthButton from './components/AuthButton';

const NAV_ITEMS = [
  { href: '/',                   label: 'Home',             icon: '⊞' },
  { href: '/companies',          label: 'Companies',        icon: '🏢' },
  { href: '/contacts',           label: 'People',           icon: '👤' },
  { href: '/deals',              label: 'Deals',            icon: '💼' },
  { href: '/pipeline',           label: 'Pipeline',         icon: '📊' },
  { href: '/contracts',          label: 'Contracts',        icon: '📄' },
  { href: '/renewal-center',     label: 'Renewal Center',   icon: '🔄' },
  { href: '/owner-dashboard',    label: 'Owner Dashboard',  icon: '🎯' },
  { href: '/expiring-contracts', label: 'Expiring',         icon: '⏰' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f3f4f6' }}>
      <aside
        style={{
          width: 240,
          background: '#111827',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#2DA745',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}
            >
              S
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.01em' }}>Sense8 CRM</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Sales Management</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav style={{ padding: '10px 8px', flex: 1 }}>
          {NAV_ITEMS.map(({ href, label, icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 10px',
                  borderRadius: 8,
                  marginBottom: 2,
                  color: isActive ? '#f9fafb' : '#9ca3af',
                  background: isActive ? '#1f2937' : 'transparent',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  transition: 'all 120ms ease',
                  borderLeft: isActive ? '2px solid #2DA745' : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: 14, opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>{icon}</span>
                <span>{label}</span>
                {isActive && (
                  <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#2DA745', flexShrink: 0 }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User / logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1f2937' }}>
          <AuthButton />
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopNav />
        <main style={{ flex: 1, padding: 24, boxSizing: 'border-box', minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}