import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { FindingsResponse } from '../types';

export const fleetgraphKeys = {
  all: ['fleetgraph'] as const,
  findings: (programId?: string) => [...fleetgraphKeys.all, 'findings', programId ?? 'all'] as const,
};

async function fetchFindings(programId?: string): Promise<FindingsResponse> {
  const url = programId
    ? `/api/fleetgraph/findings?programId=${encodeURIComponent(programId)}`
    : '/api/fleetgraph/findings';
  const res = await apiGet(url);
  if (!res.ok) {
    throw new Error('Failed to fetch findings');
  }
  return res.json();
}

export function useFindings(enabled = true, programId?: string) {
  return useQuery({
    queryKey: fleetgraphKeys.findings(programId),
    queryFn: () => fetchFindings(programId),
    staleTime: 0,
    refetchInterval: 30_000,
    enabled,
  });
}
