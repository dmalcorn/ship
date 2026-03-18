import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResumeAction } from '../hooks/useResumeAction';
import type { Finding, Severity } from '../types';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'text-[#f87171]',
  warning: 'text-[#fbbf24]',
  info: 'text-[#60a5fa]',
};

interface FindingCardProps {
  finding: Finding;
  onDismissed?: (id: string) => void;
}

export function FindingCard({ finding, onDismissed }: FindingCardProps) {
  const navigate = useNavigate();
  const { mutate } = useResumeAction();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [slidingOut, setSlidingOut] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // After slide-out transition ends, notify parent to remove from list
  useEffect(() => {
    if (!slidingOut) return;
    const el = cardRef.current;
    if (!el) return;
    const handleEnd = () => onDismissed?.(finding.id);
    el.addEventListener('transitionend', handleEnd, { once: true });
    // Fallback in case transitionend doesn't fire
    const fallback = setTimeout(handleEnd, 200);
    return () => {
      el.removeEventListener('transitionend', handleEnd);
      clearTimeout(fallback);
    };
  }, [slidingOut, finding.id, onDismissed]);

  const handleConfirm = useCallback(() => {
    setConfirming(true);
    mutate(
      { threadId: finding.threadId, decision: 'confirm' },
      {
        onSuccess: () => {
          setConfirming(false);
          setConfirmed(true);
          setTimeout(() => {
            onDismissed?.(finding.id);
          }, 3000);
        },
        onError: () => {
          setConfirming(false);
        },
      }
    );
  }, [finding.threadId, finding.id, mutate, onDismissed]);

  const handleDismiss = useCallback(() => {
    setSlidingOut(true);
    mutate({ threadId: finding.threadId, decision: 'dismiss' });
  }, [finding.threadId, mutate]);

  const handleDocumentClick = useCallback(() => {
    if (finding.affectedDocumentId) {
      navigate(`/documents/${finding.affectedDocumentId}`);
    }
  }, [finding.affectedDocumentId, navigate]);

  const actionLabel = finding.proposedActions[0]?.label || 'Confirm';

  return (
    <div
      ref={cardRef}
      role="article"
      className={`px-3 py-2.5 border-b border-[#262626] transition-all duration-150 ${
        confirmed ? 'opacity-0' : ''
      } ${slidingOut ? 'translate-x-full opacity-0' : ''}`}
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

      {/* Description */}
      <p className="text-xs text-[#a3a3a3] leading-relaxed mb-2 m-0">
        {finding.description}
      </p>

      {/* Affected document link */}
      {finding.affectedDocumentTitle && (
        <button
          onClick={handleDocumentClick}
          className="flex items-center gap-1 text-xs text-[#60a5fa] hover:text-[#93bbfd] mb-2 bg-transparent border-none cursor-pointer p-0"
        >
          <ExternalLinkIcon />
          <span className="truncate">{finding.affectedDocumentTitle}</span>
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {confirmed ? (
          <span className="text-xs font-medium text-[#34d399]">Done</span>
        ) : (
          <>
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="bg-[#005ea2] text-white text-xs px-2.5 py-1 rounded border-none cursor-pointer hover:bg-[#004d84] disabled:opacity-50 transition-colors"
            >
              {confirming ? <Spinner /> : actionLabel}
            </button>
            <button
              onClick={handleDismiss}
              aria-label={`Dismiss finding: ${finding.title}`}
              className="text-[#a3a3a3] hover:text-[#f5f5f5] text-xs px-2 py-1 bg-transparent border-none cursor-pointer transition-colors"
            >
              Dismiss
            </button>
          </>
        )}
      </div>
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

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
