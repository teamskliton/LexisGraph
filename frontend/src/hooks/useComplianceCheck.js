import { useMutation } from '@tanstack/react-query';
import { runComplianceCheck } from '../api/endpoints';

export function useComplianceCheck() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await runComplianceCheck();
      return data;
    }
  });
}
