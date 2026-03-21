import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { fleetgraphKeys } from './useFindings';
import type { FindingsResponse } from '../types';

interface ResumeActionParams {
  threadId: string;
  decision: 'confirm' | 'dismiss' | 'snooze';
  findingId?: string;
  snoozeDurationMs?: number;
}

async function resumeAction(params: ResumeActionParams): Promise<void> {
  const res = await apiPost('/api/fleetgraph/resume', params);
  if (!res.ok) {
    throw new Error('Failed to resume action');
  }
}

export function useResumeAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resumeAction,
    onMutate: async (params) => {
      if (params.decision !== 'dismiss' && params.decision !== 'snooze') return;
      if (!params.findingId) return;

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
