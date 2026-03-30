import { useState, useCallback } from 'react';
import { MapPin, BarChart2, ChevronLeft, Search, Info } from 'lucide-react';
import type { AdminArea, AdminLevel, NavItem, PanelTab } from './types';
import { useBoundary } from './hooks/useBoundary';
import { KoreaMap } from './components/Map/KoreaMap';
import { Breadcrumb } from './components/Map/Breadcrumb';
import { DataPanel } from './components/Panel/DataPanel';
import { SearchBar } from './components/Search/SearchBar';
import { AboutModal } from './components/About/AboutModal';
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
  const [activeTab, setActiveTab] = useState<PanelTab>('population');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const handleMapClick = useCallback((area: AdminArea) => {
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
  }, [currentLevel]);

  const handleNavigate = useCallback((index: number) => {
    if (index === -1) {
      setNavStack([]);
    } else {
      setNavStack((prev) => prev.slice(0, index + 1));
    }
    setSelectedArea(null);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedArea(null);
  }, []);

  const handleMobileSearch = useCallback((area: AdminArea) => {
    handleMapClick(area);
    setMobileSearchOpen(false);
  }, [handleMapClick]);

  const displayArea = hoveredArea ?? selectedArea;
  const panelHasContent = selectedArea !== null;

  // 모바일 헤더: 현재 위치명
  const mobileRegionName = navStack.length === 0
    ? 'Korea DataMap'
    : navStack[navStack.length - 1].adm_nm;

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app-header">
        {/* 데스크탑: 로고 + 타이틀 */}
        <div className="header-left">
          <div className="app-logo">
            <MapPin size={18} strokeWidth={2.5} />
          </div>
          <h1 className="app-title">Korea <span className="app-title-accent">DataMap</span></h1>
          <span className="app-subtitle">대한민국 행정구역 데이터 탐색</span>
        </div>

        {/* 모바일 전용: 뒤로가기 버튼 */}
        {navStack.length > 0 && (
          <button
            className="mobile-header-back"
            onClick={() => handleNavigate(navStack.length - 2)}
            aria-label="뒤로가기"
          >
            <ChevronLeft size={20} strokeWidth={2.5} />
          </button>
        )}

        {/* 모바일 전용: 현재 지역명 */}
        <div className="mobile-region-title">
          {mobileRegionName}
        </div>

        {/* 데스크탑: 검색바 */}
        <div className="header-center">
          <SearchBar onSelect={(area) => handleMapClick(area)} />
        </div>

        {/* 모바일 전용: 검색 아이콘 버튼 */}
        <button
          className="mobile-search-toggle"
          onClick={() => setMobileSearchOpen(true)}
          aria-label="검색"
        >
          <Search size={18} />
        </button>

        {/* 데스크탑: 뱃지 + 앱 정보 버튼 */}
        <div className="header-right">
          <div className="header-level-badge">
            <BarChart2 size={13} strokeWidth={2} />
            <span>{LEVEL_LABEL[currentLevel]}</span>
          </div>
          <span className="mode-badge">
            {import.meta.env.VITE_DATA_MODE?.toUpperCase() ?? 'MOCK'}
          </span>
          <button
            className="about-btn"
            onClick={() => setAboutOpen(true)}
            aria-label="앱 정보"
            title="앱 정보 및 데이터 출처"
          >
            <Info size={16} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* 모바일 전용: 전체화면 검색 오버레이 */}
      {mobileSearchOpen && (
        <div className="mobile-search-overlay" onClick={(e) => { if (e.target === e.currentTarget) setMobileSearchOpen(false); }}>
          <div className="mobile-search-inner">
            <SearchBar autoFocus onSelect={handleMobileSearch} />
            <button className="mobile-search-cancel" onClick={() => setMobileSearchOpen(false)}>
              취소
            </button>
          </div>
        </div>
      )}

      <div className="app-body">
        {/* 지도 영역 */}
        <main className="map-container">
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

          {/* 호버 툴팁 (데스크탑) */}
          {hoveredArea && (
            <div className="map-hover-tooltip">
              <strong>{hoveredArea.adm_nm}</strong>
              <span>{hoveredArea.adm_cd}</span>
            </div>
          )}
        </main>

        {/* 사이드 패널 — 데스크탑: 우측 패널 / 모바일: 지도 아래 카드 영역 */}
        <aside className={`side-panel${panelHasContent ? ' panel-open' : ''}`}>
          <div className="mobile-drag-handle" onClick={handleClosePanel} role="button" aria-label="패널 닫기" />
          {selectedArea ? (
            <DataPanel
              area={selectedArea}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={handleClosePanel}
            />
          ) : (
            <div className="panel-placeholder">
              <div className="placeholder-icon">🗺</div>
              <div className="placeholder-text">
                <p className="placeholder-title">지역을 선택하세요</p>
                <p className="placeholder-desc">
                  {currentLevel === 'sido' && <>시도를 탭하면 시군구로 이동합니다</>}
                  {currentLevel !== 'sido' && <>읍·동을 탭하면 상세 데이터를 확인합니다</>}
                </p>
              </div>
              {navStack.length === 0 && (
                <div className="placeholder-legend desktop-only">
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

      {/* 상태바 (데스크탑) */}
      <div className="status-bar">
        <span>레벨: {LEVEL_LABEL[currentLevel]}</span>
        {displayArea && (
          <>
            <span>선택: {displayArea.adm_nm}</span>
            <span>코드: {displayArea.adm_cd}</span>
          </>
        )}
      </div>

      {/* 앱 정보 모달 */}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
