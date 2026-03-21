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
      // Cancel in-flight fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: fleetgraphKeys.findings() });

      const previous = queryClient.getQueryData<FindingsResponse>(fleetgraphKeys.findings());

      // Optimistically remove the finding (action resolves it)
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
