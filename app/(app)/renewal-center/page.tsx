'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

import PageHeader from '../components/PageHeader';

type RenewalStatus = 'COVERED' | 'AT_RISK' | 'UNCOVERED';
type ActionQueue = 'ALL' | 'NEEDS_DEAL' | 'NEEDS_ESCALATION' | 'DUE_14';
type ViewMode = 'TABLE' | 'OWNERS';

type ContractRow = {
  id: number; // int8
  company_id: string | null;
  company_name: string | null;
  contract_number: string | null;
  status: string | null;
  contract_type: string | null;
  expiry_date: string | null;
  automatic_renewal: boolean | null;
  contract_owner: string | null;
};

type DealRow = {
  id: string;
  deal_name: string | null;
  stage: string | null;
  owner: string | null;
  is_renewal: boolean | null;
  original_contract_id: number | null;
  created_at: string | null;
};

const DEFAULT_OWNER_KEY = 'sense8_default_owner';
const DEFAULT_MY_MODE_KEY = 'sense8_my_portfolio_mode';
const DEFAULT_VIEW_KEY = 'sense8_renewal_center_view';

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

  dangerBg: '#fff1f2',
  dangerBorder: '#fecaca',
  dangerText: '#991b1b',

  warnBg: '#fff7ed',
  warnBorder: '#fdba74',
  warnText: '#9a3412',

  okBg: '#f0fdf4',
  okBorder: '#86efac',
  okText: '#166534',
};

const FW = {
  title: 700,
  strong: 600,
  normal: 500,
  body: 500,
};

const H = 42;

function toISODateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);

  const ms = d.getTime() - today.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString();
}

function stageRank(stage: string | null) {
  switch ((stage ?? '').toLowerCase()) {
    case 'won':
      return 5;
    case 'proposal':
      return 4;
    case 'qualified':
      return 3;
    case 'lead':
      return 2;
    case 'lost':
      return 1;
    default:
      return 0;
  }
}

function ownerOrUnassigned(owner: string | null | undefined) {
  const o = (owner ?? '').trim();
  return o ? o : 'Unassigned';
}

/**
 * ✅ SAFEST: no reduce syntax edge-cases, no optional chaining confusion.
 */
function bestDealFromDeals(deals: DealRow[]): DealRow | null {
  if (!deals || deals.length === 0) return null;
  let best = deals[0];
  for (let i = 1; i < deals.length; i++) {
    const d = deals[i];
    if (stageRank(d.stage) > stageRank(best.stage)) best = d;
  }
  return best;
}

function renewalStatusForDeals(deals: DealRow[]): RenewalStatus {
  if (!deals || deals.length === 0) return 'UNCOVERED';
  const isCovered = deals.some((d) => (d.stage ?? '').toLowerCase() === 'won');
  if (isCovered) return 'COVERED';
  return 'AT_RISK';
}

function priorityBadgeStyle(score: number) {
  if (score >= 120) return { border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.dangerText };
  if (score >= 80) return { border: `1px solid ${UI.warnBorder}`, background: UI.warnBg, color: UI.warnText };
  return { border: `1px solid ${UI.okBorder}`, background: UI.okBg, color: UI.okText };
}

function badge(status: RenewalStatus) {
  if (status === 'COVERED') return { text: 'Covered', style: { border: `1px solid ${UI.okBorder}`, background: UI.okBg, color: UI.okText } };
  if (status === 'AT_RISK') return { text: 'At risk', style: { border: `1px solid ${UI.warnBorder}`, background: UI.warnBg, color: UI.warnText } };
  return { text: 'Uncovered', style: { border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.dangerText } };
}

function urgencyPill(daysLeft: number | null) {
  if (daysLeft === null) return { text: '—', bg: UI.soft, border: UI.border, color: UI.secondary };
  if (daysLeft <= 7) return { text: `${daysLeft} days`, bg: UI.dangerBg, border: UI.dangerBorder, color: UI.dangerText };
  if (daysLeft <= 30) return { text: `${daysLeft} days`, bg: UI.warnBg, border: UI.warnBorder, color: UI.warnText };
  return { text: `${daysLeft} days`, bg: UI.okBg, border: UI.okBorder, color: UI.okText };
}

function suggestedAction(params: {
  renewalStatus: RenewalStatus;
  automaticRenewal: boolean | null;
  daysToExpiry: number | null;
  bestDeal: DealRow | null;
}) {
  const { renewalStatus, automaticRenewal, daysToExpiry, bestDeal } = params;
  const stage = (bestDeal?.stage ?? '').toLowerCase();

  if (renewalStatus === 'UNCOVERED') {
    if (automaticRenewal) return { label: 'Confirm auto-renew is valid', kind: 'note' as const };
    return { label: 'Create renewal deal now', kind: 'create' as const };
  }

  if (renewalStatus === 'AT_RISK') {
    if (automaticRenewal) return { label: 'Confirm auto-renew + still progress deal', kind: 'note' as const };
    if (stage === 'lost') return { label: 'Escalate: deal lost (save plan)', kind: 'deal' as const };
    if (stage === 'proposal') return { label: 'Push proposal → close', kind: 'deal' as const };
    if (stage === 'qualified') return { label: 'Move to proposal + timeline', kind: 'deal' as const };
    if (stage === 'lead') {
      if ((daysToExpiry ?? 9999) <= 30) return { label: 'Fast-track to Qualified', kind: 'deal' as const };
      return { label: 'Qualify renewal (call + needs)', kind: 'deal' as const };
    }
    return { label: 'Progress renewal deal', kind: 'deal' as const };
  }

  if (automaticRenewal) return { label: 'Confirm renewal paperwork', kind: 'note' as const };
  return { label: 'Covered (monitor until signed)', kind: 'note' as const };
}

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${UI.border}`, background: UI.bg }}>{children}</div>;
}

function Pill({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 24,
        padding: '0 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: FW.strong,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = 'secondary',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const base: React.CSSProperties = {
    height: H,
    padding: '0 12px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: FW.strong,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.75 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  if (variant === 'primary') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{ ...base, border: `1px solid ${UI.primaryBtn}`, background: disabled ? UI.muted : UI.primaryBtn, color: '#fff' }}
      >
        {children}
      </button>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ ...base, border: `1px solid ${UI.border}`, background: '#fff', color: UI.text }}>
      {children}
    </button>
  );
}

export default function Page() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [windowDays, setWindowDays] = useState(90);

  const [myMode, setMyMode] = useState(false);
  const [defaultOwner, setDefaultOwner] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>(''); // '' = all

  const [statusFilter, setStatusFilter] = useState<string>(''); // '' = all
  const [typeFilter, setTypeFilter] = useState<string>(''); // '' = all
  const [renewalFilter, setRenewalFilter] = useState<'ALL' | RenewalStatus>('ALL');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [onlyNotSigned, setOnlyNotSigned] = useState(true);

  const [search, setSearch] = useState('');
  const [actionQueue, setActionQueue] = useState<ActionQueue>('ALL');

  const [view, setView] = useState<ViewMode>('TABLE');

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [dealsByContractId, setDealsByContractId] = useState<Record<string, DealRow[]>>({});

  const [creatingId, setCreatingId] = useState<number | null>(null);

  const [assigningContractId, setAssigningContractId] = useState<number | null>(null);
  const [assignPickById, setAssignPickById] = useState<Record<string, string>>({});

  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string>('');

  useEffect(() => {
    try {
      const savedOwner = localStorage.getItem(DEFAULT_OWNER_KEY) ?? '';
      const savedMode = localStorage.getItem(DEFAULT_MY_MODE_KEY);
      const savedView = localStorage.getItem(DEFAULT_VIEW_KEY) as ViewMode | null;

      setDefaultOwner(savedOwner);
      if (savedMode === '1') setMyMode(true);
      if (savedView === 'OWNERS' || savedView === 'TABLE') setView(savedView);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULT_MY_MODE_KEY, myMode ? '1' : '0');
    } catch {}
  }, [myMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DEFAULT_VIEW_KEY, view);
    } catch {}
  }, [view]);

  useEffect(() => {
    if (!myMode) return;
    if (!defaultOwner) return;
    setOwnerFilter(defaultOwner);
  }, [myMode, defaultOwner]);

  useEffect(() => {
    if (actionQueue !== 'ALL') setView('TABLE');
  }, [actionQueue]);

  function setAsDefaultOwner(name: string) {
    setDefaultOwner(name);
    try {
      localStorage.setItem(DEFAULT_OWNER_KEY, name);
    } catch {}
    if (myMode) setOwnerFilter(name);
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    setActionMsg(null);

    const today = new Date();
    const from = toISODateOnly(today);

    const to = new Date();
    to.setDate(to.getDate() + windowDays);
    const toStr = toISODateOnly(to);

    const { data: contractData, error: contractError } = await (supabase as any)
      .from('contracts')
      .select('id, company_id, company_name, contract_number, status, contract_type, expiry_date, automatic_renewal, contract_owner')
      .not('expiry_date', 'is', null)
      .gte('expiry_date', from)
      .lte('expiry_date', toStr)
      .order('expiry_date', { ascending: true });

    if (contractError) {
      setLoadError(contractError.message);
      setContracts([]);
      setDealsByContractId({});
      setLoading(false);
      return;
    }

    const rows = (contractData ?? []) as ContractRow[];
    setContracts(rows);

    const ids = rows.map((c) => c.id).filter((v) => typeof v === 'number');
    if (ids.length === 0) {
      setDealsByContractId({});
      setLoading(false);
      return;
    }

    const { data: dealData, error: dealError } = await (supabase as any)
      .from('deals')
      .select('id, deal_name, stage, owner, is_renewal, original_contract_id, created_at')
      .eq('is_renewal', true)
      .in('original_contract_id', ids)
      .order('created_at', { ascending: false });

    if (dealError) {
      setDealsByContractId({});
      setLoadError(`Deals load warning: ${dealError.message}`);
      setLoading(false);
      return;
    }

    const map: Record<string, DealRow[]> = {};
    for (const d of (dealData ?? []) as DealRow[]) {
      if (d.original_contract_id == null) continue;
      const key = String(d.original_contract_id);
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    setDealsByContractId(map);

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      const o = (c.contract_owner ?? '').trim();
      if (o) set.add(o);
    }
    if (defaultOwner?.trim()) set.add(defaultOwner.trim());
    set.add('Unassigned');
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contracts, defaultOwner]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      const s = (c.status ?? '').trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      const t = (c.contract_type ?? '').trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [contracts]);

  const enriched = useMemo(() => {
    return contracts.map((c) => {
      const dte = daysUntil(c.expiry_date);
      const renewalDeals = dealsByContractId[String(c.id)] ?? [];

      const best = bestDealFromDeals(renewalDeals);
      const renewalStatus = renewalStatusForDeals(renewalDeals);

      let score = 0;
      score += Math.max(0, 90 - (dte ?? 9999));
      if (renewalStatus === 'UNCOVERED') score += 60;
      if (renewalStatus === 'AT_RISK') score += 30;
      if (best && (best.stage ?? '').toLowerCase() === 'lost') score += 40;
      if (c.automatic_renewal) score -= 20;

      const action = suggestedAction({
        renewalStatus,
        automaticRenewal: c.automatic_renewal,
        daysToExpiry: dte,
        bestDeal: best,
      });

      const ownerText = (c.contract_owner ?? '').trim();
      const isUnassigned = !ownerText;

      return {
        contract: c,
        deals: renewalDeals,
        bestDeal: best,
        daysToExpiry: dte,
        renewalStatus,
        priorityScore: score,
        action,
        ownerLabel: ownerOrUnassigned(c.contract_owner),
        isUnassigned,
      };
    });
  }, [contracts, dealsByContractId]);

  const searchNorm = useMemo(() => search.trim().toLowerCase(), [search]);

  const filtered = useMemo(() => {
    return enriched
      .filter((x) => {
        const c = x.contract;

        if (unassignedOnly && !x.isUnassigned) return false;

        if (ownerFilter) {
          const actualOwner = ownerOrUnassigned(c.contract_owner);
          if (actualOwner !== ownerFilter) return false;
        }

        if (statusFilter && (c.status ?? '') !== statusFilter) return false;
        if (typeFilter && (c.contract_type ?? '') !== typeFilter) return false;

        if (renewalFilter !== 'ALL' && x.renewalStatus !== renewalFilter) return false;

        if (onlyNotSigned && x.renewalStatus === 'COVERED') return false;

        if (searchNorm) {
          const hay = [
            c.contract_number ?? '',
            c.company_name ?? '',
            c.contract_type ?? '',
            c.status ?? '',
            c.contract_owner ?? '',
            x.bestDeal?.deal_name ?? '',
            x.bestDeal?.stage ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(searchNorm)) return false;
        }

        // ✅ Action Queue filter
        if (actionQueue !== 'ALL') {
          const bestStage = String(x.bestDeal?.stage ?? '').toLowerCase();
          const due14 = typeof x.daysToExpiry === 'number' && x.daysToExpiry <= 14;

          const needsDeal =
            x.renewalStatus === 'UNCOVERED' &&
            !c.automatic_renewal &&
            (x.deals?.length ?? 0) === 0;

          const needsEscalation = x.renewalStatus === 'AT_RISK' && bestStage === 'lost';

          if (actionQueue === 'DUE_14' && !due14) return false;
          if (actionQueue === 'NEEDS_DEAL' && !needsDeal) return false;
          if (actionQueue === 'NEEDS_ESCALATION' && !needsEscalation) return false;
        }

        return true;
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
  }, [enriched, unassignedOnly, ownerFilter, statusFilter, typeFilter, renewalFilter, onlyNotSigned, searchNorm, actionQueue]);

  const kpis = useMemo(() => {
    const sum = filtered.reduce((acc, x) => acc + (x.priorityScore || 0), 0);
    const uncovered = filtered.filter((x) => x.renewalStatus === 'UNCOVERED').length;
    const atRisk = filtered.filter((x) => x.renewalStatus === 'AT_RISK').length;
    const covered = filtered.filter((x) => x.renewalStatus === 'COVERED').length;
    const unassigned = filtered.filter((x) => x.isUnassigned).length;
    return { sum, uncovered, atRisk, covered, unassigned };
  }, [filtered]);

  const unassignedCountAll = useMemo(() => enriched.filter((x) => x.isUnassigned).length, [enriched]);

  const groupedByOwner = useMemo(() => {
    const map: Record<string, typeof filtered> = {};

    const sortedForCards = [...filtered].sort((a, b) => {
      const da = a.daysToExpiry;
      const db = b.daysToExpiry;

      if (da === null && db === null) return b.priorityScore - a.priorityScore;
      if (da === null) return 1;
      if (db === null) return -1;
      if (da !== db) return da - db;

      const rank = (s: RenewalStatus) => (s === 'UNCOVERED' ? 0 : s === 'AT_RISK' ? 1 : 2);
      return rank(a.renewalStatus) - rank(b.renewalStatus);
    });

    for (const x of sortedForCards) {
      const k = x.ownerLabel;
      if (!map[k]) map[k] = [];
      map[k].push(x);
    }
    return map;
  }, [filtered]);

  const visibleUnassignedIds = useMemo(() => filtered.filter((x) => x.isUnassigned).map((x) => x.contract.id), [filtered]);

  async function createRenewalDeal(c: ContractRow) {
    try {
      setActionMsg(null);
      setCreatingId(c.id);

      const existing = dealsByContractId[String(c.id)] ?? [];
      if (existing.length > 0) {
        const best = bestDealFromDeals(existing);
        if (best) {
          setActionMsg('Renewal already exists. Opening the best one…');
          router.push(`/deals/${best.id}`);
        } else {
          setActionMsg('Renewal exists, but could not determine best deal.');
        }
        return;
      }

      const contractLabel = c.contract_number ?? `Contract #${c.id}`;
      const companyLabel = c.company_name ?? 'Company';
      const owner = (c.contract_owner ?? '').trim() || null;

      const dealName = `Renewal - ${companyLabel} - ${contractLabel}`;

      const payload: any = {
        deal_name: dealName,
        company_id: c.company_id,
        company_name: c.company_name,
        stage: 'Lead',
        owner,
        value: null,
        is_renewal: true,
        original_contract_id: c.id,
      };

      const { data, error } = await supabase.from('deals').insert(payload).select('id').single();
      if (error) {
        setActionMsg(`Create failed: ${error.message}`);
        return;
      }

      const newId = (data as any)?.id;
      if (!newId) {
        setActionMsg('Created, but could not read new deal id.');
        return;
      }

      setActionMsg('Renewal deal created ✅ Opening it now…');
      router.push(`/deals/${newId}`);
    } finally {
      setCreatingId(null);
    }
  }

  async function assignOwner(contractId: number, ownerName: string) {
    const owner = ownerName.trim();
    if (!owner) {
      setActionMsg('Pick an owner first.');
      return;
    }

    setActionMsg(null);
    setAssigningContractId(contractId);

    try {
      const val = owner === 'Unassigned' ? null : owner;

      const { error } = await supabase.from('contracts').update({ contract_owner: val }).eq('id', contractId);
      if (error) {
        setActionMsg(`Assign failed: ${error.message}`);
        return;
      }
      setActionMsg(`Owner assigned ✅ (${owner})`);
      await load();
    } finally {
      setAssigningContractId(null);
    }
  }

  async function bulkAssignVisibleUnassigned() {
    const owner = defaultOwner.trim();
    if (!owner) {
      setActionMsg('Set a Default owner first.');
      return;
    }
    if (visibleUnassignedIds.length === 0) {
      setActionMsg('No visible unassigned contracts to assign.');
      return;
    }

    setActionMsg(null);
    setBulkAssigning(true);
    setBulkProgress(`Assigning ${visibleUnassignedIds.length} contracts to ${owner}…`);

    try {
      const { error: bulkError } = await (supabase as any)
        .from('contracts')
        .update({ contract_owner: owner })
        .in('id', visibleUnassignedIds)
        .or('contract_owner.is.null,contract_owner.eq.""');

      if (!bulkError) {
        setBulkProgress(`Assigned ${visibleUnassignedIds.length}/${visibleUnassignedIds.length}. Refreshing…`);
        await load();
        setActionMsg(`Bulk assign done ✅ (${visibleUnassignedIds.length} contracts → ${owner})`);
        return;
      }

      setBulkProgress(`Bulk update rejected (${bulkError.message}). Falling back to per-row updates…`);

      let ok = 0;
      for (let i = 0; i < visibleUnassignedIds.length; i++) {
        const id = visibleUnassignedIds[i];
        setBulkProgress(`Assigning ${i + 1}/${visibleUnassignedIds.length}…`);
        const { error } = await supabase.from('contracts').update({ contract_owner: owner }).eq('id', id);
        if (!error) ok++;
      }

      await load();
      setActionMsg(`Bulk assign done ✅ (${ok}/${visibleUnassignedIds.length} contracts → ${owner})`);
    } finally {
      setBulkAssigning(false);
      setBulkProgress('');
    }
  }

  function setAsDefaultOwnerSafe(v: string) {
    setAsDefaultOwner(v);
  }

  return (
    <div style={{ padding: 16, background: 'linear-gradient(to bottom, #fafbfc 0%, #f8f9fa 100%)', minHeight: '100vh' }}>
      <PageHeader
        title="Renewal Center"
        subtitle={`${filtered.length} shown • window: ${windowDays} days`}
        actions={[
          { label: 'Contracts', href: '/contracts' },
          { label: 'Pipeline', href: '/pipeline', primary: true },
        ]}
      />

      {/* View toggle */}
      <div style={{ marginTop: 12 }}>
        <Card>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant={view === 'TABLE' ? 'primary' : 'secondary'} onClick={() => setView('TABLE')}>
                Table
              </Button>
              <Button variant={view === 'OWNERS' ? 'primary' : 'secondary'} onClick={() => setView('OWNERS')}>
                Owner Cards
              </Button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                href="/deals"
                style={{
                  height: H,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${UI.border}`,
                  background: '#fff',
                  color: UI.text,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontWeight: FW.strong,
                  fontSize: 13,
                }}
              >
                Deals
              </Link>

              <Link
                href="/companies"
                style={{
                  height: H,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: `1px solid ${UI.border}`,
                  background: '#fff',
                  color: UI.text,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontWeight: FW.strong,
                  fontSize: 13,
                }}
              >
                Companies
              </Link>
            </div>
          </div>
        </Card>
      </div>

      {/* My Portfolio strip */}
      <div style={{ marginTop: 12 }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 260px 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                variant={myMode ? 'primary' : 'secondary'}
                onClick={() => {
                  setMyMode(true);
                  if (defaultOwner) setOwnerFilter(defaultOwner);
                }}
              >
                My Portfolio
              </Button>
              <Button
                variant={!myMode ? 'primary' : 'secondary'}
                onClick={() => {
                  setMyMode(false);
                  setOwnerFilter('');
                }}
              >
                All
              </Button>
            </div>

            <div>
              <div style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong, marginBottom: 6 }}>Default owner (saved)</div>
              <select
                value={defaultOwner}
                onChange={(e) => setAsDefaultOwnerSafe(e.target.value)}
                style={{ height: H, width: '100%', padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13 }}
              >
                <option value="">— Select default owner —</option>
                {owners
                  .filter((o) => o !== 'Unassigned')
                  .map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ color: UI.muted, fontSize: 13 }}>
              {myMode ? (defaultOwner ? `Showing only ${defaultOwner}'s portfolio.` : 'Pick a default owner to use My Portfolio mode.') : 'Showing all owners.'}
            </div>
          </div>
        </Card>
      </div>

      {/* KPI strip */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 10 }}>
        <Card>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong }}>Renewal risk score</div>
          <div style={{ fontSize: 24, fontWeight: FW.title, color: UI.text, marginTop: 6 }}>{kpis.sum}</div>
          <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
            Unassigned in view: <span style={{ fontWeight: FW.strong, color: UI.dangerText }}>{kpis.unassigned}</span>
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong }}>Uncovered</div>
          <div style={{ fontSize: 20, fontWeight: FW.title, marginTop: 6 }}>{kpis.uncovered}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong }}>At risk</div>
          <div style={{ fontSize: 20, fontWeight: FW.title, marginTop: 6 }}>{kpis.atRisk}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong }}>Covered</div>
          <div style={{ fontSize: 20, fontWeight: FW.title, marginTop: 6 }}>{kpis.covered}</div>
        </Card>
      </div>

      {/* Filters + Action Queue */}
      <div style={{ marginTop: 12 }}>
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 220px 220px 220px', gap: 10 }}>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13 }}
            >
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
              <option value={120}>Next 120 days</option>
              <option value={180}>Next 180 days</option>
            </select>

            <select
              value={ownerFilter}
              onChange={(e) => {
                const v = e.target.value;
                setOwnerFilter(v);
                if (myMode) setAsDefaultOwnerSafe(v);
              }}
              disabled={myMode && !!defaultOwner}
              style={{
                height: H,
                padding: '0 12px',
                borderRadius: 12,
                border: `1px solid ${UI.border}`,
                background: myMode && !!defaultOwner ? UI.soft : '#fff',
                fontSize: 13,
              }}
            >
              <option value="">All owners</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13 }}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              value={renewalFilter}
              onChange={(e) => setRenewalFilter(e.target.value as any)}
              style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13 }}
            >
              <option value="ALL">All renewal statuses</option>
              <option value="UNCOVERED">Uncovered</option>
              <option value="AT_RISK">At risk</option>
              <option value="COVERED">Covered</option>
            </select>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '220px 1fr 140px', gap: 10 }}>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13 }}
            >
              <option value="">All contract types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search: contract #, company, type, status, owner, deal…"
              style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, fontSize: 13 }}
            />

            <Button onClick={() => setSearch('')} disabled={!search.trim()}>
              Clear
            </Button>
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant={unassignedOnly ? 'primary' : 'secondary'} onClick={() => setUnassignedOnly((v) => !v)}>
              {unassignedOnly ? 'Unassigned only: ON' : 'Unassigned only: OFF'}
            </Button>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: UI.secondary, fontWeight: FW.strong }}>
              <input type="checkbox" checked={onlyNotSigned} onChange={(e) => setOnlyNotSigned(e.target.checked)} />
              Show only NOT signed
            </label>

            <div style={{ fontSize: 12, color: UI.muted }}>
              Total unassigned in window: <span style={{ fontWeight: FW.strong, color: UI.dangerText }}>{unassignedCountAll}</span>
            </div>

            {defaultOwner.trim() && visibleUnassignedIds.length > 0 ? (
              <Button variant="primary" onClick={bulkAssignVisibleUnassigned} disabled={bulkAssigning}>
                {bulkAssigning ? 'Assigning…' : `Assign visible unassigned → ${defaultOwner.trim()} (${visibleUnassignedIds.length})`}
              </Button>
            ) : null}

            {bulkProgress ? <div style={{ fontSize: 12, color: UI.muted }}>{bulkProgress}</div> : null}
          </div>

          {/* ✅ Action Queue controls */}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong }}>Action queue:</span>

            <Button variant={actionQueue === 'ALL' ? 'primary' : 'secondary'} onClick={() => setActionQueue('ALL')}>
              All
            </Button>
            <Button variant={actionQueue === 'NEEDS_DEAL' ? 'primary' : 'secondary'} onClick={() => setActionQueue('NEEDS_DEAL')}>
              Needs renewal deal
            </Button>
            <Button variant={actionQueue === 'NEEDS_ESCALATION' ? 'primary' : 'secondary'} onClick={() => setActionQueue('NEEDS_ESCALATION')}>
              Needs escalation
            </Button>
            <Button variant={actionQueue === 'DUE_14' ? 'primary' : 'secondary'} onClick={() => setActionQueue('DUE_14')}>
              Due ≤ 14 days
            </Button>

            {actionQueue !== 'ALL' ? <Button onClick={() => setActionQueue('ALL')}>Clear</Button> : null}

            <span style={{ fontSize: 12, color: UI.muted, fontWeight: FW.strong, marginLeft: 8 }}>Quick:</span>
            <Button
              variant={typeFilter === 'GA4' ? 'primary' : 'secondary'}
              onClick={() => setTypeFilter(typeFilter === 'GA4' ? '' : 'GA4')}
            >
              GA4 only
            </Button>
          </div>
        </Card>
      </div>

      {actionMsg ? (
        <div style={{ marginTop: 12 }}>
          <Card>{actionMsg}</Card>
        </div>
      ) : null}

      {loadError ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px solid ${UI.dangerBorder}`, background: UI.dangerBg, color: UI.dangerText, fontWeight: FW.strong }}>
          {loadError}
        </div>
      ) : null}

      {/* Body */}
      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ fontSize: 14, color: UI.muted }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 14, color: UI.muted }}>No contracts match these filters.</div>
        ) : view === 'TABLE' ? (
          <div style={{ border: `1px solid ${UI.border}`, borderRadius: 12, overflow: 'hidden', background: UI.bg }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1500 }}>
                <thead>
                  <tr style={{ background: UI.soft }}>
                    {['Contract', 'Company', 'Expiry', 'Days', 'Owner', 'Auto-renew', 'Renewal status', 'Suggested action', 'Best renewal deal', 'Priority', ''].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          fontSize: 12,
                          color: UI.muted,
                          padding: 12,
                          borderBottom: `1px solid ${UI.border}`,
                          whiteSpace: 'nowrap',
                          fontWeight: FW.strong,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((x) => {
                    const c = x.contract;
                    const statusBadge = badge(x.renewalStatus);
                    const prStyle = priorityBadgeStyle(x.priorityScore);

                    const canCreate = x.action.kind === 'create' && !c.automatic_renewal;
                    const isCreatingThis = creatingId === c.id;

                    const ownerText = (c.contract_owner ?? '').trim();
                    const isUnassigned = !ownerText;

                    const pickKey = String(c.id);
                    const pickValue = assignPickById[pickKey] ?? '';
                    const isAssigningThis = assigningContractId === c.id;

                    return (
                      <tr key={c.id}>
                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <Link href={`/contracts/${c.id}`} style={{ color: UI.text, fontWeight: FW.strong, textDecoration: 'none' }}>
                            {c.contract_number ?? `Contract #${c.id}`}
                          </Link>
                          <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>
                            {c.contract_type === 'GA4' ? (
                              <span style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700, padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>GA4</span>
                            ) : (
                              <span>{c.contract_type ?? '—'} • </span>
                            )}
                            {c.status ?? '—'}
                          </div>
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          {c.company_id ? (
                            <Link href={`/companies/${c.company_id}`} style={{ color: UI.link, textDecoration: 'none', fontWeight: FW.normal }}>
                              {c.company_name ?? 'Company'}
                            </Link>
                          ) : (
                            <span style={{ color: UI.muted }}>{c.company_name ?? '—'}</span>
                          )}
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{
                            color: c.contract_type === 'GA4' ? '#1e40af' : UI.secondary,
                            fontWeight: c.contract_type === 'GA4' ? 700 : FW.normal,
                          }}>
                            {formatDate(c.expiry_date)}
                          </span>
                          {c.contract_type === 'GA4' && c.expiry_date && (
                            <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>GA4 – expiry tracked</div>
                          )}
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', color: UI.secondary, fontWeight: FW.normal }}>
                          {typeof x.daysToExpiry === 'number' ? x.daysToExpiry : '—'}
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', minWidth: 280 }}>
                          {!isUnassigned ? (
                            <span style={{ fontWeight: FW.normal }}>{ownerText}</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ fontWeight: FW.strong, color: UI.dangerText }}>Unassigned</div>

                              {defaultOwner ? (
                                <Button variant="primary" disabled={isAssigningThis} onClick={() => assignOwner(c.id, defaultOwner)}>
                                  {isAssigningThis ? 'Assigning…' : `Assign to ${defaultOwner}`}
                                </Button>
                              ) : null}

                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select
                                  value={pickValue}
                                  onChange={(e) => setAssignPickById((prev) => ({ ...prev, [pickKey]: e.target.value }))}
                                  style={{ height: H, padding: '0 12px', borderRadius: 12, border: `1px solid ${UI.border}`, background: '#fff', fontSize: 13, minWidth: 180 }}
                                >
                                  <option value="">Select owner…</option>
                                  {owners.map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>

                                <Button disabled={isAssigningThis || !pickValue} onClick={() => assignOwner(c.id, pickValue)}>
                                  {isAssigningThis ? 'Assigning…' : 'Assign'}
                                </Button>
                              </div>

                              <div style={{ fontSize: 12, color: UI.muted }}>Tip: set your default owner above, then assign in one click.</div>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9', color: UI.secondary }}>{c.automatic_renewal ? 'Yes' : 'No'}</td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <Pill style={{ ...(statusBadge.style as any) }}>{statusBadge.text}</Pill>
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ color: UI.secondary, fontWeight: FW.body }}>{x.action.label}</span>

                            {x.action.kind === 'deal' && x.bestDeal ? (
                              <Link href={`/deals/${x.bestDeal.id}`} style={{ fontSize: 12, fontWeight: FW.strong, color: UI.link, textDecoration: 'none' }}>
                                Open deal →
                              </Link>
                            ) : null}

                            {canCreate ? (
                              <Button variant="primary" onClick={() => createRenewalDeal(c)} disabled={isCreatingThis}>
                                {isCreatingThis ? 'Creating…' : 'Create renewal deal'}
                              </Button>
                            ) : null}
                          </div>
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          {x.bestDeal ? (
                            <Link href={`/deals/${x.bestDeal.id}`} style={{ color: UI.text, textDecoration: 'none', fontWeight: FW.normal }}>
                              {x.bestDeal.deal_name ?? 'Renewal deal'}
                            </Link>
                          ) : (
                            <span style={{ color: UI.muted }}>—</span>
                          )}
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <Pill style={{ ...(prStyle as any) }}>{x.priorityScore}</Pill>
                        </td>

                        <td style={{ padding: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <Link
                            href={`/contracts/${c.id}`}
                            style={{
                              height: H,
                              padding: '0 12px',
                              borderRadius: 999,
                              border: `1px solid ${UI.border}`,
                              textDecoration: 'none',
                              color: UI.text,
                              fontWeight: FW.strong,
                              background: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 13,
                            }}
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.keys(groupedByOwner)
              .sort((a, b) => a.localeCompare(b))
              .map((owner) => {
                const list = groupedByOwner[owner];

                return (
                  <div key={owner} style={{ border: `1px solid ${UI.border}`, borderRadius: 12, background: UI.bg, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: FW.title, color: UI.text }}>{owner}</div>
                      <div style={{ fontSize: 12, color: UI.muted }}>{list.length} contracts</div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                      {list.map((x) => {
                        const c = x.contract;
                        const urg = urgencyPill(x.daysToExpiry);
                        const rb = badge(x.renewalStatus);

                        return (
                          <div
                            key={c.id}
                            style={{
                              border: `1px solid ${UI.border}`,
                              borderRadius: 12,
                              padding: 12,
                              display: 'grid',
                              gridTemplateColumns: '1.3fr 0.9fr',
                              gap: 12,
                              alignItems: 'start',
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    height: 24,
                                    padding: '0 10px',
                                    borderRadius: 999,
                                    border: `1px solid ${urg.border}`,
                                    background: urg.bg,
                                    color: urg.color,
                                    fontWeight: FW.strong,
                                    fontSize: 12,
                                  }}
                                >
                                  {urg.text}
                                </span>

                                <Pill style={{ ...(rb.style as any) }}>{rb.text}</Pill>

                                <span style={{ color: UI.muted, fontSize: 12 }}>
                                  Expiry: <span style={{ color: UI.text, fontWeight: FW.strong }}>{formatDate(c.expiry_date)}</span>
                                </span>
                              </div>

                              <div style={{ fontSize: 14, fontWeight: FW.title, marginBottom: 6 }}>
                                <Link href={`/contracts/${c.id}`} style={{ color: UI.text, textDecoration: 'none' }}>
                                  {c.contract_number ?? `Contract #${c.id}`}
                                </Link>
                              </div>

                              <div style={{ color: UI.secondary, fontSize: 13, marginBottom: 6 }}>
                                <span style={{ fontWeight: FW.strong, color: UI.text }}>{c.company_name ?? '—'}</span> • {c.contract_type ?? '—'} • {c.status ?? '—'}
                              </div>

                              <div style={{ color: UI.muted, fontSize: 13 }}>
                                Renewal deal:{' '}
                                {x.bestDeal ? (
                                  <Link href={`/deals/${x.bestDeal.id}`} style={{ color: UI.link, textDecoration: 'none', fontWeight: FW.strong }}>
                                    {x.bestDeal.deal_name ?? 'Renewal deal'} ({x.bestDeal.stage ?? 'Lead'})
                                  </Link>
                                ) : (
                                  '—'
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <Link
                                href={`/contracts/${c.id}`}
                                style={{
                                  height: H,
                                  padding: '0 12px',
                                  borderRadius: 12,
                                  border: `1px solid ${UI.border}`,
                                  background: '#fff',
                                  color: UI.text,
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: FW.strong,
                                  fontSize: 13,
                                }}
                              >
                                Open contract
                              </Link>

                              {x.action.kind === 'create' && !c.automatic_renewal ? (
                                <Button variant="primary" onClick={() => createRenewalDeal(c)} disabled={creatingId === c.id}>
                                  {creatingId === c.id ? 'Creating…' : 'Create renewal deal'}
                                </Button>
                              ) : (
                                <Link
                                  href="/pipeline"
                                  style={{
                                    height: H,
                                    padding: '0 12px',
                                    borderRadius: 12,
                                    border: `1px solid ${UI.border}`,
                                    background: UI.soft,
                                    color: UI.text,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: FW.strong,
                                    fontSize: 13,
                                  }}
                                >
                                  Go to pipeline
                                </Link>
                              )}

                              {x.bestDeal ? (
                                <Link
                                  href={`/deals/${x.bestDeal.id}`}
                                  style={{
                                    height: H,
                                    padding: '0 12px',
                                    borderRadius: 12,
                                    border: `1px solid ${UI.border}`,
                                    background: '#fff',
                                    color: UI.text,
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: FW.strong,
                                    fontSize: 13,
                                  }}
                                >
                                  Open deal
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}