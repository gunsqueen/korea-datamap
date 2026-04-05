import { useState, useCallback } from 'react';
import { MapPin, ChevronLeft, Search, Info } from 'lucide-react';
import type { AdminArea, AdminLevel, NavItem, PanelTab } from './types';
import { useBoundary } from './hooks/useBoundary';
import { KoreaMap } from './components/Map/KoreaMap';
import { Breadcrumb } from './components/Map/Breadcrumb';
import { DataPanel } from './components/Panel/DataPanel';
import { SearchBar } from './components/Search/SearchBar';
import type { SearchResult } from './components/Search/SearchBar';
import { AboutModal } from './components/About/AboutModal';
import { DisclaimerModal } from './components/Disclaimer/DisclaimerModal';
import { DisclaimerFooter } from './components/Disclaimer/DisclaimerFooter';
import './App.css';


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
      setSelectedArea(area);
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

  /** 검색 결과 선택 시 해당 레벨로 직접 이동 */
  const handleSearchSelect = useCallback((result: SearchResult) => {
    if (result.level === 'sido') {
      // 시도 선택: navStack 초기화 후 시도로 이동
      setNavStack([]);
      setSelectedArea({ adm_cd: result.adm_cd, adm_nm: result.adm_nm, level: 'sido' });
    } else if (result.level === 'sigungu') {
      // 시군구 선택: sido를 navStack에 추가하고 sigungu 선택
      const sidoEntry: NavItem = {
        adm_cd: result.sido_cd!,
        adm_nm: result.sido_nm!,
        level: 'sido',
      };
      setNavStack([sidoEntry]);
      setSelectedArea({ adm_cd: result.adm_cd, adm_nm: result.adm_nm, level: 'sigungu' });
    }
    setMobileSearchOpen(false);
  }, []);


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
          <SearchBar onSelect={handleSearchSelect} />
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
            <SearchBar autoFocus onSelect={handleSearchSelect} />
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

          {/* 비공식 앱 고정 하단 배너 */}
          <DisclaimerFooter />
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
              <div className="intro-hero">
                <div className="intro-logo">🗺</div>
                <h1 className="intro-title">대한민국 데이터맵</h1>
                <p className="intro-subtitle">전국 행정구역의 인구·선거 데이터를<br />지도로 한눈에 탐색하세요</p>
              </div>

              <div className="intro-features">
                <div className="intro-feature">
                  <span className="intro-feature-icon">👥</span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">인구 통계</p>
                    <p className="intro-feature-desc">총 인구, 성별·연령 분포, 세대 구성</p>
                  </div>
                </div>
                <div className="intro-feature">
                  <span className="intro-feature-icon">🗳</span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">선거 결과</p>
                    <p className="intro-feature-desc">역대 대선·국선·지방선거 당선인 및 득표율</p>
                  </div>
                </div>
                <div className="intro-feature">
                  <span className="intro-feature-icon">📍</span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">읍·면·동 단위</p>
                    <p className="intro-feature-desc">시도 → 시군구 → 읍면동 드릴다운 탐색</p>
                  </div>
                </div>
              </div>

              <div className="intro-hint">
                <span className="intro-hint-icon">
                  {currentLevel === 'sido' ? '👆' : '👆'}
                </span>
                <p>
                  {currentLevel === 'sido'
                    ? '지도에서 시도를 탭해 시작하세요'
                    : '읍·면·동을 탭하면 상세 데이터를 확인할 수 있어요'}
                </p>
              </div>
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

      {/* 최초 실행 시 1회 면책 조항 모달 */}
      <DisclaimerModal />
    </div>
  );
}
