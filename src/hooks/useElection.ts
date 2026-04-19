import { useState, useEffect } from 'react';
import type { ElectionData } from '../types';
import { getElection } from '../services';
import { lookupLocalDistrictAggregated } from '../services/localElectionStatic';
import { applyPartyColors } from '../utils/partyColors';

/**
 * 선거 데이터 훅.
 *
 * localDistrictKey 가 설정되고 electionId 가 해당 선거구 유형(회차+basic|council)과
 * 일치하는 경우, 동별 득표를 선거구 단위로 집계한 결과를 반환한다.
 * 그 외에는 기존 단일 동 조회 경로(getElection)를 사용한다.
 *
 * @param localDistrictKey "8_basic_서울_강서구나선거구" 형식
 */
export function useElection(
  admCd: string | null,
  electionId?: string,
  admNm?: string,
  localDistrictKey?: string | null,
) {
  const [data, setData] = useState<ElectionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admCd || electionId?.startsWith('local_9_')) return;

    // 선거구 집계 조건:
    // 1. localDistrictKey가 있고
    // 2. electionId가 local_(숫자)_(basic|council)_district 형식이며
    // 3. electionId의 회차·유형이 localDistrictKey와 일치할 때
    const eidMatch = electionId?.match(/^local_(\d+)_(basic|council)_district$/);
    const ldkParts = localDistrictKey?.split('_');
    const shouldAggregate =
      !!localDistrictKey &&
      !!eidMatch &&
      ldkParts?.[0] === eidMatch[1] &&   // 회차 일치 (예: "8")
      ldkParts?.[1] === eidMatch[2];     // 유형 일치 (예: "basic")

    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError(null);
        if (shouldAggregate) {
          return lookupLocalDistrictAggregated(electionId!, localDistrictKey!, admCd)
            .then((result) =>
              result
                ? applyPartyColors(result)
                : getElection(admCd, electionId, admNm)  // 데이터 없으면 단일 동 조회로 fallback
            );
        }
        return getElection(admCd, electionId, admNm);
      })
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [admCd, electionId, admNm, localDistrictKey]);

  return { data, loading, error };
}
