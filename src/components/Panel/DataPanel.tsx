import { X, BarChart2, Vote } from 'lucide-react';
import { useMemo } from 'react';
import type { AdminArea, PanelTab, ElectionHint } from '../../types';
import { usePopulation } from '../../hooks/usePopulation';
import { PopulationPanel } from './PopulationPanel';
import type { CouncilDistrictInfo } from './PopulationPanel';
import { ElectionPanel } from './ElectionPanel';
import { Button } from '../UI/Button';
import { PanelHeader } from '../UI/Panel';
import { Tabs, type TabItem } from '../UI/Tabs';
import assemblyEmdMapping from '../../data/static/assembly_district_emd_mapping.json';
import {
  findLocalCouncilDistrictByAdmCd,
  getLocalCouncilDistrictCodes,
  getLocalCouncilSeatCount,
  type LocalCouncilKind,
} from '../../services/localCouncilMapping';

interface Props {
  area: AdminArea;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  electionHint?: ElectionHint | null;
  assemblyDistrictKey?: string;
  localDistrictKey?: string | null;
  onElectionIdChange?: (electionId: string | null) => void;
}

function PopulationSkeleton() {
  return (
    <div className="skeleton-wrap">
      <div className="skeleton skeleton--full" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton--half" />
        <div className="skeleton skeleton--half" />
        <div className="skeleton skeleton--full" />
      </div>
      <div className="skeleton skeleton--chart" />
      <div className="skeleton skeleton--chart-sm" />
    </div>
  );
}

const PANEL_TABS: TabItem<PanelTab>[] = [
  { value: 'election', label: '선거', icon: <Vote size={14} strokeWidth={2} /> },
  { value: 'population', label: '인구', icon: <BarChart2 size={14} strokeWidth={2} /> },
];

export function DataPanel({ area, activeTab, onTabChange, onClose, electionHint, assemblyDistrictKey, localDistrictKey, onElectionIdChange }: Props) {
  const aggregatedPopulation = useMemo(() => {
    if (localDistrictKey) {
      const parts = localDistrictKey.split('_');
      const num = parts[0];
      const kind = parts[1] as LocalCouncilKind;
      const districtKey = parts.slice(2).join('_');
      const admCds = getLocalCouncilDistrictCodes(num, kind, districtKey);
      if (admCds.length > 0) {
        return { admCds, admNm: area.adm_nm };
      }
    }

    if (assemblyDistrictKey) {
      const [num, ...rest] = assemblyDistrictKey.split('_');
      const districtKey = rest.join('_');
      const mapping = assemblyEmdMapping as Record<string, Record<string, string[]>>;
      const admCds = mapping[num]?.[districtKey] ?? [];
      if (admCds.length > 0) {
        return { admCds, admNm: area.adm_nm };
      }
    }

    return null;
  }, [area.adm_nm, assemblyDistrictKey, localDistrictKey]);

  const { data: popData, loading: popLoading } = usePopulation(area.adm_cd, aggregatedPopulation);

  // ─── 기초의원 대표성 정보 (8자리 읍면동만 자동 도출) ──────────────────────
  // 클릭한 읍면동이 속한 8회 기초의원 선거구 + 정수(당선자 수)를 룩업
  const councilDistrictMatch = useMemo(() => {
    if (area.adm_cd.length !== 8) return null;
    const match = findLocalCouncilDistrictByAdmCd(area.adm_cd, '8', 'basic');
    if (!match || !match.codes.length) return null;
    const seatCount = getLocalCouncilSeatCount('basic', match.districtKey);
    if (seatCount === 0) return null;
    // 시도 부분 제거 → 표시용 라벨 ("서울_강서구나선거구" → "강서구나선거구")
    const sepIndex = match.districtKey.indexOf('_');
    const districtLabel = sepIndex === -1
      ? match.districtKey
      : match.districtKey.slice(sepIndex + 1);
    return {
      districtKey: match.districtKey,
      districtLabel,
      codes: match.codes,
      seatCount,
    };
  }, [area.adm_cd]);

  // 선거구 인구 합산을 위한 별도 usePopulation 호출
  const councilAggregation = useMemo(
    () => councilDistrictMatch
      ? { admCds: councilDistrictMatch.codes, admNm: councilDistrictMatch.districtKey }
      : null,
    [councilDistrictMatch],
  );
  const { data: councilPopData } = usePopulation(
    councilDistrictMatch ? area.adm_cd : null,
    councilAggregation,
  );

  const councilDistrictInfo: CouncilDistrictInfo | null = useMemo(() => {
    if (!councilDistrictMatch || !councilPopData) return null;
    return {
      districtKey: councilDistrictMatch.districtKey,
      districtLabel: councilDistrictMatch.districtLabel,
      seatCount: councilDistrictMatch.seatCount,
      totalPopulation: councilPopData.total_population,
    };
  }, [councilDistrictMatch, councilPopData]);

  return (
    <div className="data-panel">
      <PanelHeader
        title={area.adm_nm}
        meta={<span className="panel-code">{area.adm_cd}</span>}
        actions={
          <Button className="btn-close" variant="ghost" size="icon" onClick={onClose} title="닫기" aria-label="닫기">
            <X size={15} strokeWidth={2} />
          </Button>
        }
      />

      <Tabs className="panel-tabs" items={PANEL_TABS} value={activeTab} onChange={onTabChange} />

      <div className="panel-body">
        {activeTab === 'population' && (
          popLoading
            ? <PopulationSkeleton />
            : popData
              ? <PopulationPanel data={popData} councilDistrict={councilDistrictInfo} />
              : <div className="empty">인구 데이터 없음</div>
        )}
        {activeTab === 'election' && (
          <ElectionPanel
            admCd={area.adm_cd}
            admNm={area.adm_nm}
            electionHint={electionHint}
            assemblyDistrictKey={assemblyDistrictKey}
            localDistrictKey={localDistrictKey}
            onElectionIdChange={onElectionIdChange}
          />
        )}
      </div>
    </div>
  );
}
