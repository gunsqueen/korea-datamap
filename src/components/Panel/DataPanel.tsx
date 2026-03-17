import type { AdminArea, PanelTab } from '../../types';
import { usePopulation } from '../../hooks/usePopulation';
import { PopulationPanel } from './PopulationPanel';
import { ElectionPanel } from './ElectionPanel';

interface Props {
  area: AdminArea;
  activeTab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
  onCompare: () => void;
}

export function DataPanel({ area, activeTab, onTabChange, onClose, onCompare }: Props) {
  const { data: popData, loading: popLoading } = usePopulation(area.adm_cd);

  return (
    <div className="data-panel">
      <div className="panel-header">
        <div className="panel-title-wrap">
          <h2 className="panel-title">{area.adm_nm}</h2>
          <span className="panel-code">{area.adm_cd}</span>
        </div>
        <div className="panel-actions">
          <button className="btn-compare" onClick={onCompare} title="비교">⇄</button>
          <button className="btn-close" onClick={onClose} title="닫기">✕</button>
        </div>
      </div>

      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'population' ? 'active' : ''}`}
          onClick={() => onTabChange('population')}
        >
          인구
        </button>
        <button
          className={`tab-btn ${activeTab === 'election' ? 'active' : ''}`}
          onClick={() => onTabChange('election')}
        >
          선거
        </button>
      </div>

      <div className="panel-body">
        {activeTab === 'population' && (
          popLoading
            ? <div className="loading">불러오는 중...</div>
            : popData
              ? <PopulationPanel data={popData} />
              : <div className="empty">인구 데이터 없음</div>
        )}
        {activeTab === 'election' && (
          <ElectionPanel admCd={area.adm_cd} admNm={area.adm_nm} />
        )}
      </div>
    </div>
  );
}
