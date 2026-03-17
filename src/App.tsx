import { useState, useCallback } from 'react';
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

// 드릴다운 가능 레벨 순서
const NEXT_LEVEL: Record<AdminLevel, AdminLevel | null> = {
  sido: 'sigungu',
  sigungu: 'eupmyeondong',
  eupmyeondong: null,
};

export default function App() {
  // ─── 네비게이션 스택 (드릴다운 히스토리) ────
  const [navStack, setNavStack] = useState<NavItem[]>([]);

  // ─── 현재 지도 레벨 ─────────────────────────
  const currentLevel: AdminLevel = navStack.length === 0
    ? 'sido'
    : navStack.length === 1
      ? 'sigungu'
      : 'eupmyeondong';

  // 경계 조회용 코드: sido면 '0', 하위면 부모의 adm_cd
  const boundaryCode = navStack.length === 0
    ? '0'
    : navStack[navStack.length - 1].adm_cd;

  const { data: geoData, loading: mapLoading } = useBoundary(boundaryCode, currentLevel);

  // ─── 선택/비교 상태 ──────────────────────────
  const [selectedArea, setSelectedArea] = useState<AdminArea | null>(null);
  const [hoveredArea, setHoveredArea] = useState<AdminArea | null>(null);
  const [compareArea, setCompareArea] = useState<AdminArea | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('population');
  const [isComparing, setIsComparing] = useState(false);

  // ─── 지도 polygon 클릭 핸들러 ────────────────
  const handleMapClick = useCallback((area: AdminArea) => {
    if (isComparing && selectedArea) {
      setCompareArea(area);
      return;
    }

    const nextLevel = NEXT_LEVEL[currentLevel];

    if (nextLevel) {
      // 드릴다운: 스택에 현재 클릭한 지역 push → 하위 레벨로 이동
      setNavStack((prev) => [...prev, { adm_cd: area.adm_cd, adm_nm: area.adm_nm, level: currentLevel }]);
      // 시군구 클릭 시 해당 시군구 데이터도 패널에 표시
      if (currentLevel === 'sigungu') {
        setSelectedArea(area);
      } else {
        setSelectedArea(null);
      }
    } else {
      // 읍면동 레벨: 데이터 패널 열기
      setSelectedArea(area);
    }
  }, [isComparing, selectedArea, currentLevel]);

  // ─── 브레드크럼 클릭: 특정 단계로 되돌아가기 ──
  const handleNavigate = useCallback((index: number) => {
    if (index === -1) {
      // 전국으로
      setNavStack([]);
    } else {
      // index까지만 남기기 (그 위로 pop)
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

  const LEVEL_GUIDE: Record<AdminLevel, string> = {
    sido: '시도를 클릭하면 시군구로 이동합니다',
    sigungu: '읍동을 클릭하면 상세 데이터를 확인합니다',
    eupmyeondong: '읍동을 클릭하면 상세 데이터를 확인합니다',
  };

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        <div className="header-left">
          <h1 className="app-title">🗺 Korea DataMap</h1>
          <span className="app-subtitle">대한민국 행정구역 데이터 탐색</span>
        </div>
        <div className="header-center">
          <SearchBar onSelect={(area) => handleMapClick(area)} />
        </div>
        <div className="header-right">
          <span className="mode-badge">
            {import.meta.env.VITE_DATA_MODE?.toUpperCase() ?? 'MOCK'}
          </span>
        </div>
      </header>

      <div className="app-body">
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

        {/* 사이드 패널 */}
        <aside className="side-panel">
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
                {currentLevel === 'sigungu' && <>읍동을 클릭하면<br />상세 데이터를 확인합니다</>}
                {currentLevel === 'eupmyeondong' && <>읍동을 클릭하면<br />상세 데이터를 확인합니다</>}
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
        <span>레벨: {currentLevel === 'sido' ? '시도' : currentLevel === 'sigungu' ? '시군구' : '읍면동'}</span>
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
