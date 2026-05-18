import { create } from 'zustand';
import { useCallback } from 'react';
import type { CandidateRegistrationData } from '../types';
import { fetchCandidateRegistration } from '../services/candidateRegistration';
import type { LocalCandidateElectionId } from '../services/candidateRegistration';

interface CandidateRegistrationState {
  cache: Record<string, CandidateRegistrationData>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  fetch: (params: { admCd: string; electionId: LocalCandidateElectionId; sdName?: string; sggName?: string }) => Promise<void>;
}

function getCacheKey(params: { admCd: string; electionId: LocalCandidateElectionId; sdName?: string; sggName?: string }) {
  return [
    params.electionId,
    params.admCd,
    params.sdName ?? '',
    params.sggName ?? '',
  ].join('|');
}

export const useCandidateRegistrationStore = create<CandidateRegistrationState>((set, get) => ({
  cache: {},
  loading: {},
  errors: {},
  async fetch(params) {
    const key = getCacheKey(params);
    if (get().cache[key] || get().loading[key]) {
      return;
    }

    set((state) => ({
      loading: { ...state.loading, [key]: true },
      errors: { ...state.errors, [key]: null },
    }));

    try {
      const data = await fetchCandidateRegistration({
        admCd: params.admCd,
        electionId: params.electionId,
        sdName: params.sdName,
        sggName: params.sggName,
      });

      set((state) => ({
        cache: { ...state.cache, [key]: data },
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: null },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '데이터를 불러오지 못했습니다';
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        errors: { ...state.errors, [key]: message },
      }));
    }
  },
}));

export function useCandidateRegistrationQuery(params: {
  admCd: string;
  electionId: LocalCandidateElectionId;
  sdName?: string;
  sggName?: string;
}) {
  const { admCd, electionId, sdName, sggName } = params;
  const key = getCacheKey(params);
  const data = useCandidateRegistrationStore((state) => state.cache[key] ?? null);
  const loading = useCandidateRegistrationStore((state) => state.loading[key] ?? false);
  const error = useCandidateRegistrationStore((state) => state.errors[key] ?? null);
  const fetch = useCandidateRegistrationStore((state) => state.fetch);
  const refetch = useCallback(
    () => fetch({ admCd, electionId, sdName, sggName }),
    [admCd, electionId, fetch, sdName, sggName],
  );

  return {
    data,
    loading,
    error,
    refetch,
  };
}
