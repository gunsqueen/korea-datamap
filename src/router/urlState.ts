import type {
  AdminArea,
  AdminLevel,
  ElectionHint,
  ElectionType,
  NavItem,
  PanelTab,
} from '../types';

export interface PageState {
  navStack: NavItem[];
  selectedArea: AdminArea | null;
  activeTab: PanelTab;
  activeElectionId: string | null;
  assemblyDistrictKey: string | null;
  localDistrictKey: string | null;
  electionHint: ElectionHint | null;
}

export interface SerializedUrl {
  pathname: string;
  search: string;
}

const SIDO_NAMES: Record<string, string> = {
  '11': '서울특별시',
  '21': '부산광역시',
  '22': '대구광역시',
  '23': '인천광역시',
  '24': '광주광역시',
  '25': '대전광역시',
  '26': '울산광역시',
  '29': '세종특별자치시',
  '31': '경기도',
  '32': '강원특별자치도',
  '33': '충청북도',
  '34': '충청남도',
  '35': '전북특별자치도',
  '36': '전라남도',
  '37': '경상북도',
  '38': '경상남도',
  '39': '제주특별자치도',
};

export function resolveSidoName(sidoCd: string): string {
  return SIDO_NAMES[sidoCd] ?? sidoCd;
}

function base64UrlEncode(input: string): string {
  if (typeof btoa === 'undefined') return input;
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(input: string): string | null {
  if (typeof atob === 'undefined') return null;
  try {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 ? 4 - (padded.length % 4) : 0;
    return decodeURIComponent(escape(atob(padded + '='.repeat(pad))));
  } catch {
    return null;
  }
}

export function encodeElectionHint(hint: ElectionHint): string {
  return base64UrlEncode(JSON.stringify({ v: 1, ...hint }));
}

export function decodeElectionHint(raw: string | null): ElectionHint | null {
  if (!raw) return null;
  const decoded = base64UrlDecode(raw);
  if (!decoded) return null;
  try {
    const parsed = JSON.parse(decoded) as { v?: number } & Partial<ElectionHint>;
    if (parsed.v !== 1 || !parsed.type) return null;
    const validTypes: ElectionType[] = ['presidential', 'assembly', 'local'];
    if (!validTypes.includes(parsed.type)) return null;
    return {
      type: parsed.type,
      presidentialId: parsed.presidentialId,
      assemblySuffix: parsed.assemblySuffix,
      assemblySubType: parsed.assemblySubType,
      localPrefix: parsed.localPrefix,
      localSubType: parsed.localSubType,
    };
  } catch {
    return null;
  }
}

export function serializePageState(state: PageState): SerializedUrl {
  const parts = state.navStack.map((item) => encodeURIComponent(item.adm_cd));
  const pathname = parts.length === 0 ? '/' : `/r/${parts.join('/')}`;

  const params = new URLSearchParams();

  if (state.selectedArea) {
    const isLeafSameAsPath =
      state.navStack.length > 0 &&
      state.navStack[state.navStack.length - 1].adm_cd === state.selectedArea.adm_cd;
    if (!isLeafSameAsPath) {
      params.set('sel', state.selectedArea.adm_cd);
    }
  }

  if (state.activeTab && state.activeTab !== 'population') {
    params.set('tab', state.activeTab);
  }

  if (state.activeElectionId) {
    params.set('election', state.activeElectionId);
  }

  if (state.assemblyDistrictKey) {
    params.set('ad', state.assemblyDistrictKey);
  }

  if (state.localDistrictKey) {
    params.set('ld', state.localDistrictKey);
  }

  if (state.electionHint && state.electionHint.type === 'presidential') {
    params.set('hint', encodeElectionHint(state.electionHint));
  }

  const search = params.toString();
  return { pathname, search: search ? `?${search}` : '' };
}

interface ParseContext {
  sidoCd?: string;
  sigunguCd?: string;
}

export interface ParsedPageState extends PageState {
  selectedAreaLevel: AdminLevel | null;
}

export function parsePageState(
  ctx: ParseContext,
  searchParams: URLSearchParams,
): ParsedPageState {
  const navStack: NavItem[] = [];

  if (ctx.sidoCd) {
    navStack.push({
      adm_cd: ctx.sidoCd,
      adm_nm: resolveSidoName(ctx.sidoCd),
      level: 'sido',
    });
  }

  if (ctx.sigunguCd) {
    navStack.push({
      adm_cd: ctx.sigunguCd,
      adm_nm: ctx.sigunguCd,
      level: 'sigungu',
    });
  }

  const tabRaw = searchParams.get('tab');
  const activeTab: PanelTab = tabRaw === 'election' ? 'election' : 'population';

  const selRaw = searchParams.get('sel');
  let selectedArea: AdminArea | null = null;
  let selectedAreaLevel: AdminLevel | null = null;

  if (selRaw) {
    const len = selRaw.length;
    let level: AdminLevel;
    if (len <= 2) level = 'sido';
    else if (len <= 5) level = 'sigungu';
    else level = 'eupmyeondong';

    selectedArea = {
      adm_cd: selRaw,
      adm_nm: selRaw,
      level,
    };
    selectedAreaLevel = level;
  } else if (navStack.length > 0) {
    const leaf = navStack[navStack.length - 1];
    selectedArea = {
      adm_cd: leaf.adm_cd,
      adm_nm: leaf.adm_nm,
      level: leaf.level,
    };
    selectedAreaLevel = leaf.level;
  }

  const assemblyDistrictKey = searchParams.get('ad');
  const localDistrictKey = searchParams.get('ld');
  let electionHint = decodeElectionHint(searchParams.get('hint'));

  // 수동 URL 진입 등으로 hint가 누락된 경우 ad/ld에서 최소 힌트 파생
  if (!electionHint && assemblyDistrictKey) {
    const gen = assemblyDistrictKey.split('_')[0];
    if (/^\d+$/.test(gen)) {
      electionHint = {
        type: 'assembly',
        assemblySuffix: gen,
        assemblySubType: 'district',
      };
    }
  } else if (!electionHint && localDistrictKey) {
    const parts = localDistrictKey.split('_');
    const num = parts[0];
    const subType = parts[1] === 'basic' ? 'basic_district' : 'council_district';
    if (/^\d+$/.test(num)) {
      electionHint = {
        type: 'local',
        localPrefix: `local_${num}`,
        localSubType: subType,
      };
    }
  }

  return {
    navStack,
    selectedArea,
    selectedAreaLevel,
    activeTab,
    activeElectionId: searchParams.get('election'),
    assemblyDistrictKey,
    localDistrictKey,
    electionHint,
  };
}

export function buildShareUrl(state: PageState, origin?: string): string {
  const { pathname, search } = serializePageState(state);
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${pathname}${search}`;
}

export function pageStateEqualsUrl(
  state: PageState,
  currentPathname: string,
  currentSearch: string,
): boolean {
  const { pathname, search } = serializePageState(state);
  const normalizedCurrent = currentSearch.startsWith('?')
    ? currentSearch
    : currentSearch
      ? `?${currentSearch}`
      : '';
  return pathname === currentPathname && search === normalizedCurrent;
}
