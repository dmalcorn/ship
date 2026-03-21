import { useState, useMemo, useCallback, useRef } from 'react';
import { useFindings } from '../hooks/useFindings';
import { FindingCard } from './FindingCard';
import { EmptyState } from './EmptyState';
import type { Finding, Severity } from '../types';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface FindingsPanelProps {
  programId?: string;
}

export function FindingsPanel({ programId }: FindingsPanelProps) {
  const { data, isLoading, isError } = useFindings(true, programId);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const handleDismissed = useCallback((id: string) => {
    setDismissedIds(prev => new Set(prev).add(id));
  }, []);

  const sortedFindings = useMemo(() => {
    if (!data?.findings) return [];
    return [...data.findings]
      .filter(f => !dismissedIds.has(f.id))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [data?.findings, dismissedIds]);

  const count = sortedFindings.length;
  const lastScanAt = data?.lastScanAt ?? null;
  const isStale = lastScanAt ? (Date.now() - new Date(lastScanAt).getTime()) > 10 * 60_000 : false;

  if (isLoading) {
    return <SkeletonCards />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-8 text-center" role="status">
        <AlertTriangleIcon />
        <p className="text-xs text-[#a3a3a3] mt-2 m-0">Unable to reach FleetGraph</p>
        <p className="text-xs text-[#525252] mt-1 m-0">Will retry automatically</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#262626]" aria-live="polite">
        <span className="text-xs font-medium text-[#a3a3a3]">
          {count === 0 ? 'No findings' : `${count} finding${count === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-auto"
        role="list"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
          e.preventDefault();
          const articles = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="article"]');
          const current = document.activeElement?.closest('[role="article"]') as HTMLElement | null;
          const idx = current ? Array.from(articles).indexOf(current) : -1;
          const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
          const target = articles[next];
          if (target) {
            const focusable = target.querySelector<HTMLElement>('button, [tabindex]');
            (focusable ?? target).focus();
          }
        }}
      >
        {count === 0 ? (
          <EmptyState lastScanAt={lastScanAt} />
        ) : (
          sortedFindings.map((finding: Finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              onDismissed={handleDismissed}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {lastScanAt && (
        <div className="px-3 py-2 border-t border-[#262626]">
          <span className={`text-xs ${isStale ? 'text-[#fbbf24]' : 'text-[#525252]'}`}>
            Last scan: {formatRelativeTime(lastScanAt)}
          </span>
        </div>
      )}
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="px-3 py-2 space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-16 bg-[#262626] rounded animate-pulse" />
          <div className="h-3 w-full bg-[#262626] rounded animate-pulse" />
          <div className="h-3 w-3/4 bg-[#262626] rounded animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg className="h-8 w-8 text-[#fbbf24]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  );
}
