import type { ElectionData, ElectionMeta } from '../types';
import { fetchNecElection } from './nec';
import { lookupLocalElectionDong } from './localElectionStatic';
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
  local_8_mayor: localData8Mayor as ElectionData[],
  local_8_council_district: localData8CouncilDistrict as ElectionData[],
  local_8_council_pr: localData8CouncilPr as ElectionData[],
  local_8_basic_district: localData8BasicDistrict as ElectionData[],
  local_8_basic_pr: localData8BasicPr as ElectionData[],
  local_7_mayor: localData7Mayor as ElectionData[],
  local_7_council_district: localData7CouncilDistrict as ElectionData[],
  local_7_council_pr: localData7CouncilPr as ElectionData[],
  local_7_basic_district: localData7BasicDistrict as ElectionData[],
  local_7_basic_pr: localData7BasicPr as ElectionData[],
  local_6_mayor: localData6Mayor as ElectionData[],
  local_6_council_district: localData6CouncilDistrict as ElectionData[],
  local_6_council_pr: localData6CouncilPr as ElectionData[],
  local_6_basic_district: localData6BasicDistrict as ElectionData[],
  local_6_basic_pr: localData6BasicPr as ElectionData[],
};

export const ELECTIONS_META: ElectionMeta[] = electionsMeta as ElectionMeta[];

/**
 * admCd 기준으로 선거 결과 조회 (mock fallback).
 */
export function getElectionByCode(admCd: string, electionId: string): ElectionData | null {
  const rows = DATA_BY_ID[electionId];
  if (!rows || rows.length === 0) return null;

  const find = (cd: string) => rows.find((r) => r.adm_cd === cd) ?? null;

  return (
    find(admCd) ??
    find(admCd.slice(0, 5)) ??
    find(admCd.slice(0, 2)) ??
    find('00') ??
    rows[0] ??
    null
  );
}

/**
 * 실제 NEC API 우선 조회 → mock fallback
 */
export async function fetchElectionResult(
  admCd: string,
  electionId = 'presidential_20',
  admNm?: string,
): Promise<ElectionData> {
  // 읍면동(8자리) + admNm → 정적 데이터 우선 조회 (지방선거 + 대통령선거)
  if (admCd.length === 8 && admNm && (electionId.startsWith('local_') || electionId.startsWith('presidential_') || electionId.startsWith('assembly_'))) {
    try {
      const staticResult = await lookupLocalElectionDong(electionId, admCd, admNm);
      if (staticResult) return staticResult;
    } catch (err) {
      console.warn('정적 선거 데이터 조회 실패', err);
    }
  }

  // NEC API 우선 시도 (나머지)
  try {
    return await fetchNecElection(admCd, electionId, admNm);
  } catch (err) {
    console.warn('NEC API 실패 → mock fallback', err);
  }

  // mock fallback
  const result = getElectionByCode(admCd, electionId);
  if (result) return result;
  throw new Error(`선거 데이터 없음: ${electionId} / ${admCd}`);
}
