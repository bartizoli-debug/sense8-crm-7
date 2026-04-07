'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

import PageHeader from '../components/PageHeader';

type DealStage = 'Lead' | 'Qualified' | 'Proposal' | 'Won' | 'Lost';

type Deal = {
  id: string;
  created_at: string;
  company_id: string | null;
  company_name: string | null;
  deal_name: string | null;
  value: number | null;
  stage: DealStage | null;
  owner: string | null;

  stage_changed_at?: string | null;
  expected_close_date?: string | null;
  deal_probability?: number | null;
};

type ActivityRow = {
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
};

const STAGES: DealStage[] = ['Lead', 'Qualified', 'Proposal', 'Won', 'Lost'];

const UI = {
  text: '#111827',
  secondary: '#374151',
  muted: '#6b7280',
  border: '#e5e7eb',
  borderStrong: '#d1d5db',
  bg: '#ffffff',
  soft: '#f9fafb',
  soft2: '#f3f4f6',
  card: '#ffffff',
  danger: '#b91c1c',
  warn: '#b45309',
  ok: '#065f46',
};

const FW = { regular: 400, medium: 500, semibold: 600 };

const STAGE_PROB: Record<DealStage, number> = {
  Lead: 0.1,
  Qualified: 0.25,
  Proposal: 0.6,
  Won: 1,
  Lost: 0,
};

const STAGE_AGE_LIMIT: Record<DealStage, number> = {
  Lead: 30,
  Qualified: 21,
  Proposal: 14,
  Won: 0,
  Lost: 0,
};

function stageSlaText(stage: DealStage) {
  const limit = STAGE_AGE_LIMIT[stage] ?? 0;
  if (stage === 'Won' || stage === 'Lost') return 'SLA: not applicable (closed stage).';
  if (!limit) return 'SLA: not set.';
  return `SLA: target to move within ${limit} days.`;
}

const STAGE_INFO: Record<DealStage, string> = {
  Lead:
    `Early stage. First contact / discovery. Total = sum of deal values in this stage. Weighted = value × probability. ${stageSlaText('Lead')}`,
  Qualified:
    `Qualified opportunity. Needs a clear owner, value, and recent activity to stay healthy. At risk highlights stale/missing info. ${stageSlaText('Qualified')}`,
  Proposal:
    `Proposal sent / negotiation. Watch stage age closely and keep activity recent. Weighted value is usually higher here. ${stageSlaText('Proposal')}`,
  Won:
    `Closed won. Probability is 100% and weighted equals total value. ${stageSlaText('Won')}`,
  Lost:
    `Closed lost. Probability is 0% and weighted equals 0. ${stageSlaText('Lost')}`,
};

function daysBetween(isoA: string, isoB: string) {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  const diff = Math.max(0, b - a);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function formatMoneyEUR(value: number | null | undefined) {
  const v = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(v);
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isoNow() {
  return new Date().toISOString();
}

function inferForecastMonthFallback(deal: Deal): string {
  const base = new Date(deal.created_at);
  const stage = (deal.stage ?? 'Lead') as DealStage;

  const addDays = stage === 'Lead' ? 60 : stage === 'Qualified' ? 45 : stage === 'Proposal' ? 30 : 0;

  const d = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000);
  return monthKey(d);
}

type HealthTone = 'ok' | 'warn' | 'bad' | 'closed';

function computeHealth(deal: Deal, lastActivityAt: string | null) {
  const stage = (deal.stage ?? 'Lead') as DealStage;

  if (stage === 'Won' || stage === 'Lost') {
    return {
      score: 100,
      tone: 'closed' as HealthTone,
      label: stage === 'Won' ? 'Closed (Won)' : 'Closed (Lost)',
      reasons: [] as string[],
      stageAgeDays: 0,
      lastActivityDays: 0,
    };
  }

  const now = isoNow();
  const stageStart = deal.stage_changed_at ?? deal.created_at;
  const stageAgeDays = daysBetween(stageStart, now);

  const lastActivityDays = lastActivityAt ? daysBetween(lastActivityAt, now) : 999;

  let score = 100;
  const reasons: string[] = [];

  if (deal.value == null) {
    score -= 15;
    reasons.push('Missing value');
  }
  if (!deal.owner) {
    score -= 15;
    reasons.push('Missing owner');
  }

  const limit = STAGE_AGE_LIMIT[stage];
  if (limit > 0 && stageAgeDays > limit) {
    const over = stageAgeDays - limit;
    const agePenalty = Math.min(40, over * 2);
    score -= agePenalty;
    reasons.push(`Stage age ${stageAgeDays}d (>${limit}d SLA)`);
  }

  if (lastActivityDays > 30) {
    score -= 50;
    reasons.push(lastActivityAt ? `No activity ${lastActivityDays}d` : 'No activity yet');
  } else if (lastActivityDays > 14) {
    score -= 25;
    reasons.push(`No activity ${lastActivityDays}d`);
  }

  score = Math.max(0, Math.min(100, score));

  let tone: HealthTone = 'ok';
  let label = 'Healthy';
  if (score < 50) {
    tone = 'bad';
    label = 'At risk';
  } else if (score < 75) {
    tone = 'warn';
    label = 'Watch';
  }

  return { score, tone, label, reasons, stageAgeDays, lastActivityDays };
}

function Badge({ tone, text }: { tone: HealthTone; text: string }) {
  const stylesByTone: Record<HealthTone, React.CSSProperties> = {
    ok: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: UI.ok },
    warn: { background: '#fffbeb', border: '1px solid #fde68a', color: UI.warn },
    bad: { background: '#fef2f2', border: '1px solid #fecaca', color: UI.danger },
    closed: { background: '#f3f4f6', border: `1px solid ${UI.border}`, color: UI.secondary },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: FW.medium,
        whiteSpace: 'nowrap',
        ...stylesByTone[tone],
      }}
      title={text}
    >
      {text}
    </span>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.border}`, borderRadius: 12, padding: 12, minWidth: 220 }}>
      <div style={{ fontSize: 12, color: UI.muted, marginBottom: 6, fontWeight: FW.regular }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: FW.semibold, color: UI.text, letterSpacing: -0.2 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: UI.secondary, marginTop: 6, fontWeight: FW.regular }}>{sub}</div> : null}
    </div>
  );
}

function Grip() {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: 6,
        border: `1px solid ${UI.border}`,
        background: UI.soft,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
      }}
      title="Drag to move"
    >
      <span style={{ width: 10, height: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} style={{ width: 4, height: 4, borderRadius: 2, background: UI.borderStrong, display: 'block' }} />
        ))}
      </span>
    </span>
  );
}

/**
 * HeaderInfo: enterprise tooltip that works on:
 * - hover (desktop)
 * - click (all devices)
 */
function HeaderInfo({
  id,
  openId,
  setOpenId,
  text,
}: {
  id: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
  text: string;
}) {
  const open = openId === id;

  return (
    <span
      data-headerinfo-root="true"
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpenId(id)}
      onMouseLeave={() => setOpenId((cur) => (cur === id ? null : cur))}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpenId(open ? null : id);
        }}
        style={{
          marginLeft: 6,
          width: 18,
          height: 18,
          borderRadius: 999,
          border: `1px solid ${open ? UI.borderStrong : UI.border}`,
          background: '#fff',
          color: open ? UI.text : UI.muted,
          fontSize: 12,
          lineHeight: '18px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 120ms ease, color 120ms ease, background 120ms ease',
        }}
        title="Info"
        aria-label="Info"
      >
        ⓘ
      </button>

      {open ? (
        <div
          data-headerinfo-root="true"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 24,
            left: 0,
            width: 280,
            background: '#fff',
            border: `1px solid ${UI.border}`,
            borderRadius: 10,
            padding: 10,
            color: UI.secondary,
            fontSize: 12,
            lineHeight: 1.35,
            fontWeight: FW.regular, // ✅ not bold
            zIndex: 20,
            boxShadow: '0 6px 18px rgba(17,24,39,0.08)',
          }}
        >
          <div style={{ fontWeight: FW.regular, color: UI.text, marginBottom: 4 }}>What this means</div>
          <div>{text}</div>
        </div>
      ) : null}
    </span>
  );
}

export default function PipelinePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [lastActivityByDeal, setLastActivityByDeal] = useState<Record<string, string | null>>({});

  const [attentionOpen, setAttentionOpen] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);

  const [openHeaderInfo, setOpenHeaderInfo] = useState<string | null>(null);

  const [hoveredDealId, setHoveredDealId] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);

  const isDraggingRef = useRef(false);
  const dragDealIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: dealRows, error: dealErr } = await supabase
        .from('deals')
        .select('id, created_at, company_id, company_name, deal_name, value, stage, owner, stage_changed_at, expected_close_date, deal_probability')
        .order('created_at', { ascending: false });

      if (!active) return;

      if (dealErr) {
        console.error(dealErr);
        setDeals([]);
        setLastActivityByDeal({});
        setLoading(false);
        return;
      }

      const safeDeals = (dealRows ?? []) as Deal[];
      setDeals(safeDeals);

      const ids = safeDeals.map((d) => d.id).filter(Boolean);
      if (ids.length === 0) {
        setLastActivityByDeal({});
        setLoading(false);
        return;
      }

      const { data: actRows, error: actErr } = await supabase
        .from('activities')
        .select('created_at, entity_type, entity_id')
        .eq('entity_type', 'deal')
        .in('entity_id', ids);

      if (!active) return;

      if (actErr) {
        console.warn('Activity fetch failed. Check RLS/policies and entity_type convention.', actErr);
        setLastActivityByDeal({});
        setLoading(false);
        return;
      }

      const rows = (actRows ?? []) as ActivityRow[];
      const map: Record<string, string> = {};

      for (const r of rows) {
        if (!r.entity_id) continue;
        const prev = map[r.entity_id];
        if (!prev) map[r.entity_id] = r.created_at;
        else if (new Date(r.created_at).getTime() > new Date(prev).getTime()) map[r.entity_id] = r.created_at;
      }

      const finalMap: Record<string, string | null> = {};
      for (const id of ids) finalMap[id] = map[id] ?? null;

      setLastActivityByDeal(finalMap);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  // Close tooltip only when clicking outside
  useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const inside = target.closest('[data-headerinfo-root="true"]');
      if (inside) return;

      setOpenHeaderInfo(null);
    }

    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, []);

  const enriched = useMemo(() => {
    return deals.map((d) => {
      const last = lastActivityByDeal[d.id] ?? null;
      const health = computeHealth(d, last);

      const stage = (d.stage ?? 'Lead') as DealStage;
      const prob = typeof d.deal_probability === 'number' ? Math.max(0, Math.min(1, d.deal_probability)) : STAGE_PROB[stage];

      const value = d.value ?? 0;
      const weighted = value * prob;

      const forecastMonth = d.expected_close_date ? monthKey(new Date(d.expected_close_date)) : inferForecastMonthFallback(d);

      return { ...d, lastActivityAt: last, health, prob, weighted, forecastMonth };
    });
  }, [deals, lastActivityByDeal]);

  const dealsByStage = useMemo(() => {
    const map: Record<DealStage, typeof enriched> = { Lead: [], Qualified: [], Proposal: [], Won: [], Lost: [] };
    for (const d of enriched) {
      const s = (d.stage ?? 'Lead') as DealStage;
      map[s].push(d);
    }
    return map;
  }, [enriched]);

  const now = useMemo(() => new Date(), []);
  const currentMonth = useMemo(() => monthKey(now), [now]);

  const stageSummary = useMemo(() => {
    const base = () => ({ count: 0, total: 0, weighted: 0, atRiskCount: 0, atRiskTotal: 0 });
    const out: Record<DealStage, ReturnType<typeof base>> = { Lead: base(), Qualified: base(), Proposal: base(), Won: base(), Lost: base() };

    for (const d of enriched) {
      const s = (d.stage ?? 'Lead') as DealStage;
      const v = d.value ?? 0;
      out[s].count += 1;
      out[s].total += v;
      out[s].weighted += d.weighted;

      if (d.health.tone === 'bad') {
        out[s].atRiskCount += 1;
        out[s].atRiskTotal += v;
      }
    }
    return out;
  }, [enriched]);

  const ownerSummary = useMemo(() => {
    const map: Record<
      string,
      { owner: string; openTotal: number; openWeighted: number; atRiskCount: number; atRiskTotal: number; openCount: number }
    > = {};

    for (const d of enriched) {
      const stage = (d.stage ?? 'Lead') as DealStage;
      const isOpen = stage === 'Lead' || stage === 'Qualified' || stage === 'Proposal';
      if (!isOpen) continue;

      const owner = d.owner?.trim() ? d.owner.trim() : 'Unassigned';
      if (!map[owner]) map[owner] = { owner, openTotal: 0, openWeighted: 0, atRiskCount: 0, atRiskTotal: 0, openCount: 0 };

      map[owner].openCount += 1;
      map[owner].openTotal += d.value ?? 0;
      map[owner].openWeighted += d.weighted;

      if (d.health.tone === 'bad') {
        map[owner].atRiskCount += 1;
        map[owner].atRiskTotal += d.value ?? 0;
      }
    }

    return Object.values(map).sort((a, b) => b.openWeighted - a.openWeighted);
  }, [enriched]);

  const topSummary = useMemo(() => {
    const openStages: DealStage[] = ['Lead', 'Qualified', 'Proposal'];
    let openTotal = 0;
    let openWeighted = 0;
    let monthForecast = 0;
    let atRiskCount = 0;
    let atRiskTotal = 0;

    for (const d of enriched) {
      const s = (d.stage ?? 'Lead') as DealStage;
      if (!openStages.includes(s)) continue;

      const v = d.value ?? 0;
      openTotal += v;
      openWeighted += d.weighted;

      if (d.forecastMonth === currentMonth) monthForecast += d.weighted;

      if (d.health.tone === 'bad') {
        atRiskCount += 1;
        atRiskTotal += v;
      }
    }

    return { openTotal, openWeighted, monthForecast, atRiskCount, atRiskTotal };
  }, [enriched, currentMonth]);

  const actionQueue = useMemo(() => {
    const items = enriched
      .filter((d) => {
        const stage = (d.stage ?? 'Lead') as DealStage;
        const isOpen = stage === 'Lead' || stage === 'Qualified' || stage === 'Proposal';
        if (!isOpen) return false;

        const noRecentActivity = (d.health.lastActivityDays ?? 999) > 14;
        const missingOwner = !d.owner;
        const missingValue = d.value == null;

        return d.health.tone === 'bad' || noRecentActivity || missingOwner || missingValue;
      })
      .sort((a, b) => (a.health.score ?? 0) - (b.health.score ?? 0));

    return items.slice(0, 12);
  }, [enriched]);

  const attentionStats = useMemo(() => {
    const count = actionQueue.length;
    const total = actionQueue.reduce((sum, d) => sum + (d.value ?? 0), 0);
    const atRiskCount = actionQueue.filter((d) => d.health.tone === 'bad').length;
    return { count, total, atRiskCount };
  }, [actionQueue]);

  async function moveDealToStage(dealId: string, nextStage: DealStage) {
    setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage: nextStage, stage_changed_at: isoNow() } : d)));

    const { error } = await supabase.from('deals').update({ stage: nextStage, stage_changed_at: isoNow() }).eq('id', dealId);

    if (error) {
      console.error(error);
      window.location.reload();
    }
  }

  function onCardClick(dealId: string) {
    if (isDraggingRef.current) return;
    router.push(`/deals/${dealId}`);
  }

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <PageHeader title="Pipeline" subtitle="Loading deals..." />
        <div style={{ color: UI.muted }}>Loading...</div>
      </div>
    );
  }

  const miniBtn: React.CSSProperties = {
    border: `1px solid ${UI.border}`,
    background: '#fff',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: FW.medium,
    cursor: 'pointer',
    color: UI.text,
  };

  const containerCard: React.CSSProperties = {
    background: UI.card,
    border: `1px solid ${UI.border}`,
    borderRadius: 12,
    padding: 12,
  };

  const columnCard: React.CSSProperties = {
    background: UI.soft,
    border: `1px solid ${UI.border}`,
    borderRadius: 12,
    padding: 12,
    minHeight: 220,
  };

  return (
    <div style={{ padding: 16, background: UI.bg }}>
      <PageHeader
        title="Pipeline"
        subtitle="Stage view + health + forecast"
        actions={[
          { label: 'Deals', href: '/deals', primary: false },
          { label: 'Companies', href: '/companies', primary: false },
        ]}
      />

      <div style={{ height: 12 }} />

      {/* Needs attention */}
      <div style={{ ...containerCard, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: FW.semibold, color: UI.text }}>Needs attention</div>

            <div style={{ fontSize: 12, color: UI.secondary }}>
              {attentionStats.count} deals • {formatMoneyEUR(attentionStats.total)}
              {attentionStats.atRiskCount > 0 ? <> • {attentionStats.atRiskCount} at risk</> : null}
            </div>

            <span title="Rule: score < 50 OR missing owner/value OR no activity > 14 days" style={{ fontSize: 12, color: UI.muted, cursor: 'help' }}>
              criteria
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {actionQueue.length > 0 ? (
              <button type="button" onClick={() => setAttentionOpen((v) => !v)} style={miniBtn}>
                {attentionOpen ? 'Hide' : 'Show'}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: UI.muted }}>All good</span>
            )}
          </div>
        </div>

        {attentionOpen && actionQueue.length > 0 ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: UI.muted }}>
                Showing {showAllAttention ? actionQueue.length : Math.min(5, actionQueue.length)} of {actionQueue.length}
              </div>
              {actionQueue.length > 5 ? (
                <button type="button" onClick={() => setShowAllAttention((v) => !v)} style={miniBtn}>
                  {showAllAttention ? 'Show less' : 'Show all'}
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(showAllAttention ? actionQueue : actionQueue.slice(0, 5)).map((d) => {
                const reason = d.health.reasons[0] ?? 'Needs follow-up';
                return (
                  <div
                    key={d.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: `1px solid ${UI.border}`,
                      background: UI.soft,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Link href={`/deals/${d.id}`} style={{ color: UI.text, fontWeight: FW.semibold, textDecoration: 'none' }}>
                          {d.deal_name ?? 'Untitled deal'}
                        </Link>
                        <span style={{ fontSize: 12, color: UI.muted }}>{d.company_name ?? 'No company'}</span>
                        <span style={{ fontSize: 12, color: d.health.tone === 'bad' ? UI.danger : UI.warn }}>• {reason}</span>
                      </div>
                      <div style={{ fontSize: 12, color: UI.muted, marginTop: 2 }}>
                        Owner: {d.owner ?? 'Unassigned'} • {d.value == null ? 'Value missing' : formatMoneyEUR(d.value)} • Forecast {d.forecastMonth}
                      </div>
                    </div>

                    <Badge tone={d.health.tone} text={`${d.health.label} • ${d.health.score}`} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <SummaryCard label="Open pipeline value" value={formatMoneyEUR(topSummary.openTotal)} sub="Lead + Qualified + Proposal" />
        <SummaryCard label="Weighted pipeline" value={formatMoneyEUR(topSummary.openWeighted)} sub="Value × probability" />
        <SummaryCard label={`Forecast (MVP) • ${currentMonth}`} value={formatMoneyEUR(topSummary.monthForecast)} sub="Uses expected_close_date when set" />
        <SummaryCard label="At-risk deals" value={`${topSummary.atRiskCount} • ${formatMoneyEUR(topSummary.atRiskTotal)}`} sub="Score < 50" />
      </div>

      {/* Owner summary */}
      <div style={{ ...containerCard, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: FW.semibold, color: UI.text }}>Owner summary (open pipeline)</div>
          <div style={{ fontSize: 12, color: UI.muted }}>deal_probability (0..1) overrides stage probability</div>
        </div>

        {ownerSummary.length === 0 ? (
          <div style={{ marginTop: 10, color: UI.muted, fontSize: 13 }}>No open deals yet.</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: UI.muted, fontWeight: FW.medium }}>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                    Owner
                    <HeaderInfo id="hdr-owner" openId={openHeaderInfo} setOpenId={setOpenHeaderInfo} text="The Account Manager responsible for the client/deal." />
                  </th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                    Deals
                    <HeaderInfo
                      id="hdr-deals"
                      openId={openHeaderInfo}
                      setOpenId={setOpenHeaderInfo}
                      text="Number of open deals assigned to this owner (Lead + Qualified + Proposal)."
                    />
                  </th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                    Open value
                    <HeaderInfo
                      id="hdr-openvalue"
                      openId={openHeaderInfo}
                      setOpenId={setOpenHeaderInfo}
                      text="Sum of deal values for open deals (not weighted by probability)."
                    />
                  </th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                    Weighted
                    <HeaderInfo
                      id="hdr-weighted"
                      openId={openHeaderInfo}
                      setOpenId={setOpenHeaderInfo}
                      text="Value × probability (deal_probability if set, otherwise stage default)."
                    />
                  </th>
                  <th style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                    At risk
                    <HeaderInfo
                      id="hdr-atrisk"
                      openId={openHeaderInfo}
                      setOpenId={setOpenHeaderInfo}
                      text="Deals with health score under 50 (usually stale stage age, missing fields, or no recent activity)."
                    />
                  </th>
                </tr>
              </thead>

              <tbody>
                {ownerSummary.map((r) => (
                  <tr key={r.owner}>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}`, color: UI.text, fontWeight: FW.medium }}>{r.owner}</td>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}`, color: UI.secondary }}>{r.openCount}</td>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}`, color: UI.secondary }}>{formatMoneyEUR(r.openTotal)}</td>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}`, color: UI.secondary }}>{formatMoneyEUR(r.openWeighted)}</td>
                    <td style={{ padding: '8px 6px', borderBottom: `1px solid ${UI.border}` }}>
                      {r.atRiskCount === 0 ? (
                        <span style={{ color: UI.muted }}>—</span>
                      ) : (
                        <span style={{ color: UI.danger, fontWeight: FW.medium }}>
                          {r.atRiskCount} • {formatMoneyEUR(r.atRiskTotal)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Board */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(260px, 1fr))', gap: 12, minWidth: 5 * 260 }}>
          {STAGES.map((stage) => {
            const rows = dealsByStage[stage] ?? [];
            const sum = stageSummary[stage];

            return (
              <div
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const dealId = dragDealIdRef.current;
                  dragDealIdRef.current = null;
                  isDraggingRef.current = false;
                  setDraggingDealId(null);
                  if (!dealId) return;
                  moveDealToStage(dealId, stage);
                }}
                style={columnCard}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: FW.semibold, color: UI.text }}>{stage}</span>
                    <HeaderInfo
                      id={`stage-${stage}`}
                      openId={openHeaderInfo}
                      setOpenId={setOpenHeaderInfo}
                      text={STAGE_INFO[stage]}
                    />
                  </div>

                  <div style={{ fontSize: 12, color: UI.muted }}>{sum.count}</div>
                </div>

                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 12, color: UI.secondary }}>
                    Total: <span style={{ fontWeight: FW.medium, color: UI.text }}>{formatMoneyEUR(sum.total)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: UI.secondary }}>
                    Weighted: <span style={{ fontWeight: FW.medium, color: UI.text }}>{formatMoneyEUR(sum.weighted)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: sum.atRiskCount > 0 ? UI.danger : UI.muted }}>
                    At risk: {sum.atRiskCount > 0 ? `${sum.atRiskCount} • ${formatMoneyEUR(sum.atRiskTotal)}` : '—'}
                  </div>
                </div>

                <div style={{ height: 10 }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 12, color: UI.muted }}>No deals</div>
                  ) : (
                    rows.map((d) => {
                      const warnings = d.health.reasons.slice(0, 2);
                      const more = Math.max(0, d.health.reasons.length - warnings.length);

                      const isHovered = hoveredDealId === d.id;
                      const isDragging = draggingDealId === d.id;

                      const baseShadow = '0 1px 0 rgba(17,24,39,0.02)';
                      const hoverShadow = '0 10px 22px rgba(17,24,39,0.08)';
                      const dragShadow = '0 14px 28px rgba(17,24,39,0.14)';

                      return (
                        <div
                          key={d.id}
                          draggable
                          onMouseEnter={() => setHoveredDealId(d.id)}
                          onMouseLeave={() => setHoveredDealId((cur) => (cur === d.id ? null : cur))}
                          onDragStart={(e) => {
                            isDraggingRef.current = true;
                            dragDealIdRef.current = d.id;
                            setDraggingDealId(d.id);
                            try {
                              e.dataTransfer.effectAllowed = 'move';
                            } catch {}
                          }}
                          onDragEnd={() => {
                            setTimeout(() => {
                              isDraggingRef.current = false;
                              dragDealIdRef.current = null;
                              setDraggingDealId(null);
                            }, 80);
                          }}
                          onClick={() => onCardClick(d.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') onCardClick(d.id);
                          }}
                          style={{
                            background: UI.card,
                            border: `1px solid ${isHovered || isDragging ? UI.borderStrong : UI.border}`,
                            borderRadius: 12,
                            padding: 10,
                            cursor: isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                            transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
                            transform: isDragging ? 'translateY(-2px) rotate(-0.4deg)' : isHovered ? 'translateY(-2px)' : 'translateY(0px)',
                            boxShadow: isDragging ? dragShadow : isHovered ? hoverShadow : baseShadow,
                          }}
                          title="Drag to move stage • Click to open"
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <Grip />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      color: UI.text,
                                      fontWeight: FW.semibold,
                                      fontSize: 13,
                                      lineHeight: 1.25,
                                      display: '-webkit-box',
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {d.deal_name ?? 'Untitled deal'}
                                  </div>
                                  <div style={{ fontSize: 12, color: UI.muted, marginTop: 4 }}>{d.company_name ?? 'No company'}</div>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                              <Badge tone={d.health.tone} text={`${d.health.label} • ${d.health.score}`} />
                              <div style={{ fontSize: 12, color: UI.secondary, fontWeight: FW.medium }}>{formatMoneyEUR(d.value)}</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 12, color: UI.secondary }}>
                              Owner: <span style={{ fontWeight: FW.medium, color: UI.text }}>{d.owner?.trim() ? d.owner : 'Unassigned'}</span>
                            </div>

                            {d.stage !== 'Won' && d.stage !== 'Lost' ? (
                              <>
                                <div style={{ fontSize: 12, color: UI.secondary }}>
                                  Age: <span style={{ fontWeight: FW.medium, color: UI.text }}>{d.health.stageAgeDays}d</span>
                                </div>
                                <div style={{ fontSize: 12, color: UI.secondary }}>
                                  Last act:{' '}
                                  <span style={{ fontWeight: FW.medium, color: UI.text }}>{d.lastActivityAt ? `${d.health.lastActivityDays}d` : '—'}</span>
                                </div>
                              </>
                            ) : null}
                          </div>

                          {d.stage !== 'Won' && d.stage !== 'Lost' && d.health.reasons.length > 0 ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: d.health.tone === 'bad' ? UI.danger : UI.warn }}>
                              {warnings.join(' • ')}
                              {more > 0 ? ` • +${more} more` : ''}
                            </div>
                          ) : null}

                          {d.stage !== 'Won' && d.stage !== 'Lost' ? (
                            <div style={{ marginTop: 8, fontSize: 12, color: UI.muted }}>
                              Weighted: <span style={{ fontWeight: FW.medium }}>{formatMoneyEUR(d.weighted)}</span> • Prob:{' '}
                              <span style={{ fontWeight: FW.medium }}>{Math.round(d.prob * 100)}%</span> • Forecast:{' '}
                              <span style={{ fontWeight: FW.medium }}>{d.forecastMonth}</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 12, color: UI.muted, fontSize: 12 }}>
        Notes: Stage age uses <b>stage_changed_at</b> (fallback: created_at). Last activity uses activities where entity_type = <b>deal</b> and entity_id = deal.id.
      </div>
    </div>
  );
}
