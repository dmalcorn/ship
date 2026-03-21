import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResumeAction } from '../hooks/useResumeAction';
import { useApplyAction } from '../hooks/useApplyAction';
import type { Finding, Severity } from '../types';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-[#f87171]',
  warning: 'text-[#fbbf24]',
  info: 'text-[#60a5fa]',
};

const SNOOZE_OPTIONS = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: 'Next day', ms: 24 * 60 * 60 * 1000 },
] as const;

interface FindingCardProps {
  finding: Finding;
  onDismissed?: (id: string) => void;
}

export function FindingCard({ finding, onDismissed }: FindingCardProps) {
  const navigate = useNavigate();
  const { mutate } = useResumeAction();
  const { mutate: applyAction, isPending: isApplying } = useApplyAction();
  const [slidingOut, setSlidingOut] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozedLabel, setSnoozedLabel] = useState<string | null>(null);
  const [actionApplied, setActionApplied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const snoozeRef = useRef<HTMLDivElement>(null);

  // After slide-out transition ends, notify parent to remove from list
  useEffect(() => {
    if (!slidingOut) return;
    const el = cardRef.current;
    if (!el) return;
    const handleEnd = () => onDismissed?.(finding.id);
    el.addEventListener('transitionend', handleEnd, { once: true });
    const fallback = setTimeout(handleEnd, 200);
    return () => {
      el.removeEventListener('transitionend', handleEnd);
      clearTimeout(fallback);
    };
  }, [slidingOut, finding.id, onDismissed]);

  // Close snooze popover on outside click
  useEffect(() => {
    if (!snoozeOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [snoozeOpen]);

  const docTypeLabel = finding.affectedDocumentType
    ? finding.affectedDocumentType.charAt(0).toUpperCase() + finding.affectedDocumentType.slice(1)
    : 'Document';

  // Map document types to their list-view routes
  const listRouteForType: Record<string, string> = {
    issue: '/issues',
    project: '/projects',
    program: '/programs',
    sprint: '/issues', // sprints redirect to /team/allocation; fall back to /issues
  };

  const handleViewInShip = useCallback(() => {
    if (finding.affectedDocumentId) {
      // Single affected document — navigate directly to it
      navigate(`/documents/${finding.affectedDocumentId}`);
    } else {
      // Multiple affected documents or none — navigate to list view
      const route = listRouteForType[finding.affectedDocumentType || ''] || '/issues';
      navigate(route);
    }
  }, [finding.affectedDocumentId, finding.affectedDocumentType, navigate]);

  const handleDismiss = useCallback(() => {
    setSlidingOut(true);
    mutate({ threadId: finding.threadId, decision: 'dismiss', findingId: finding.id });
  }, [finding.threadId, finding.id, mutate]);

  const handleSnooze = useCallback((durationMs: number, label: string) => {
    setSnoozeOpen(false);
    setSnoozedLabel(label);
    mutate({
      threadId: finding.threadId,
      decision: 'snooze',
      findingId: finding.id,
      snoozeDurationMs: durationMs,
    });
    // Brief feedback, then slide out
    setTimeout(() => setSlidingOut(true), 1500);
  }, [finding.threadId, finding.id, mutate]);

  const handleApplyAction = useCallback(() => {
    if (!finding.automatedAction) return;
    setActionApplied(true);
    applyAction({
      findingId: finding.id,
      actionType: finding.automatedAction.actionType,
      payload: finding.automatedAction.payload,
    });
    // Brief feedback, then slide out
    setTimeout(() => setSlidingOut(true), 1500);
  }, [finding.id, finding.automatedAction, applyAction]);

  const recommendation = finding.proposedActions[0]?.label || finding.description;

  return (
    <div
      ref={cardRef}
      role="article"
      className={`px-3 py-2.5 border-b border-[#262626] transition-all duration-150 ${
        slidingOut ? 'translate-x-full opacity-0' : ''
      }`}
    >
      {/* Severity + Title */}
      <div className="flex items-start gap-2 mb-1">
        <span className={`text-xs font-medium uppercase shrink-0 ${SEVERITY_COLORS[finding.severity]}`}>
          {finding.severity}
        </span>
        <h3 className="text-xs font-medium text-[#f5f5f5] leading-tight m-0">
          {finding.title}
        </h3>
      </div>

      {/* Recommendation */}
      <p className="text-xs text-[#a3a3a3] leading-relaxed mb-2 m-0">
        {recommendation}
      </p>

      {/* Automated action suggestion */}
      {finding.automatedAction && !actionApplied && !snoozedLabel && (
        <div className="mb-2 px-2 py-1.5 rounded bg-[#1a2332] border border-[#1e3a5f]">
          <p className="text-xs text-[#93c5fd] leading-relaxed m-0 mb-1.5">
            <span className="font-medium">Action:</span> {finding.automatedAction.label}
          </p>
          <button
            onClick={handleApplyAction}
            disabled={isApplying}
            className="flex items-center gap-1 bg-[#1d4ed8] text-white text-xs px-2.5 py-1 rounded border-none cursor-pointer hover:bg-[#1e40af] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BoltIcon />
            {isApplying ? 'Applying…' : finding.automatedAction.buttonLabel}
          </button>
        </div>
      )}

      {/* Applied feedback */}
      {actionApplied ? (
        <span className="text-xs font-medium text-[#34d399]">
          Action applied
        </span>
      ) : snoozedLabel ? (
        <span className="text-xs font-medium text-[#fbbf24]">
          Snoozed for {snoozedLabel}
        </span>
      ) : (
        /* Actions */
        <div className="flex items-center gap-2">
          <button
            onClick={handleViewInShip}
            className="flex items-center gap-1 bg-[#005ea2] text-white text-xs px-2.5 py-1 rounded border-none cursor-pointer hover:bg-[#004d84] transition-colors"
          >
            <ExternalLinkIcon />
            {finding.affectedDocumentId
              ? `View ${docTypeLabel}`
              : `View ${docTypeLabel}s`}
          </button>

          {/* Snooze with popover */}
          <div ref={snoozeRef} className="relative">
            <button
              onClick={() => setSnoozeOpen((prev) => !prev)}
              aria-label={`Snooze finding: ${finding.title}`}
              className="flex items-center gap-1 text-[#a3a3a3] hover:text-[#f5f5f5] text-xs px-2 py-1 bg-transparent border-none cursor-pointer transition-colors"
            >
              <ClockIcon />
              Snooze
            </button>
            {snoozeOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-[#333] rounded shadow-lg z-10 py-1 min-w-[100px]">
                {SNOOZE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => handleSnooze(opt.ms, opt.label)}
                    className="block w-full text-left text-xs text-[#d4d4d4] hover:bg-[#262626] hover:text-[#f5f5f5] px-3 py-1.5 bg-transparent border-none cursor-pointer transition-colors"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleDismiss}
            aria-label={`Dismiss finding: ${finding.title}`}
            className="text-[#a3a3a3] hover:text-[#f5f5f5] text-xs px-2 py-1 bg-transparent border-none cursor-pointer transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth={2} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
