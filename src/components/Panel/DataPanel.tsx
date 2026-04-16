import { X, BarChart2, Vote } from 'lucide-react';
import type { AdminArea, PanelTab, ElectionHint } from '../../types';
import { usePopulation } from '../../hooks/usePopulation';
import { PopulationPanel } from './PopulationPanel';
import { ElectionPanel } from './ElectionPanel';

interface Props {
  area: AdminArea;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  electionHint?: ElectionHint | null;
  assemblyDistrictKey?: string;
  localDistrictKey?: string | null;
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

export function DataPanel({ area, activeTab, onTabChange, onClose, electionHint, assemblyDistrictKey, localDistrictKey }: Props) {
  const { data: popData, loading: popLoading } = usePopulation(area.adm_cd);

  return (
    <div className="data-panel">
      <div className="panel-header">
        <div className="panel-title-wrap">
          <h2 className="panel-title">{area.adm_nm}</h2>
          <span className="panel-code">{area.adm_cd}</span>
        </div>
        <div className="panel-actions">
          <button className="btn-close" onClick={onClose} title="닫기">
            <X size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'population' ? 'active' : ''}`}
          onClick={() => onTabChange('population')}
        >
          <BarChart2 size={14} strokeWidth={2} />
          인구
        </button>
        <button
          className={`tab-btn ${activeTab === 'election' ? 'active' : ''}`}
          onClick={() => onTabChange('election')}
        >
          <Vote size={14} strokeWidth={2} />
          선거
        </button>
      </div>

      <div className="panel-body">
        {activeTab === 'population' && (
          popLoading
            ? <PopulationSkeleton />
            : popData
              ? <PopulationPanel data={popData} />
              : <div className="empty">인구 데이터 없음</div>
        )}
        {activeTab === 'election' && (
          <ElectionPanel
            admCd={area.adm_cd}
            admNm={area.adm_nm}
            electionHint={electionHint}
            assemblyDistrictKey={assemblyDistrictKey}
            localDistrictKey={localDistrictKey}
          />
        )}
      </div>
    </div>
  );
}
