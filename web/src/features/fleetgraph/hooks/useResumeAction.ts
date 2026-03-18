import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/lib/api';
import { fleetgraphKeys } from './useFindings';

interface ResumeActionParams {
  threadId: string;
  decision: 'confirm' | 'dismiss';
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: fleetgraphKeys.findings() });
    },
  });
}
