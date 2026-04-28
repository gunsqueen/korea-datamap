import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { MapPin, ChevronLeft, Search, Info, Sun, Moon, Users, Vote, MapPinned } from 'lucide-react';
import type { AdminArea, AdminLevel, NavItem, PanelTab, ElectionHint } from './types';
import { useBoundary } from './hooks/useBoundary';
import { useTheme } from './hooks/useTheme';
import { useChoropleth } from './hooks/useChoropleth';
import { useRegionHistory } from './hooks/useRegionHistory';
import { useCandidateAlertMonitor } from './hooks/useCandidateAlertMonitor';
import { useUrlSync } from './hooks/useUrlSync';
import { ShareButton } from './components/Share/ShareButton';
import { KoreaMap } from './components/Map/KoreaMap';
import type { DistrictColorEntry } from './components/Map/KoreaMap';
import { Breadcrumb } from './components/Map/Breadcrumb';
import { DataPanel } from './components/Panel/DataPanel';
import { SearchBar } from './components/Search/SearchBar';
import type { SearchResult } from './components/Search/SearchBar';
import { AboutModal } from './components/About/AboutModal';
import { DisclaimerModal } from './components/Disclaimer/DisclaimerModal';
import assemblyEmdMapping from './data/static/assembly_district_emd_mapping.json';
import { findLocalCouncilDistrictByAdmCd, getLocalCouncilDistrictCodes, getLocalCouncilSeatCount, type LocalCouncilKind } from './services/localCouncilMapping';
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

const DISTRICT_COLORS = [
  '#8b5cf6',
  '#38bdf8',
  '#f97316',
  '#22c55e',
  '#ec4899',
  '#eab308',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
  '#f59e0b',
  '#06b6d4',
];

function getDistrictColor(index: number) {
  return DISTRICT_COLORS[index % DISTRICT_COLORS.length];
}

function parseLocalCouncilDistrictElection(electionId: string | null): { generation: string; kind: LocalCouncilKind } | null {
  const match = electionId?.match(/^local_(\d+)_(basic|council)_district$/);
  if (!match) return null;
  return { generation: match[1], kind: match[2] as LocalCouncilKind };
}

/**
 * districtKey에서 선거구 레이블 추출
 * "서울_강서구가선거구" → "가선거구"
 * "서울_종로구제1선거구" → "제1선거구"
 * 시군구명(구/시/군으로 끝나는 접두어) 제거 후 선거구 부분만 반환
 */
function formatLocalDistrictLabel(districtKey: string) {
  // districtKey 형식: "시도_시군구명선거구명" (e.g. "서울_강서구가선거구")
  const withoutSido = districtKey.split('_').slice(1).join('_') || districtKey;
  // 시군구명 제거: 구/시/군으로 끝나는 접두어 탐지
  const match = withoutSido.match(/^.+?[구시군읍면](.+)$/);
  return match ? match[1] : withoutSido;
}

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { addRecent } = useRegionHistory();
  useCandidateAlertMonitor();
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
  const [assemblyDistrictKey, setAssemblyDistrictKey] = useState<string | null>(null);
  // 지방의원(기초/광역) 선거구 하이라이트용: "8_basic_서울_강서구나선거구" 형식
  const [localDistrictKey, setLocalDistrictKey] = useState<string | null>(null);
  // 후보자 선택 시 ElectionPanel 자동 전환용 힌트 (대선·총선·지방선거 통합)
  const [electionHint, setElectionHint] = useState<ElectionHint | null>(null);
  // 코로플레스: 현재 ElectionPanel에서 선택된 선거 ID
  const [activeElectionId, setActiveElectionId] = useState<string | null>(null);

  // URL ↔ 상태 양방향 동기화 (공유·딥링크·뒤로가기 지원)
  useUrlSync({
    navStack,
    selectedArea,
    activeTab,
    activeElectionId,
    assemblyDistrictKey,
    localDistrictKey,
    electionHint,
    setNavStack,
    setSelectedArea,
    setActiveTab,
    setActiveElectionId,
    setAssemblyDistrictKey,
    setLocalDistrictKey,
    setElectionHint,
  });

  // 모바일 바텀시트 스냅 포인트: 'collapsed' (12%) | 'mid' (55%) | 'expanded' (92%)
  type SheetSnap = 'collapsed' | 'mid' | 'expanded';
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('mid');
  const sheetDragRef = useRef<{
    startY: number;
    startSnap: SheetSnap;
    currentDelta: number;
    dragging: boolean;
  } | null>(null);
  const sheetEl = useRef<HTMLElement | null>(null);

  const handleMapClick = useCallback((area: AdminArea) => {
    const nextLevel = NEXT_LEVEL[currentLevel];
    setAssemblyDistrictKey(null);
    setLocalDistrictKey(null);
    setElectionHint(null);
    if (nextLevel) {
      setNavStack((prev) => [...prev, { adm_cd: area.adm_cd, adm_nm: area.adm_nm, level: currentLevel }]);
      setSelectedArea(area);
    } else {
      setSelectedArea(area);
    }
    // 최근 방문에 기록 (시도/시군구/읍면동 모두 추적)
    const sidoEntry = navStack[0];
    const sigunguEntry = navStack[1];
    addRecent({
      adm_cd: area.adm_cd,
      adm_nm: area.adm_nm,
      level: currentLevel,
      sido_cd: sidoEntry?.adm_cd ?? null,
      sido_nm: sidoEntry?.adm_nm ?? null,
      sigungu_cd: sigunguEntry?.adm_cd ?? null,
      sigungu_nm: sigunguEntry?.adm_nm ?? null,
    });
    // 동 선택 시 모바일에서 바텀시트를 mid로 스냅
    setSheetSnap('mid');
  }, [currentLevel, navStack, addRecent]);

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
    setAssemblyDistrictKey(null);
    setLocalDistrictKey(null);
    setElectionHint(null);
  }, []);

  /** 검색 결과 선택 시 해당 레벨로 직접 이동 */
  const handleSearchSelect = useCallback((result: SearchResult) => {
    const isCandidateResult = !!result.candidate;
    const isElectionShortcut = !!result.electionHint || !!result.assemblyDistrictKey || !!result.localDistrictKey;
    const displayName = result.searchLabel ?? result.adm_nm;

    // 후보/선거 바로가기가 아닌 순수 지역 검색만 recent에 기록
    if (!isCandidateResult && !isElectionShortcut) {
      addRecent({
        adm_cd: result.adm_cd,
        adm_nm: result.adm_nm,
        level: result.level,
        sido_cd: result.sido_cd,
        sido_nm: result.sido_nm,
        sigungu_cd: result.sigungu_cd,
        sigungu_nm: result.sigungu_nm,
      });
    }

    setAssemblyDistrictKey(result.assemblyDistrictKey ?? null);
    setLocalDistrictKey(result.localDistrictKey ?? null);
    setElectionHint(isElectionShortcut ? (result.electionHint ?? null) : null);
    if (isElectionShortcut) {
      setActiveTab('election');
    }

    if (result.level === 'sido') {
      setNavStack([]);
      setSelectedArea({ adm_cd: result.adm_cd, adm_nm: displayName, level: 'sido' });
    } else if (result.level === 'sigungu') {
      const sidoEntry: NavItem = {
        adm_cd: result.sido_cd!,
        adm_nm: result.sido_nm!,
        level: 'sido',
      };
      setNavStack([sidoEntry]);
      setSelectedArea({ adm_cd: result.adm_cd, adm_nm: displayName, level: 'sigungu' });
    } else if (result.level === 'eupmyeondong') {
      // 읍면동 선택: sido + sigungu를 navStack에 추가 후 읍면동 선택
      const sidoEntry: NavItem = {
        adm_cd: result.sido_cd!,
        adm_nm: result.sido_nm!,
        level: 'sido',
      };
      const sigunguEntry: NavItem = {
        adm_cd: result.sigungu_cd!,
        adm_nm: result.sigungu_nm!,
        level: 'sigungu',
      };
      setNavStack([sidoEntry, sigunguEntry]);

      if (result.assemblyDistrictKey) {
        const sigunguShortNm = result.searchLabel ?? result.sigungu_nm?.split(' ').pop() ?? result.sigungu_nm ?? '';
        setSelectedArea({
          adm_cd: result.sigungu_cd!,
          adm_nm: sigunguShortNm,
          level: 'sigungu',
        });
      } else {
        setSelectedArea({ adm_cd: result.adm_cd, adm_nm: displayName, level: 'eupmyeondong' });
      }
    }
    setMobileSearchOpen(false);
  }, [addRecent]);


  const displayArea = hoveredArea ?? selectedArea;
  const panelHasContent = selectedArea !== null;

  // 선거구 하이라이트: 국회의원 또는 지방의원 선거구 키 → 읍면동 코드 Set
  const highlightedEmdCodes = useMemo(() => {
    if (assemblyDistrictKey) {
      // "22_서울_강서갑" 형식
      const [gen, ...rest] = assemblyDistrictKey.split('_');
      const districtKey = rest.join('_');
      const mapping = (assemblyEmdMapping as Record<string, Record<string, string[]>>)[gen];
      const codes = mapping?.[districtKey];
      return codes ? new Set(codes) : undefined;
    }
    if (localDistrictKey) {
      // "8_basic_서울_강서구나선거구" 형식
      // local_council_emd_mapping.json 구조: { "8": { "basic": { "서울_강서구나선거구": [...] } } }
      const parts = localDistrictKey.split('_');
      const num = parts[0];         // "8" or "9"
      const type = parts[1] as LocalCouncilKind; // "basic" or "council"
      const districtKey = parts.slice(2).join('_');  // "서울_강서구나선거구"
      const codes = getLocalCouncilDistrictCodes(num, type, districtKey);
      return codes.length ? new Set(codes) : undefined;
    }
    return undefined;
  }, [assemblyDistrictKey, localDistrictKey]);

  // 선거구 색상 구분은 선거 탭에서만 적용한다.
  // - 인구 탭: 행정구역 기본 지도 유지
  // - 선거 탭 + 9회 구/시의원 지역구 선택 또는 선거 미선택: 선거구별 색상 그룹 채색
  // - 6/7/8회 및 다른 선거(대선·총선·교육감 등): districtColorMap = null → choropleth 활성
  const localDistrictElection = useMemo<{ generation: string; kind: LocalCouncilKind } | null>(() => {
    if (activeTab !== 'election') return null;
    const selected = parseLocalCouncilDistrictElection(activeElectionId);
    if (selected) return selected.generation === '9' ? selected : null;
    // 활성 선거가 있지만 지역구 선거가 아님 (대선·총선·교육감 등) → choropleth로 전환
    if (activeElectionId) return null;
    // 선거 미선택(기본 상태): 9회 기초의원 지역구로 자동 채색
    return { generation: '9', kind: 'basic' };
  }, [activeElectionId, activeTab]);

  const districtColorMap = useMemo(() => {
    if (currentLevel !== 'eupmyeondong' || !geoData || !localDistrictElection) {
      return undefined;
    }

    const districtOrder = new Map<string, number>();
    const result = new Map<string, DistrictColorEntry>();

    geoData.features.forEach((feature) => {
      const admCd = feature.properties.adm_cd;
      const match = findLocalCouncilDistrictByAdmCd(
        admCd,
        localDistrictElection.generation,
        localDistrictElection.kind,
      );
      if (!match) return;

      if (!districtOrder.has(match.districtKey)) {
        districtOrder.set(match.districtKey, districtOrder.size);
      }
      const colorIndex = districtOrder.get(match.districtKey)!;
      result.set(admCd, {
        color: getDistrictColor(colorIndex),
        districtKey: match.districtKey,
        label: formatLocalDistrictLabel(match.districtKey),
      });
    });

    return result.size ? result : undefined;
  }, [currentLevel, geoData, localDistrictElection]);

  // ── 코로플레스 채색: 선거 탭 + electionId 선택 + 토글 on ───
  const choroplethActive =
    activeTab === 'election' &&
    !!activeElectionId &&
    !activeElectionId.startsWith('local_9_') &&
    panelHasContent &&
    !districtColorMap;
  const { map: choroplethMap } =
    useChoropleth(
      choroplethActive ? activeElectionId : null,
      geoData?.features ?? [],
      choroplethActive,
    );

  // 스냅 변경 시 인라인 높이/transition 리셋 (드래그 종료 후 CSS 클래스가 책임지도록)
  useEffect(() => {
    if (sheetEl.current) {
      sheetEl.current.style.height = '';
      sheetEl.current.style.transition = '';
    }
  }, [sheetSnap]);

  // 뷰포트 크기 추적 (반응형 bottomInset 계산용)
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // 모바일에서 바텀시트가 가리는 px 높이 — 지도 중앙 보정용
  const bottomInset = useMemo(() => {
    if (viewport.w > 767) return 0;
    if (!selectedArea) return 0;
    const pct = { collapsed: 0.12, mid: 0.55, expanded: 0.92 }[sheetSnap];
    return Math.round(viewport.h * pct);
  }, [viewport, sheetSnap, selectedArea]);

  // ── 바텀 시트 드래그 핸들러 ─────────────────────
  const snapToHeight: Record<SheetSnap, number> = { collapsed: 0.12, mid: 0.55, expanded: 0.92 };

  // touchend 이후 합성된 click이 snap 사이클을 한 번 더 돌리는 것을 막기 위한 플래그.
  // 드래그가 발생했으면 짧은 시간 동안 click을 무시한다.
  const justDraggedRef = useRef(false);
  // mousedown으로 시작된 드래그 중에 touch 이벤트 추가 fallback으로 onClick이 또 호출되는 것 방지
  const dragSourceRef = useRef<'touch' | 'mouse' | null>(null);

  const handleSheetDragStart = useCallback((clientY: number, source: 'touch' | 'mouse') => {
    dragSourceRef.current = source;
    sheetDragRef.current = {
      startY: clientY,
      startSnap: sheetSnap,
      currentDelta: 0,
      dragging: true,
    };
    if (sheetEl.current) {
      sheetEl.current.style.transition = 'none';
    }
  }, [sheetSnap]);

  const handleSheetDragMove = useCallback((clientY: number) => {
    const drag = sheetDragRef.current;
    if (!drag || !drag.dragging || !sheetEl.current) return;
    const viewportH = window.innerHeight;
    const startHeightPct = snapToHeight[drag.startSnap];
    const startHeightPx = viewportH * startHeightPct;
    const delta = drag.startY - clientY; // 위로 드래그 = delta 양수
    const newHeightPx = Math.max(
      viewportH * 0.08,
      Math.min(viewportH * 0.95, startHeightPx + delta),
    );
    drag.currentDelta = delta;
    sheetEl.current.style.height = `${newHeightPx}px`;
  }, []);

  const handleSheetDragEnd = useCallback(() => {
    const drag = sheetDragRef.current;
    if (!drag || !sheetEl.current) return;
    const viewportH = window.innerHeight;
    const currentHeightPx = sheetEl.current.offsetHeight;
    const currentPct = currentHeightPx / viewportH;

    // 가장 가까운 스냅 포인트 결정
    let nearest: SheetSnap = 'mid';
    let minDist = Infinity;
    (Object.keys(snapToHeight) as SheetSnap[]).forEach((snap) => {
      const dist = Math.abs(snapToHeight[snap] - currentPct);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    });

    // 빠른 플릭(velocity) 보정: 드래그 폭이 50px 이상이면 방향에 따라 이동
    if (Math.abs(drag.currentDelta) > 50) {
      const order: SheetSnap[] = ['collapsed', 'mid', 'expanded'];
      const startIdx = order.indexOf(drag.startSnap);
      if (drag.currentDelta > 0 && startIdx < 2) nearest = order[startIdx + 1];
      else if (drag.currentDelta < 0 && startIdx > 0) nearest = order[startIdx - 1];
    }

    sheetEl.current.style.transition = '';
    sheetEl.current.style.height = '';
    // 의미있는 드래그가 있었으면 이어서 발생하는 click(synthetic) 무시
    if (Math.abs(drag.currentDelta) > 5) {
      justDraggedRef.current = true;
      window.setTimeout(() => { justDraggedRef.current = false; }, 350);
    }
    setSheetSnap(nearest);
    sheetDragRef.current = null;
    dragSourceRef.current = null;
  }, []);

  // 모바일 헤더: 현재 위치명
  const mobileRegionName = navStack.length === 0
    ? '선거지도'
    : navStack[navStack.length - 1].adm_nm;

  return (
    <div className="app">
      <header className="app-header">
        {/* 데스크탑: 로고 + 타이틀 */}
        <div className="header-left">
          <div className="app-logo">
            <MapPin size={18} strokeWidth={2.5} />
          </div>
          <h1 className="app-title">선거<span className="app-title-accent">지도</span></h1>
          <span className="app-subtitle">대한민국 선거 데이터 탐색</span>
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

        {/* 모바일 전용: 테마 토글 버튼 */}
        <button
          className="mobile-theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* 모바일 전용: 공유 버튼 */}
        <ShareButton className="mobile-share-btn" title={mobileRegionName} ariaLabel="URL 공유" />

        {/* 모바일 전용: 앱 정보 버튼 */}
        <button
          className="mobile-info-btn"
          onClick={() => setAboutOpen(true)}
          aria-label="앱 정보"
        >
          <Info size={18} />
        </button>

        {/* 데스크탑: 공유 + 테마 토글 + 앱 정보 버튼 */}
        <div className="header-right">
          <ShareButton className="share-btn" title={mobileRegionName} />
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
          >
            {theme === 'dark' ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
          </button>
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
              theme={theme}
              onSelect={handleMapClick}
              onHover={setHoveredArea}
              highlightedEmdCodes={highlightedEmdCodes}
              districtColorMap={districtColorMap}
              choroplethMap={choroplethActive ? choroplethMap : undefined}
              bottomInset={bottomInset}
            />
          ) : (
            <div className="map-error">지도 데이터를 불러올 수 없습니다.</div>
          )}

          {/* 지도 범례 — 선거구 색상(읍면동 레벨 기본) 또는 코로플레스(선거 선택 시) */}
          {(districtColorMap && districtColorMap.size > 0 && localDistrictElection) ? (
            <div className="choropleth-control">
              <DistrictLegend map={districtColorMap} kind={localDistrictElection.kind} />
            </div>
          ) : (activeTab === 'election' && !!activeElectionId && panelHasContent && choroplethMap.size > 0) && (
            <div className="choropleth-control">
              <ChoroplethLegend map={choroplethMap} />
            </div>
          )}

          {/* 호버 툴팁 (데스크탑) */}
          {hoveredArea && (
            <div className="map-hover-tooltip">
              <strong>{hoveredArea.adm_nm}</strong>
              <span>{hoveredArea.adm_cd}</span>
            </div>
          )}

        </main>

        {/* 사이드 패널 — 데스크탑: 우측 패널 / 모바일: 스와이프 바텀시트 */}
        <aside
          ref={sheetEl}
          className={`side-panel${panelHasContent ? ' panel-open' : ''} sheet-snap-${sheetSnap}`}
          data-sheet-snap={sheetSnap}
        >
          <div
            className="mobile-drag-handle"
            role="button"
            aria-label="패널 높이 조절"
            onTouchStart={(e) => handleSheetDragStart(e.touches[0].clientY, 'touch')}
            onTouchMove={(e) => handleSheetDragMove(e.touches[0].clientY)}
            onTouchEnd={handleSheetDragEnd}
            onTouchCancel={handleSheetDragEnd}
            onMouseDown={(e) => {
              // touch 이벤트로 이미 드래그가 시작된 경우 mousedown 무시 (Android/iOS의 합성 mouse 이벤트 차단)
              if (dragSourceRef.current === 'touch') return;
              handleSheetDragStart(e.clientY, 'mouse');
              const onMove = (ev: MouseEvent) => handleSheetDragMove(ev.clientY);
              const onUp = () => {
                handleSheetDragEnd();
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            onClick={() => {
              // 드래그 직후 합성된 click이라면 snap 사이클을 또 돌리지 않는다
              if (justDraggedRef.current) {
                justDraggedRef.current = false;
                return;
              }
              // 탭 시 스냅 순환: collapsed → mid → expanded → collapsed
              setSheetSnap((prev) =>
                prev === 'collapsed' ? 'mid' : prev === 'mid' ? 'expanded' : 'collapsed'
              );
            }}
          >
            <div className="drag-handle-bar" />
          </div>
          {selectedArea ? (
            <DataPanel
              area={selectedArea}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onClose={handleClosePanel}
              electionHint={electionHint}
              assemblyDistrictKey={assemblyDistrictKey ?? undefined}
              localDistrictKey={localDistrictKey}
              onElectionIdChange={setActiveElectionId}
            />
          ) : (
            <div className="panel-placeholder">
              <div className="intro-hero">
                <div className="intro-logo">
                  <MapPin size={28} strokeWidth={2.4} />
                </div>
                <h1 className="intro-title">대한민국 선거지도</h1>
                <p className="intro-subtitle">전국 행정구역의 인구·선거 데이터를<br />지도로 한눈에 탐색하세요</p>
              </div>

              <div className="intro-features">
                <div className="intro-feature">
                  <span className="intro-feature-icon"><Users size={19} strokeWidth={2.2} /></span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">인구 통계</p>
                    <p className="intro-feature-desc">총 인구, 성별·연령 분포, 세대 구성</p>
                  </div>
                </div>
                <div className="intro-feature">
                  <span className="intro-feature-icon"><Vote size={19} strokeWidth={2.2} /></span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">선거 결과</p>
                    <p className="intro-feature-desc">역대 대선·국선·지방선거 당선인 및 득표율</p>
                  </div>
                </div>
                <div className="intro-feature">
                  <span className="intro-feature-icon"><MapPinned size={19} strokeWidth={2.2} /></span>
                  <div className="intro-feature-body">
                    <p className="intro-feature-title">읍·면·동 단위</p>
                    <p className="intro-feature-desc">시도 → 시군구 → 읍면동 드릴다운 탐색</p>
                  </div>
                </div>
              </div>

              <div className="intro-hint">
                <span className="intro-hint-icon">
                  <MapPinned size={16} strokeWidth={2.2} />
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

/**
 * 코로플레스 범례: 현재 지도에 표시된 정당 색 요약.
 * 화면 내 지역별 1위 정당을 카운트하여 상위 6개 정당만 표시.
 */
function ChoroplethLegend({ map }: { map: Map<string, { color: string; party: string }> }) {
  const counts = new Map<string, { color: string; count: number }>();
  for (const entry of map.values()) {
    const existing = counts.get(entry.party);
    if (existing) existing.count += 1;
    else counts.set(entry.party, { color: entry.color, count: 1 });
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6);

  if (sorted.length === 0) return null;

  return (
    <div className="choropleth-legend">
      {sorted.map(([party, { color, count }]) => (
        <div key={party} className="choropleth-legend-item">
          <span className="choropleth-legend-swatch" style={{ background: color }} />
          <span className="choropleth-legend-party">{party}</span>
          <span className="choropleth-legend-count">{count}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 선거구 범례.
 * 옆 숫자는 8회 지방선거 당선자 수(=기초/광역의원 정수)를 표시.
 */
function DistrictLegend({ map, kind }: { map: Map<string, DistrictColorEntry>; kind: LocalCouncilKind }) {
  const districts = new Map<string, { color: string; label: string; seats: number }>();
  for (const entry of map.values()) {
    if (districts.has(entry.districtKey)) continue;
    const seats = getLocalCouncilSeatCount(kind, entry.districtKey);
    districts.set(entry.districtKey, { color: entry.color, label: entry.label, seats });
  }

  const sorted = Array.from(districts.entries()).sort((a, b) => a[1].label.localeCompare(b[1].label, 'ko'));
  if (sorted.length === 0) return null;

  const seatLabel = kind === 'basic' ? '기초의원 정수' : '광역의원 정수';

  return (
    <div className="choropleth-legend district-legend" title={`${seatLabel} (8회 지방선거 당선자 수 기준)`}>
      {sorted.map(([districtKey, { color, label, seats }]) => (
        <div key={districtKey} className="choropleth-legend-item district-legend-item">
          <span className="choropleth-legend-swatch" style={{ background: color }} />
          <span className="choropleth-legend-party">{label}</span>
          <span className="choropleth-legend-count" title={`${seatLabel}: ${seats}명`}>
            {seats > 0 ? `${seats}명` : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}
