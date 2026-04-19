import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  AdminArea,
  ElectionHint,
  NavItem,
  PanelTab,
} from '../types';
import {
  parsePageState,
  serializePageState,
  type PageState,
} from '../router/urlState';

interface UseUrlSyncArgs extends PageState {
  setNavStack: (value: NavItem[]) => void;
  setSelectedArea: (value: AdminArea | null) => void;
  setActiveTab: (value: PanelTab) => void;
  setActiveElectionId: (value: string | null) => void;
  setAssemblyDistrictKey: (value: string | null) => void;
  setLocalDistrictKey: (value: string | null) => void;
  setElectionHint: (value: ElectionHint | null) => void;
}

function sameNavStack(a: NavItem[], b: NavItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.adm_cd === b[i].adm_cd && item.level === b[i].level);
}

function sameArea(a: AdminArea | null, b: AdminArea | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.adm_cd === b.adm_cd && a.level === b.level;
}

function sameHint(a: ElectionHint | null, b: ElectionHint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    a.presidentialId === b.presidentialId &&
    a.assemblySuffix === b.assemblySuffix &&
    a.assemblySubType === b.assemblySubType &&
    a.localPrefix === b.localPrefix &&
    a.localSubType === b.localSubType
  );
}

/**
 * App 상태와 URL(path + query)을 양방향 동기화.
 *
 * - URL 변경(뒤로가기/외부 링크 진입) → 상태 setter 호출
 * - 상태 변경(클릭/검색/탭 전환) → URL 갱신
 * - navStack 길이 변화는 push, 그 외는 replace (히스토리 과다 적재 방지)
 */
export function useUrlSync(args: UseUrlSyncArgs): void {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ sidoCd?: string; sigunguCd?: string }>();
  const [searchParams] = useSearchParams();

  const prevNavStackLenRef = useRef<number>(args.navStack.length);
  const writingRef = useRef(false);

  // URL → State
  useEffect(() => {
    if (writingRef.current) {
      writingRef.current = false;
      return;
    }

    const parsed = parsePageState(
      { sidoCd: params.sidoCd, sigunguCd: params.sigunguCd },
      searchParams,
    );

    console.debug('[useUrlSync] URL→State', {
      location: `${location.pathname}${location.search}`,
      parsedNavLen: parsed.navStack.length,
      currentNavLen: args.navStack.length,
      parsedSel: parsed.selectedArea?.adm_cd,
      currentSel: args.selectedArea?.adm_cd,
    });

    if (!sameNavStack(parsed.navStack, args.navStack)) {
      args.setNavStack(parsed.navStack);
    }
    if (!sameArea(parsed.selectedArea, args.selectedArea)) {
      args.setSelectedArea(parsed.selectedArea);
    }
    if (parsed.activeTab !== args.activeTab) {
      args.setActiveTab(parsed.activeTab);
    }
    if (parsed.activeElectionId !== args.activeElectionId) {
      args.setActiveElectionId(parsed.activeElectionId);
    }
    if (parsed.assemblyDistrictKey !== args.assemblyDistrictKey) {
      args.setAssemblyDistrictKey(parsed.assemblyDistrictKey);
    }
    if (parsed.localDistrictKey !== args.localDistrictKey) {
      args.setLocalDistrictKey(parsed.localDistrictKey);
    }
    if (!sameHint(parsed.electionHint, args.electionHint)) {
      args.setElectionHint(parsed.electionHint);
    }

    prevNavStackLenRef.current = parsed.navStack.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  // State → URL
  useEffect(() => {
    const { pathname, search } = serializePageState({
      navStack: args.navStack,
      selectedArea: args.selectedArea,
      activeTab: args.activeTab,
      activeElectionId: args.activeElectionId,
      assemblyDistrictKey: args.assemblyDistrictKey,
      localDistrictKey: args.localDistrictKey,
      electionHint: args.electionHint,
    });

    const currentFull = `${location.pathname}${location.search}`;
    const nextFull = `${pathname}${search}`;

    console.debug('[useUrlSync] State→URL', {
      currentFull,
      nextFull,
      equal: currentFull === nextFull,
      navLen: args.navStack.length,
    });

    if (currentFull === nextFull) return;

    const navStackChanged = args.navStack.length !== prevNavStackLenRef.current;
    const replace = !navStackChanged;

    writingRef.current = true;
    navigate(nextFull, { replace });
    prevNavStackLenRef.current = args.navStack.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    args.navStack,
    args.selectedArea,
    args.activeTab,
    args.activeElectionId,
    args.assemblyDistrictKey,
    args.localDistrictKey,
    args.electionHint,
  ]);
}
