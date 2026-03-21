import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FindingsPanel } from './FindingsPanel';
import type { FindingsResponse } from '../types';

// Mock useFindings
const mockUseFindings = vi.fn();
vi.mock('../hooks/useFindings', () => ({
  useFindings: () => mockUseFindings(),
}));

// Mock useResumeAction for child FindingCards
vi.mock('../hooks/useResumeAction', () => ({
  useResumeAction: () => ({
    mutate: vi.fn(),
  }),
}));

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FindingsPanel />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function makeFindingsData(count: number, lastScanAt?: string): { data: FindingsResponse; isLoading: boolean; isError: boolean } {
  const severities: ('critical' | 'warning' | 'info')[] = ['critical', 'info', 'warning'];
  const findings = Array.from({ length: count }, (_, i) => ({
    id: `f-${i}`,
    threadId: `t-${i}`,
    title: `Finding ${i}`,
    description: `Description ${i}`,
    severity: severities[i % 3]!,
    category: 'test',
    programPrefix: null,
    affectedDocumentId: null,
    affectedDocumentType: null,
    affectedDocumentTitle: null,
    affectedDocumentCount: 0,
    proposedActions: [] as { id: string; label: string; description: string }[],
    automatedAction: null,
    createdAt: new Date().toISOString(),
  }));
  return {
    data: { findings, lastScanAt: lastScanAt ?? new Date().toISOString() },
    isLoading: false,
    isError: false,
  };
}

describe('FindingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows skeleton cards during loading', () => {
    mockUseFindings.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { container } = renderPanel();
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(3);
  });

  it('shows error state when request fails', () => {
    mockUseFindings.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPanel();
    expect(screen.getByText('Unable to reach FleetGraph')).toBeInTheDocument();
    expect(screen.getByText('Will retry automatically')).toBeInTheDocument();
  });

  it('shows empty state when no findings', () => {
    mockUseFindings.mockReturnValue(makeFindingsData(0));
    renderPanel();
    expect(screen.getByText("No findings — you're in good shape.")).toBeInTheDocument();
    expect(screen.getByText('No findings')).toBeInTheDocument();
  });

  it('shows count header for multiple findings', () => {
    mockUseFindings.mockReturnValue(makeFindingsData(5));
    renderPanel();
    expect(screen.getByText('5 findings')).toBeInTheDocument();
  });

  it('shows singular count for 1 finding', () => {
    mockUseFindings.mockReturnValue(makeFindingsData(1));
    renderPanel();
    expect(screen.getByText('1 finding')).toBeInTheDocument();
  });

  it('sorts findings by severity: critical first', () => {
    mockUseFindings.mockReturnValue(makeFindingsData(3));
    renderPanel();
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(3);
    // First article should contain 'critical' severity (index 0 % 3 = 0 = critical)
    expect(articles[0]!.textContent).toContain('critical');
  });

  it('shows last scan time in footer', () => {
    const recentScan = new Date().toISOString();
    mockUseFindings.mockReturnValue(makeFindingsData(1, recentScan));
    renderPanel();
    expect(screen.getByText(/Last scan:/)).toBeInTheDocument();
  });

  it('shows stale warning when scan is old', () => {
    const oldScan = new Date(Date.now() - 15 * 60_000).toISOString(); // 15 min ago
    mockUseFindings.mockReturnValue(makeFindingsData(1, oldScan));
    const { container } = renderPanel();
    const footer = container.querySelector('.text-\\[\\#fbbf24\\]');
    expect(footer).toBeInTheDocument();
  });

  it('has aria-live region for count header', () => {
    mockUseFindings.mockReturnValue(makeFindingsData(2));
    const { container } = renderPanel();
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});
