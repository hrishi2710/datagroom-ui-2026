import { useMutation, useQueryClient } from '@tanstack/react-query';
import { pinDs } from '../../api/ds';

function getAuthHeaders() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return {};
    const u = JSON.parse(raw);
    if (u && u.token) return u.token;
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Mutation hook for pinning / unpinning a dataset.
 * On success, the allDs query cache is invalidated so the list re-fetches
 * with up-to-date pinned flags from the server.
 *
 * @param {string} userId  - current user, used to target the right query cache key
 */
export function usePinDs(userId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dsName, dsUser, pin }) => {
      const token = getAuthHeaders();
      return pinDs(dsName, dsUser, pin, token);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['allDs', variables.dsUser || userId] });
    },
    onError: (err) => {
      console.error('Failed to update pin:', err);
    },
  });
}

export default usePinDs;
