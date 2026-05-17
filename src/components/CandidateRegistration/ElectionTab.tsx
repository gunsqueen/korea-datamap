import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CandidateList } from './CandidateList';
import { RegionSelector } from './RegionSelector';
import { getDefaultCandidateRegion, type LocalCandidateElectionId } from '../../services/candidateRegistration';
import { SIDO_NAME, getSigunguNameByCode } from '../../services/necRegion';
import { useCandidateRegistrationQuery } from '../../stores/candidateRegistrationStore';

interface Props {
  admCd: string;
  electionId: LocalCandidateElectionId;
}

export function ElectionTab({ admCd, electionId }: Props) {
  const defaults = useMemo(() => getDefaultCandidateRegion(admCd, electionId), [admCd, electionId]);
  const requiresDistrictMapping = electionId === 'local_9_council_district' || electionId === 'local_9_basic_district';
  const [selectedSidoCode, setSelectedSidoCode] = useState(defaults.selectedSidoCode);
  const [selectedSigunguCode, setSelectedSigunguCode] = useState(
    defaults.requiresSigungu ? defaults.selectedSigunguCode : '',
  );

  // 시군구(5자리) admCd + 광역의원/기초의원: 정확한 선거구 매핑이 없어도
  // 시군구 단위로 후보 전체를 조회한다(서비스에서 시도 전체 fetch 후 시군구명 prefix로 필터).
  const isSigunguLevel = admCd.length === 5;
  const canQuery = requiresDistrictMapping
    ? !!defaults.districtName || isSigunguLevel
    : !defaults.requiresSigungu || !!selectedSigunguCode;
  const lockedToDistrict = !!defaults.districtName;
  const selectedAdmCd = requiresDistrictMapping
    ? admCd
    : lockedToDistrict
      ? admCd
      : defaults.requiresSigungu
        ? selectedSigunguCode
        : selectedSidoCode;
  const selectedSdName = SIDO_NAME[selectedSidoCode] ?? defaults.sdName;
  const selectedSggName = requiresDistrictMapping
    ? // 5자리 시군구 레벨에서는 sggName(선거구명) 추측이 불가하므로 비워서 서비스의 시군구 fallback 분기로 보낸다.
      defaults.districtName ?? undefined
    : lockedToDistrict
      ? defaults.districtName
      : defaults.requiresSigungu
        ? getSigunguNameByCode(selectedAdmCd) || defaults.sggName
        : undefined;

  const { data, loading, error, refetch } = useCandidateRegistrationQuery({
    admCd: selectedAdmCd || (lockedToDistrict ? admCd : defaults.selectedSigunguCode),
    electionId,
    sdName: selectedSdName,
    sggName: selectedSggName,
  });

  useEffect(() => {
    if (!canQuery) return;
    void refetch();
  }, [canQuery, refetch]);

  const registeredCount = data?.candidates.filter((candidate) => candidate.status === '등록').length ?? 0;
  const visibleCandidates = data?.candidates.filter((candidate) => candidate.status === '등록') ?? [];

  return (
    <div className="candidate-registration-tab">
      <div className="election-result-header">
        <h3 className="panel-subtitle">
          제9회 지방선거 후보자 등록 현황
          <span className="panel-date">2026.06.03</span>
        </h3>
        <span className="election-sub-badge">{data?.sub_type ?? '후보자 등록 현황'}</span>
      </div>

      <RegionSelector
        selectedSidoCode={selectedSidoCode}
        selectedSigunguCode={selectedSigunguCode}
        requiresSigungu={defaults.requiresSigungu}
        lockedDistrictName={defaults.districtName}
        onChangeSido={(code) => {
          setSelectedSidoCode(code);
          if (!defaults.requiresSigungu) {
            setSelectedSigunguCode('');
          } else {
            setSelectedSigunguCode('');
          }
        }}
        onChangeSigungu={setSelectedSigunguCode}
      />

      {data && (
        <div className="election-stats-grid candidate-stats-grid">
          <div className="estat-item">
            <span className="estat-label">조회 범위</span>
            <span className="estat-value">{data.adm_nm}</span>
          </div>
          <div className="estat-item">
            <span className="estat-label">전체 후보</span>
            <span className="estat-value">{data.total_count.toLocaleString('ko-KR')}명</span>
          </div>
          <div className="estat-item">
            <span className="estat-label">등록 완료</span>
            <span className="estat-value highlight">{registeredCount.toLocaleString('ko-KR')}명</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : error ? (
        <div className="empty">데이터를 불러오지 못했습니다</div>
      ) : (
        <CandidateList candidates={visibleCandidates} />
      )}

      <div className="panel-source-links">
        <span className="panel-source-links-label">공식 출처</span>
        <a href="https://info.nec.go.kr/" target="_blank" rel="noopener noreferrer" className="panel-source-link">
          info.nec.go.kr <ExternalLink size={10} />
        </a>
        <a href="https://www.data.go.kr/data/15000908/openapi.do" target="_blank" rel="noopener noreferrer" className="panel-source-link">
          data.go.kr <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
