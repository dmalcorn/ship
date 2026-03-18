import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import type { FindingsResponse } from '../types';

export const fleetgraphKeys = {
  all: ['fleetgraph'] as const,
  findings: () => [...fleetgraphKeys.all, 'findings'] as const,
};

async function fetchFindings(): Promise<FindingsResponse> {
  const res = await apiGet('/api/fleetgraph/findings');
  if (!res.ok) {
    throw new Error('Failed to fetch findings');
  }
  return res.json();
}

export function useFindings(enabled = true) {
  return useQuery({
    queryKey: fleetgraphKeys.findings(),
    queryFn: fetchFindings,
    staleTime: 0,
    refetchInterval: 30_000,
    enabled,
  });
}
