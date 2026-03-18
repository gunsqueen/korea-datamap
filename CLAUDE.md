# Korea DataMap — 프로젝트 컨텍스트

대한민국 전국 행정구역을 지도로 탐색하며 인구 통계 + 선거 결과를 확인하는 데이터맵 웹앱.

---

## 기술 스택

| 항목 | 선택 |
|------|------|
| 프레임워크 | React 18 + Vite + TypeScript |
| 지도 | Leaflet + react-leaflet |
| 차트 | Recharts |
| 좌표 변환 | proj4 (UTM-K EPSG:5179 → WGS84) |
| 스타일 | 순수 CSS (App.css) |

---

## 폴더 구조

```
src/
├── types/index.ts           # 공통 TypeScript 타입 (AdminArea, PopulationData, ElectionData...)
├── services/
│   ├── index.ts             # 진입점: real/mock 모드 분기 + fallback 로직
│   ├── sgis.ts              # SGIS 행정경계 API (토큰 캐싱, UTM-K 변환)
│   ├── population.ts        # 행정안전부 인구 API
│   └── election.ts          # 선관위 선거 API
├── data/mock/
│   ├── sido.json            # 시도 경계 GeoJSON (WGS84, 간략화된 polygon)
│   ├── population.json      # 전국 17 시도 인구 데이터 (2024년 6월 기준)
│   └── election.json        # 2022 제8회 지방선거 시도별 결과
├── components/
│   ├── Map/KoreaMap.tsx     # Leaflet 지도 컴포넌트 (polygon 클릭/호버)
│   ├── Panel/DataPanel.tsx  # 선택 지역 데이터 패널 (탭 전환)
│   ├── Panel/PopulationPanel.tsx  # 인구 통계 + 연령 바차트
│   ├── Panel/ElectionPanel.tsx    # 선거 결과 + 파이차트
│   ├── Compare/ComparePanel.tsx   # 두 지역 나란히 비교
│   └── Search/SearchBar.tsx       # 지역명 자동완성 검색
├── hooks/
│   ├── useBoundary.ts       # GeoJSON 경계 데이터 fetch
│   ├── usePopulation.ts     # 인구 데이터 fetch
│   └── useElection.ts       # 선거 데이터 fetch
├── utils/
│   ├── projection.ts        # UTM-K → WGS84 좌표 변환 (proj4)
│   └── adminCode.ts         # 행정코드 유틸 + 시도별 색상 팔레트
├── App.tsx                  # 메인 레이아웃 + 상태 관리
└── App.css                  # 전체 스타일
```

---

## 데이터 모드 (.env)

```env
VITE_DATA_MODE=mock      # mock | real | snapshot
```

| 모드 | 동작 |
|------|------|
| `mock` | 로컬 JSON 파일만 사용 (API 호출 없음) — 기본값 |
| `real` | 실제 API 호출, 실패 시 mock fallback 자동 적용 |
| `snapshot` | 저장된 static JSON fallback (미구현, mock과 동일) |

---

## API 연결 현황

### 1. SGIS 행정경계 API ✅ 연결 완료
- **토큰 엔드포인트**: `https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json`
- **경계 엔드포인트**: `https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson`
- **파라미터**: `adm_cd=0` (전국 시도), `adm_cd=11` (서울 시군구), `year=2024`
- **좌표계**: 응답은 UTM-K(EPSG:5179) → `projection.ts`에서 WGS84로 변환
- **토큰 캐싱**: 메모리에 캐싱, 만료 1분 전 자동 갱신

### 2. 행정안전부 인구 API ⚠️ 필드 매핑 미완성
- **엔드포인트**: `https://jumin.mois.go.kr/opi/statistics/juminPopulation.do`
- **실제 API 응답 구조 확인 필요**: 현재 응답 파싱 필드명(`admNm`, `totPpltn` 등)이 실제 API와 맞지 않을 수 있음
- `real` 모드에서 실패 시 자동으로 mock fallback 적용됨
- **TODO**: 실제 API 응답 JSON 구조 확인 후 `services/population.ts` 필드명 수정

### 3. 선관위 선거 API ⚠️ 엔드포인트 미검증
- **베이스 URL**: `https://open.nec.go.kr/resApiService/rest`
- `real` 모드에서 실패 시 자동으로 mock fallback 적용됨
- **TODO**: 선관위 API 응답 구조 확인 후 `services/election.ts` 파싱 로직 수정

---

## 행정구역 코드 체계

```
시도 (2자리)       11 → 서울특별시
시군구 (5자리)  11500 → 강서구
읍면동 (8자리)  11500590 → 화곡3동
```

SGIS API에서는:
- `adm_cd=0` → 전국 17개 시도
- `adm_cd=11` → 서울 시군구 (25개)
- `adm_cd=11500` → 강서구 읍면동

---

## 미구현 / TODO

1. **Drill-down 네비게이션**: 시도 클릭 → 시군구, 시군구 클릭 → 읍면동 자동 전환
   - `App.tsx`의 `currentLevel`, `parentCode` 상태를 활용해 구현 예정
2. **인구 API 필드 매핑**: 실제 응답 구조 확인 후 `services/population.ts` 수정
3. **선거 API 엔드포인트**: 실제 API 스펙 확인 후 `services/election.ts` 수정
4. **Snapshot 모드**: real API 응답을 `data/snapshot/`에 저장하는 로직
5. **반응형**: 모바일 레이아웃 (현재는 데스크탑 전용)
6. **시군구/읍면동 mock 데이터**: 현재 sido.json만 있음

---

## 개발 서버 실행

```bash
cd ~/Documents/korea-datamap
npm run dev          # 기본 (mock 모드)
```

빌드:
```bash
npm run build
```

---

## 주의사항

- SGIS API 토큰 유효 시간: 약 4시간 (메모리 캐시)
- 서버 재시작 시 토큰 재발급 자동
- `proj4` 좌표 변환은 `utils/projection.ts`에서 처리 (EPSG:5179 → EPSG:4326)
- Leaflet CSS는 반드시 `KoreaMap.tsx`에서 `import 'leaflet/dist/leaflet.css'` 필요
