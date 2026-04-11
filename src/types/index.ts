// ───────────────────────────────────────────
// 행정구역 코드 기반 공통 타입
// ───────────────────────────────────────────

/** 행정구역 레벨 */
export type AdminLevel = 'sido' | 'sigungu' | 'eupmyeondong';

/** 데이터 모드 */
export type DataMode = 'real' | 'snapshot' | 'mock';

/** 행정구역 기본 정보 */
export interface AdminArea {
  adm_cd: string;   // 행정구역코드 (11, 11500, 1150059000)
  adm_nm: string;   // 행정구역명
  adm_en?: string;  // 영문명
  level: AdminLevel;
  parent_cd?: string;
  center?: [number, number]; // [lat, lng] WGS84
}

// ───────────────────────────────────────────
// GeoJSON 타입
// ───────────────────────────────────────────

export interface AdminGeoFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: {
    adm_cd: string;
    adm_nm: string;
    addr_en?: string;
    x?: string;
    y?: string;
  };
}

export interface AdminGeoCollection {
  type: 'FeatureCollection';
  features: AdminGeoFeature[];
}

// ───────────────────────────────────────────
// 인구 통계 타입
// ───────────────────────────────────────────

export type PopulationSourceType = 'real' | 'snapshot' | 'file';
export type PopulationFieldStatus = 'real' | 'snapshot' | 'file' | 'estimated' | 'unavailable';

export interface PopulationFieldSource {
  status: PopulationFieldStatus;
  note?: string;
}

export interface PopulationFieldSources {
  total_population: PopulationFieldSource;
  male_population: PopulationFieldSource;
  female_population: PopulationFieldSource;
  total_households: PopulationFieldSource;
  age_distribution: PopulationFieldSource;
  youth_ratio: PopulationFieldSource;
  elderly_ratio: PopulationFieldSource;
  household_structure: PopulationFieldSource;
}

export interface PopulationData {
  adm_cd: string;
  adm_nm: string;
  year: number;
  month: number;
  total_population: number;
  male_population: number;
  female_population: number;
  total_households: number;
  age_groups?: AgeGroup[];
  household_structure?: HouseholdStructure[];
  /** 데이터 출처: 실시간 API 또는 스냅샷 */
  source_type?: PopulationSourceType;
  field_sources?: PopulationFieldSources;
}

export interface AgeGroup {
  age_range: string; // '0-9', '10-19', ...
  male: number;
  female: number;
  total: number;
}

export interface HouseholdStructure {
  members: number;          // 1, 2, 3, 4, 5
  members_label: string;   // '1인', '2인', ..., '5인이상'
  count: number;
  percentage: number;
}

// ───────────────────────────────────────────
// 선거 데이터 타입
// ───────────────────────────────────────────

export type ElectionType = 'presidential' | 'assembly' | 'local';
export type ElectionSourceType = 'real' | 'snapshot' | 'mock';

export interface ElectionDebugMeta {
  sourceType: ElectionSourceType;
  requestUrl?: string;
  statusCode?: string;
  fallbackReason?: string;
  matchedRegionName?: string;
  matchedRegionCode?: string;
  recordCount?: number;
}

export interface ElectionMeta {
  id: string;           // e.g. 'presidential_20'
  type: ElectionType;
  name: string;         // e.g. '제20대 대통령선거'
  short_name: string;   // e.g. '20대 대선'
  date: string;
  year: number;
  sub_type?: string;    // 비례대표 | 시·도지사 etc.
}

export interface ElectionData {
  adm_cd: string;
  adm_nm: string;
  election_type: ElectionType;
  election_name: string;
  election_date: string;
  sub_type?: string;
  total_voters: number;
  total_votes: number;
  valid_votes: number;
  invalid_votes: number;
  turnout_rate: number;
  candidates: Candidate[];
  debug_meta?: ElectionDebugMeta;
  /** 무투표당선 선거구 여부 */
  is_uncontested?: boolean;
  /** 무투표당선 선거구명 */
  uncontested_district?: string;
}

export interface Candidate {
  name: string;
  party: string;
  party_color: string;
  votes: number;
  vote_rate: number;
  rank: number;
  elected?: boolean;
}

// ───────────────────────────────────────────
// UI 상태 타입
// ───────────────────────────────────────────

export type PanelTab = 'population' | 'election';

export interface AppState {
  selectedArea: AdminArea | null;
  hoveredArea: AdminArea | null;
  compareArea: AdminArea | null;
  currentLevel: AdminLevel;
  parentCode: string | null;
  activeTab: PanelTab;
  isComparing: boolean;
}

export interface SearchResult {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
  parent_nm?: string;
  /** 국회의원 선거구 하이라이트용: "22_서울_강서갑" 형식 */
  assemblyDistrictKey?: string;
}

/** 네비게이션 스택 아이템 (드릴다운 히스토리) */
export interface NavItem {
  adm_cd: string;
  adm_nm: string;
  level: AdminLevel;
}
