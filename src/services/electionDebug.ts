import type { Candidate, ElectionData, ElectionDebugMeta } from '../types';

export type ElectionLookupFailureCode = 'NO_DATA' | 'NEEDS_REVIEW';

export interface ElectionLookupContext {
  requestedAdminCode: string;
  requestedAdminName?: string;
  electionId: string;
}

export class ElectionLookupError extends Error {
  code: ElectionLookupFailureCode;
  debugMeta?: ElectionDebugMeta;

  constructor(
    code: ElectionLookupFailureCode,
    message: string,
    debugMeta?: ElectionDebugMeta,
  ) {
    super(message);
    this.name = 'ElectionLookupError';
    this.code = code;
    this.debugMeta = debugMeta;
  }
}

export function isElectionLookupError(error: unknown): error is ElectionLookupError {
  return error instanceof ElectionLookupError;
}

export function attachElectionDebugMeta(
  data: ElectionData,
  debugMeta: ElectionDebugMeta,
): ElectionData {
  return {
    ...data,
    debug_meta: debugMeta,
  };
}

function getFirstCandidateSample(candidates: Candidate[] | undefined): string | undefined {
  const firstCandidate = candidates?.[0];
  if (!firstCandidate) return undefined;
  return `${firstCandidate.name}${firstCandidate.party ? `/${firstCandidate.party}` : ''}`;
}

export function logElectionDecision(
  context: ElectionLookupContext,
  debugMeta: ElectionDebugMeta,
  options?: {
    data?: ElectionData | null;
    mappingSucceeded?: boolean;
    fallbackReason?: string;
  },
): void {
  if (!import.meta.env.DEV) return;

  const data = options?.data ?? null;

  console.debug('election.lookup', {
    requestedAdminCode: context.requestedAdminCode,
    requestedAdminName: context.requestedAdminName,
    electionId: context.electionId,
    requestUrl: debugMeta.requestUrl,
    statusCode: debugMeta.statusCode,
    matchedElectionRegionName: debugMeta.matchedRegionName,
    matchedElectionRegionCode: debugMeta.matchedRegionCode,
    selectedSourceType: debugMeta.sourceType,
    selectedElectionRecordCount: debugMeta.recordCount,
    firstCandidateSample: getFirstCandidateSample(data?.candidates),
    mappingSuccess: options?.mappingSucceeded ?? !!data,
    fallbackReason: options?.fallbackReason ?? debugMeta.fallbackReason,
  });
}
