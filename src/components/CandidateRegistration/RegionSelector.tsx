import { useEffect } from 'react';
import { useBoundary } from '../../hooks/useBoundary';
import { SIDO_NAME } from '../../services/necRegion';

interface Props {
  selectedSidoCode: string;
  selectedSigunguCode: string;
  requiresSigungu: boolean;
  lockedDistrictName?: string;
  onChangeSido: (code: string) => void;
  onChangeSigungu: (code: string) => void;
}

const SIDO_OPTIONS = Object.entries(SIDO_NAME);

export function RegionSelector({
  selectedSidoCode,
  selectedSigunguCode,
  requiresSigungu,
  lockedDistrictName,
  onChangeSido,
  onChangeSigungu,
}: Props) {
  const { data: sigunguBoundary } = useBoundary(selectedSidoCode, 'sigungu');
  const sigunguOptions = (sigunguBoundary?.features ?? []).map((feature) => ({
    code: feature.properties.adm_cd,
    name: feature.properties.adm_nm.split(' ').pop() ?? feature.properties.adm_nm,
  }));

  useEffect(() => {
    if (!requiresSigungu) return;
    if (sigunguOptions.length === 0) return;
    if (sigunguOptions.some((option) => option.code === selectedSigunguCode)) return;
    onChangeSigungu(sigunguOptions[0].code);
  }, [requiresSigungu, selectedSigunguCode, sigunguOptions, onChangeSigungu]);

  return (
    <div className="candidate-region-selector">
      <label className="candidate-filter">
        <span>시도</span>
        <select
          value={selectedSidoCode}
          onChange={(event) => onChangeSido(event.target.value)}
          disabled={!!lockedDistrictName}
        >
          {SIDO_OPTIONS.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="candidate-filter">
        <span>{lockedDistrictName ? '선거구' : '시군구'}</span>
        {lockedDistrictName ? (
          <div className="candidate-filter__locked">{lockedDistrictName}</div>
        ) : (
          <select
            value={selectedSigunguCode}
            onChange={(event) => onChangeSigungu(event.target.value)}
            disabled={!requiresSigungu}
          >
            {!requiresSigungu ? (
              <option value="">시도 전체</option>
            ) : (
              sigunguOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))
            )}
          </select>
        )}
      </label>
    </div>
  );
}
