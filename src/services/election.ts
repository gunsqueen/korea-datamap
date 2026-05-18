import type { ElectionData, ElectionMeta } from '../types';
import { fetchNecElection } from './nec';
import { lookupLocalElectionDong, lookupUncandidateDong } from './localElectionStatic';
import {
  attachElectionDebugMeta,
  ElectionLookupError,
  isElectionLookupError,
  logElectionDecision,
} from './electionDebug';
import { applyPartyColors } from '../utils/partyColors';
import electionsMeta from '../data/mock/elections_meta.json';
import presidentialData21 from '../data/mock/election_presidential_21.json';
import presidentialData20 from '../data/mock/election_presidential_20.json';
import presidentialData19 from '../data/mock/election_presidential_19.json';
import presidentialData18 from '../data/mock/election_presidential_18.json';
import assemblyData22District from '../data/mock/election_assembly_22_district.json';
import assemblyData22Pr from '../data/mock/election_assembly_22.json';
import assemblyData21District from '../data/mock/election_assembly_21_district.json';
import assemblyData21Pr from '../data/mock/election_assembly_21.json';
import assemblyData20District from '../data/mock/election_assembly_20_district.json';
import assemblyData20Pr from '../data/mock/election_assembly_20_pr.json';
import assemblyData19District from '../data/mock/election_assembly_19_district.json';
import assemblyData19Pr from '../data/mock/election_assembly_19_pr.json';
import localData8Mayor from '../data/mock/election_local_8.json';
import localData8CouncilDistrict from '../data/mock/election_local_8_council_district.json';
import localData8CouncilPr from '../data/mock/election_local_8_council_pr.json';
import localData8BasicDistrict from '../data/mock/election_local_8_basic_district.json';
import localData8BasicPr from '../data/mock/election_local_8_basic_pr.json';
import localData7Mayor from '../data/mock/election_local_7.json';
import localData7CouncilDistrict from '../data/mock/election_local_7_council_district.json';
import localData7CouncilPr from '../data/mock/election_local_7_council_pr.json';
import localData7BasicDistrict from '../data/mock/election_local_7_basic_district.json';
import localData7BasicPr from '../data/mock/election_local_7_basic_pr.json';
import localData6Mayor from '../data/mock/election_local_6.json';
import localData6CouncilDistrict from '../data/mock/election_local_6_council_district.json';
import localData6CouncilPr from '../data/mock/election_local_6_council_pr.json';
import localData6BasicDistrict from '../data/mock/election_local_6_basic_district.json';
import localData6BasicPr from '../data/mock/election_local_6_basic_pr.json';

const DATA_BY_ID: Record<string, ElectionData[]> = {
  presidential_21: presidentialData21 as ElectionData[],
  presidential_20: presidentialData20 as ElectionData[],
  presidential_19: presidentialData19 as ElectionData[],
  presidential_18: presidentialData18 as ElectionData[],
  assembly_22_district: assemblyData22District as ElectionData[],
  assembly_22_pr: assemblyData22Pr as ElectionData[],
  assembly_21_district: assemblyData21District as ElectionData[],
  assembly_21_pr: assemblyData21Pr as ElectionData[],
  assembly_20_district: assemblyData20District as ElectionData[],
  assembly_20_pr: assemblyData20Pr as ElectionData[],
  assembly_19_district: assemblyData19District as ElectionData[],
  assembly_19_pr: assemblyData19Pr as ElectionData[],
  local_8_metro_mayor: localData8Mayor as ElectionData[],
  local_8_mayor: localData8Mayor as ElectionData[],
  local_8_council_district: localData8CouncilDistrict as ElectionData[],
  local_8_council_pr: localData8CouncilPr as ElectionData[],
  local_8_basic_district: localData8BasicDistrict as ElectionData[],
  local_8_basic_pr: localData8BasicPr as ElectionData[],
  local_7_metro_mayor: localData7Mayor as ElectionData[],
  local_7_mayor: localData7Mayor as ElectionData[],
  local_7_council_district: localData7CouncilDistrict as ElectionData[],
  local_7_council_pr: localData7CouncilPr as ElectionData[],
  local_7_basic_district: localData7BasicDistrict as ElectionData[],
  local_7_basic_pr: localData7BasicPr as ElectionData[],
  local_6_metro_mayor: localData6Mayor as ElectionData[],
  local_6_mayor: localData6Mayor as ElectionData[],
  local_6_council_district: localData6CouncilDistrict as ElectionData[],
  local_6_council_pr: localData6CouncilPr as ElectionData[],
  local_6_basic_district: localData6BasicDistrict as ElectionData[],
  local_6_basic_pr: localData6BasicPr as ElectionData[],
};

export const ELECTIONS_META: ElectionMeta[] = electionsMeta as ElectionMeta[];

const STATIC_DONG_ELECTION_IDS = new Set([
  'presidential_18',
  'presidential_19',
  'presidential_20',
  'presidential_21',
  'assembly_19_district',
  'assembly_19_pr',
  'assembly_20_district',
  'assembly_20_pr',
  'assembly_21_district',
  'assembly_21_pr',
  'assembly_22_district',
  'assembly_22_pr',
  'local_6_metro_mayor',
  'local_6_mayor',
  'local_6_council_district',
  'local_6_council_pr',
  'local_6_basic_district',
  'local_6_basic_pr',
  'local_7_metro_mayor',
  'local_7_mayor',
  'local_7_council_district',
  'local_7_council_pr',
  'local_7_basic_district',
  'local_7_basic_pr',
  'local_8_metro_mayor',
  'local_8_mayor',
  'local_8_council_district',
  'local_8_council_pr',
  'local_8_basic_district',
  'local_8_basic_pr',
]);

function isDistrictElection(electionId: string): boolean {
  return electionId.endsWith('_district');
}

function canUseBroadFallback(electionId: string, admCd: string): boolean {
  // district 선거(지역구)는 동(8자리) 레벨에서만 상위 집계 fallback 금지.
  // 시도(2자리)·시군구(5자리) 레벨에서는 NEC API 실패 시 sido-level mock 데이터로 표시.
  if (isDistrictElection(electionId) && admCd.length === 8) return false;
  return true;
}

/**
 * admCd 기준으로 선거 결과 조회 (mock fallback).
 */
export function getElectionByCode(admCd: string, electionId: string): ElectionData | null {
  const rows = DATA_BY_ID[electionId];
  if (!rows || rows.length === 0) return null;

  const find = (cd: string) => rows.find((r) => r.adm_cd === cd) ?? null;
  const exact = find(admCd);
  if (exact) {
    return applyPartyColors(attachElectionDebugMeta(exact, {
      sourceType: 'mock',
      matchedRegionName: exact.adm_nm,
      matchedRegionCode: exact.adm_cd,
      recordCount: 1,
    }));
  }

  if (!canUseBroadFallback(electionId, admCd)) return null;

  const fallbackCandidates = [
    admCd.length === 8 ? admCd.slice(0, 5) : null,
    admCd.length >= 5 ? admCd.slice(0, 2) : null,
    '00',
  ].filter((candidate): candidate is string => !!candidate);

  for (const fallbackCode of fallbackCandidates) {
    const fallback = find(fallbackCode);
    if (!fallback) continue;

    return applyPartyColors(attachElectionDebugMeta(fallback, {
      sourceType: 'mock',
      matchedRegionName: fallback.adm_nm,
      matchedRegionCode: fallback.adm_cd,
      recordCount: 1,
      fallbackReason: `mock fallback to ${fallbackCode}`,
    }));
  }

  return null;
}

/**
 * 실제 NEC API 우선 조회 → mock fallback
 */
export async function fetchElectionResult(
  admCd: string,
  electionId = 'presidential_20',
  admNm?: string,
): Promise<ElectionData> {
  const context = {
    requestedAdminCode: admCd,
    requestedAdminName: admNm,
    electionId,
  };

  const isDongLevelStaticElection =
    admCd.length === 8 &&
    !!admNm &&
    STATIC_DONG_ELECTION_IDS.has(electionId);

  // 읍면동(8자리) 선거 결과는 NEC API가 상위 집계값을 잘못 반환하는 경우가 있어
  // 가공된 실제 스냅샷을 source of truth로 우선 사용한다.
  if (isDongLevelStaticElection) {
    let staticMissing = false;
    try {
      const staticResult = await lookupLocalElectionDong(electionId, admCd, admNm);
      if (staticResult) return applyPartyColors(staticResult);
      staticMissing = true;
    } catch (err) {
      if (isElectionLookupError(err) && err.code !== 'NO_DATA') {
        logElectionDecision(
          context,
          err.debugMeta ?? { sourceType: 'snapshot', fallbackReason: err.message },
          { data: null, mappingSucceeded: false, fallbackReason: err.debugMeta?.fallbackReason ?? err.message },
        );
        throw err;
      }
      staticMissing = true;
    }

    if (staticMissing) {
      // 정적 동 데이터 없음 → 무투표당선 확인
      const uncontested = await lookupUncandidateDong(electionId, admCd, admNm);
      if (uncontested) return uncontested;

      const noDataError = new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
        sourceType: 'snapshot',
        matchedRegionCode: admCd,
        matchedRegionName: admNm,
        fallbackReason: 'static dong election match missing',
        recordCount: 0,
      });
      logElectionDecision(
        context,
        noDataError.debugMeta!,
        { data: null, mappingSucceeded: false, fallbackReason: noDataError.debugMeta?.fallbackReason },
      );
      throw noDataError;
    }
  }

  // NEC API 우선 시도 (나머지)
  let realError: unknown = null;
  try {
    return applyPartyColors(await fetchNecElection(admCd, electionId, admNm));
  } catch (err) {
    realError = err;
    if (isElectionLookupError(err) && err.code === 'NEEDS_REVIEW') {
      logElectionDecision(
        context,
        err.debugMeta ?? { sourceType: 'real', fallbackReason: err.message },
        { data: null, mappingSucceeded: false, fallbackReason: err.debugMeta?.fallbackReason ?? err.message },
      );
      throw err;
    }
    console.warn('NEC API 실패 → mock fallback', err);
  }

  // mock fallback
  const result = getElectionByCode(admCd, electionId);
  if (result) {
    result.debug_meta = {
      sourceType: result.debug_meta?.sourceType ?? 'mock',
      requestUrl: result.debug_meta?.requestUrl,
      statusCode: result.debug_meta?.statusCode,
      matchedRegionName: result.debug_meta?.matchedRegionName,
      matchedRegionCode: result.debug_meta?.matchedRegionCode,
      recordCount: result.debug_meta?.recordCount,
      fallbackReason: result.debug_meta?.fallbackReason ?? 'NEC unavailable',
    };
    logElectionDecision(context, result.debug_meta!, {
      data: result,
      mappingSucceeded: true,
      fallbackReason: result.debug_meta?.fallbackReason,
    });
    return applyPartyColors(result);
  }

  if (isElectionLookupError(realError)) {
    logElectionDecision(
      context,
      realError.debugMeta ?? { sourceType: 'real', fallbackReason: realError.message },
      { data: null, mappingSucceeded: false, fallbackReason: realError.debugMeta?.fallbackReason ?? realError.message },
    );
    throw realError;
  }

  // 동 단위이고 데이터가 없는 경우 → 무투표당선 API 조회
  if (admCd.length === 8 && admNm) {
    const uncontested = await lookupUncandidateDong(electionId, admCd, admNm);
    if (uncontested) return uncontested;
  }

  const noDataError = new ElectionLookupError('NO_DATA', '선거 데이터 없음', {
    sourceType: 'mock',
    fallbackReason: `no safe fallback for ${electionId}`,
    matchedRegionCode: admCd,
    matchedRegionName: admNm,
    recordCount: 0,
  });
  logElectionDecision(context, noDataError.debugMeta!, {
    data: null,
    mappingSucceeded: false,
    fallbackReason: noDataError.debugMeta?.fallbackReason,
  });
  throw noDataError;
}
