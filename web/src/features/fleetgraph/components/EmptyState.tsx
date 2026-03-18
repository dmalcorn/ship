import { useState, useEffect } from 'react';

interface EmptyStateProps {
  lastScanAt: string | null;
}

export function EmptyState({ lastScanAt }: EmptyStateProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 10s so the countdown updates
  useEffect(() => {
    if (!lastScanAt) return;
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [lastScanAt]);

  const nextScanIn = getNextScanCountdown(lastScanAt, now);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-8 text-center" role="status" aria-live="polite">
      <ShieldCheckIcon />
      <p className="text-sm font-medium text-[#34d399] mt-3 m-0">
        No findings — you're in good shape.
      </p>
      {nextScanIn && (
        <p className="text-xs text-[#525252] mt-1 m-0">
          Next scan in {nextScanIn}
        </p>
      )}
    </div>
  );
}

function getNextScanCountdown(lastScanAt: string | null, now: number): string | null {
  if (!lastScanAt) return null;
  const elapsed = now - new Date(lastScanAt).getTime();
  const interval = 3 * 60_000; // 3-minute cron
  const remaining = Math.max(0, interval - elapsed);
  if (remaining <= 0) return 'soon';
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  if (minutes > 0) return `~${minutes}m`;
  return `~${seconds}s`;
}

function ShieldCheckIcon() {
  return (
    <svg className="h-10 w-10 text-[#34d399]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}
