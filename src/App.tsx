import { useState, useCallback } from 'react';
import { MapPin, BarChart2 } from 'lucide-react';
import type { AdminArea, AdminLevel, NavItem, PanelTab } from './types';
import { useBoundary } from './hooks/useBoundary';
import { KoreaMap } from './components/Map/KoreaMap';
import { Breadcrumb } from './components/Map/Breadcrumb';
import { DataPanel } from './components/Panel/DataPanel';
import { ComparePanel } from './components/Compare/ComparePanel';
import { SearchBar } from './components/Search/SearchBar';
import './App.css';

const SIDO_COLORS: Record<string, string> = {
  '11': '#E63946', '21': '#457B9D', '31': '#A8DADC', '39': '#95A3B3',
};

const NEXT_LEVEL: Record<AdminLevel, AdminLevel | null> = {
  sido: 'sigungu',
  sigungu: 'eupmyeondong',
  eupmyeondong: null,
};

const LEVEL_LABEL: Record<AdminLevel, string> = {
  sido: '시도',
  sigungu: '시군구',
  eupmyeondong: '읍면동',
};

const LEVEL_GUIDE: Record<AdminLevel, string> = {
  sido: '시도를 클릭하면 시군구로 이동합니다',
  sigungu: '읍·동을 클릭하면 상세 데이터를 확인합니다',
  eupmyeondong: '읍·동을 클릭하면 상세 데이터를 확인합니다',
};

export default function App() {
  const [navStack, setNavStack] = useState<NavItem[]>([]);

  const currentLevel: AdminLevel = navStack.length === 0
    ? 'sido'
    : navStack.length === 1
      ? 'sigungu'
      : 'eupmyeondong';

  const boundaryCode = navStack.length === 0
    ? '0'
    : navStack[navStack.length - 1].adm_cd;

  const { data: geoData, loading: mapLoading } = useBoundary(boundaryCode, currentLevel);

  const [selectedArea, setSelectedArea] = useState<AdminArea | null>(null);
  const [hoveredArea, setHoveredArea] = useState<AdminArea | null>(null);
  const [compareArea, setCompareArea] = useState<AdminArea | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('population');
  const [isComparing, setIsComparing] = useState(false);

  const handleMapClick = useCallback((area: AdminArea) => {
    if (isComparing && selectedArea) {
      setCompareArea(area);
      return;
    }

    const nextLevel = NEXT_LEVEL[currentLevel];

    if (nextLevel) {
      setNavStack((prev) => [...prev, { adm_cd: area.adm_cd, adm_nm: area.adm_nm, level: currentLevel }]);
      if (currentLevel === 'sigungu') {
        setSelectedArea(area);
      } else {
        setSelectedArea(null);
      }
    } else {
      setSelectedArea(area);
    }
  }, [isComparing, selectedArea, currentLevel]);

  const handleNavigate = useCallback((index: number) => {
    if (index === -1) {
      setNavStack([]);
    } else {
      setNavStack((prev) => prev.slice(0, index + 1));
    }
    setSelectedArea(null);
    setIsComparing(false);
    setCompareArea(null);
  }, []);

  const handleCompare = useCallback(() => {
    setIsComparing(true);
    setCompareArea(null);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedArea(null);
    setIsComparing(false);
    setCompareArea(null);
  }, []);

  const handleCloseCompare = useCallback(() => {
    setIsComparing(false);
    setCompareArea(null);
  }, []);

  const displayArea = hoveredArea ?? selectedArea;
  const panelHasContent = selectedArea !== null;

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <div className="header-left">
          <div className="app-logo">
            <MapPin size={18} strokeWidth={2.5} />
          </div>
          <h1 className="app-title">Korea <span className="app-title-accent">DataMap</span></h1>
          <span className="app-subtitle">대한민국 행정구역 데이터 탐색</span>
        </div>
        <div className="header-center">
          <SearchBar onSelect={(area) => handleMapClick(area)} />
        </div>
        <div className="header-right">
          <div className="header-level-badge">
            <BarChart2 size={13} strokeWidth={2} />
            <span>{LEVEL_LABEL[currentLevel]}</span>
          </div>
          <span className="mode-badge">
            {import.meta.env.VITE_DATA_MODE?.toUpperCase() ?? 'MOCK'}
          </span>
        </div>
      </header>

      <div className="app-body">
        {/* 모바일: 패널 오픈 시 지도 dimming */}
        {panelHasContent && (
          <div className="map-overlay" onClick={handleClosePanel} />
        )}

        {/* 지도 영역 */}
        <main className="map-container">
          {/* 브레드크럼 + 뒤로가기 */}
          <div className="map-breadcrumb-wrap">
            <div className="breadcrumb-row-top">
              {navStack.length > 0 && (
                <button
                  className="btn-back"
                  onClick={() => handleNavigate(navStack.length - 2)}
                >
                  ← {navStack.length === 1 ? '전국' : navStack[navStack.length - 2].adm_nm}
                </button>
              )}
              <Breadcrumb stack={navStack} onNavigate={handleNavigate} />
            </div>
            <span className="level-guide">{LEVEL_GUIDE[currentLevel]}</span>
          </div>

          {mapLoading ? (
            <div className="map-loading">
              <div className="spinner" />
              <p>지도 불러오는 중...</p>
            </div>
          ) : geoData ? (
            <KoreaMap
              geoData={geoData}
              level={currentLevel}
              selectedCode={selectedArea?.adm_cd ?? null}
              onSelect={handleMapClick}
              onHover={setHoveredArea}
            />
          ) : (
            <div className="map-error">지도 데이터를 불러올 수 없습니다.</div>
          )}

          {/* 호버 툴팁 */}
          {hoveredArea && (
            <div className="map-hover-tooltip">
              <strong>{hoveredArea.adm_nm}</strong>
              <span>{hoveredArea.adm_cd}</span>
            </div>
          )}

          {/* 비교 모드 안내 */}
          {isComparing && !compareArea && (
            <div className="compare-hint">
              비교할 지역을 지도에서 클릭하세요
              <button onClick={handleCloseCompare} className="btn-cancel-compare">취소</button>
            </div>
          )}
        </main>

        {/* 사이드 패널 — 데스크탑: 항상 표시 / 모바일: 선택 시 bottom sheet */}
        <aside className={`side-panel${panelHasContent ? ' panel-open' : ''}`}>
          {/* 모바일 드래그 핸들 */}
          <div className="mobile-drag-handle" onClick={handleClosePanel} role="button" aria-label="패널 닫기" />
          {isComparing && selectedArea ? (
            <ComparePanel
              areaA={selectedArea}
              areaB={compareArea}
              onClose={handleCloseCompare}
            />
          ) : selectedArea ? (
            <DataPanel
              area={selectedArea}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={handleClosePanel}
              onCompare={handleCompare}
            />
          ) : (
            <div className="panel-placeholder">
              <div className="placeholder-icon">🗺</div>
              <p className="placeholder-title">지역을 선택하세요</p>
              <p className="placeholder-desc">
                {currentLevel === 'sido' && <>시도를 클릭하면<br />시군구 지도로 이동합니다</>}
                {currentLevel === 'sigungu' && <>읍·동을 클릭하면<br />상세 데이터를 확인합니다</>}
                {currentLevel === 'eupmyeondong' && <>읍·동을 클릭하면<br />상세 데이터를 확인합니다</>}
              </p>
              {navStack.length === 0 && (
                <div className="placeholder-legend">
                  <div className="legend-title">시도 색상 범례</div>
                  {[
                    { code: '11', name: '서울특별시' },
                    { code: '21', name: '부산광역시' },
                    { code: '31', name: '경기도' },
                    { code: '39', name: '제주특별자치도' },
                  ].map(({ code, name }) => (
                    <div key={code} className="legend-item">
                      <span className="legend-dot" style={{ background: SIDO_COLORS[code] ?? '#ccc' }} />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* 상태바 */}
      <div className="status-bar">
        <span>레벨: {LEVEL_LABEL[currentLevel]}</span>
        {displayArea && (
          <>
            <span>선택: {displayArea.adm_nm}</span>
            <span>코드: {displayArea.adm_cd}</span>
          </>
        )}
      </div>
    </div>
  );
}
