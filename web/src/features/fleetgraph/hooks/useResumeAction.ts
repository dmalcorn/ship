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

      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: fleetgraphKeys.findings() });

      const previous = queryClient.getQueryData<FindingsResponse>(fleetgraphKeys.findings());

      // Optimistically remove the finding from the cache so badge + panel agree
      if (previous) {
        queryClient.setQueryData<FindingsResponse>(fleetgraphKeys.findings(), {
          ...previous,
          findings: previous.findings.filter((f) => f.id !== params.findingId),
        });
      }

      return { previous };
    },
    onError: (_err, _params, context) => {
      // Roll back on failure
      if (context?.previous) {
        queryClient.setQueryData(fleetgraphKeys.findings(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: fleetgraphKeys.findings() });
    },
  });
}
