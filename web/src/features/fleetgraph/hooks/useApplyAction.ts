import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { fleetgraphKeys } from './useFindings';
import type { FindingsResponse } from '../types';

interface ApplyActionParams {
  findingId: string;
  actionType: string;
  payload: Record<string, string>;
}

async function applyAction(params: ApplyActionParams): Promise<void> {
  const res = await apiPost('/api/fleetgraph/apply-action', params);
  if (!res.ok) {
    throw new Error('Failed to apply action');
  }
}

export function useApplyAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applyAction,
    onMutate: async (params) => {
      // Cancel all findings queries (any program scope)
      const findingsPrefix = [...fleetgraphKeys.all, 'findings'];
      await queryClient.cancelQueries({ queryKey: findingsPrefix });

      // Optimistically remove the finding from all matching caches
      queryClient.setQueriesData<FindingsResponse>(
        { queryKey: findingsPrefix },
        (old) => old ? { ...old, findings: old.findings.filter((f) => f.id !== params.findingId) } : old,
      );

      return {};
    },
    onError: () => {
      // Refetch on failure to restore correct state
      queryClient.invalidateQueries({ queryKey: [...fleetgraphKeys.all, 'findings'] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [...fleetgraphKeys.all, 'findings'] });
    },
  });
}
