import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid,
} from 'recharts';
import { Users, User, UserRound, Home, ExternalLink } from 'lucide-react';
import type { PopulationData, PopulationFieldSource, PopulationFieldStatus } from '../../types';
import { StatsCard } from '../UI/StatsCard';
import { ChartCard } from '../UI/ChartCard';

interface Props {
  data: PopulationData;
}

const HOUSEHOLD_COLORS = [
  '#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#64748b',
];
const ROOT_SOURCE_LABELS: Record<string, string> = {
  real: '실제값',
  snapshot: '스냅샷',
  file: '공공데이터',
};
const FIELD_STATUS_LABELS: Record<PopulationFieldStatus, string> = {
  real: '실제값',
  snapshot: '스냅샷',
  file: '공공데이터',
  estimated: '추정값',
  unavailable: '데이터 미지원',
};

export function PopulationPanel({ data }: Props) {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const maleRatio = data.total_population > 0
    ? ((data.male_population / data.total_population) * 100).toFixed(1)
    : '0';
  const femaleRatio = data.total_population > 0
    ? ((data.female_population / data.total_population) * 100).toFixed(1)
    : '0';

  const totalPop = data.total_population || 1;

  // 5세 단위(21구간)는 10년 단위로 묶어 차트 표시
  const AGE_10YR_BUCKETS: { label: string; ranges: string[] }[] = [
    { label: '0-9',   ranges: ['0-4',   '5-9']   },
    { label: '10-19', ranges: ['10-14', '15-19']  },
    { label: '20-29', ranges: ['20-24', '25-29']  },
    { label: '30-39', ranges: ['30-34', '35-39']  },
    { label: '40-49', ranges: ['40-44', '45-49']  },
    { label: '50-59', ranges: ['50-54', '55-59']  },
    { label: '60-69', ranges: ['60-64', '65-69']  },
    { label: '70-79', ranges: ['70-74', '75-79']  },
    { label: '80+',   ranges: ['80-84', '85-89', '90-94', '95-99', '100+'] },
  ];
  const rawGroups = data.age_groups ?? [];
  const is5yr = rawGroups.some((g) => ['0-4', '5-9'].includes(g.age_range));

  const ageData = (() => {
    if (!rawGroups.length) return [];
    const buckets = is5yr ? AGE_10YR_BUCKETS : null;
    if (!buckets) {
      // 10년 단위 그대로
      return rawGroups.map((g) => ({
        name: g.age_range, 남성: g.male, 여성: g.female,
        남성Pct: ((g.male   / totalPop) * 100).toFixed(1),
        여성Pct: ((g.female / totalPop) * 100).toFixed(1),
      }));
    }
    // 5년 → 10년 합산
    return buckets.map(({ label, ranges }) => {
      const matched = rawGroups.filter((g) => ranges.includes(g.age_range));
      const male   = matched.reduce((s, g) => s + g.male,   0);
      const female = matched.reduce((s, g) => s + g.female, 0);
      return {
        name: label, 남성: male, 여성: female,
        남성Pct: ((male   / totalPop) * 100).toFixed(1),
        여성Pct: ((female / totalPop) * 100).toFixed(1),
      };
    });
  })();

  const householdData = data.household_structure?.map((h) => ({
    name: h.members_label,
    value: h.count,
    pct: h.percentage,
  })) ?? [];

  // 5인 이상 세대를 하나로 합산 (1인~4인 + "5인 이상")
  const displayHouseholdData = (() => {
    if (householdData.length <= 5) return householdData;
    const first4 = householdData.slice(0, 4);
    const fivePlusValue = householdData.slice(4).reduce((sum, h) => sum + h.value, 0);
    const totalHouseholds = householdData.reduce((sum, h) => sum + h.value, 0) || 1;
    const fivePlusPct = Math.round((fivePlusValue / totalHouseholds) * 1000) / 10;
    return [...first4, { name: '5인 이상', value: fivePlusValue, pct: fivePlusPct }];
  })();
  // 청년(15~39세): 5세 단위(실API) or 10년 단위(mock) 모두 대응
  const YOUTH_5YR  = ['15-19', '20-24', '25-29', '30-34', '35-39'];
  const YOUTH_10YR = ['20-29', '30-39']; // mock fallback (10년 단위엔 15-19 없음)
  const youthPopulation = (() => {
    const groups = data.age_groups ?? [];
    const has5yr = groups.some((g) => YOUTH_5YR.includes(g.age_range));
    return groups
      .filter((g) => (has5yr ? YOUTH_5YR : YOUTH_10YR).includes(g.age_range))
      .reduce((sum, g) => sum + g.total, 0);
  })();

  // 고령(65세 이상): 5세 단위 실API → 정확한 65+ / 10년 단위 mock → 70+ 근사
  const ELDERLY_5YR  = ['65-69', '70-74', '75-79', '80-84', '85-89', '90-94', '95-99', '100+'];
  const ELDERLY_10YR = ['70-79', '80+']; // mock fallback (60-69는 60~64 포함)
  const elderlyPopulation = (() => {
    const groups = data.age_groups ?? [];
    const has5yr = groups.some((g) => ELDERLY_5YR.includes(g.age_range));
    return groups
      .filter((g) => (has5yr ? ELDERLY_5YR : ELDERLY_10YR).includes(g.age_range))
      .reduce((sum, g) => sum + g.total, 0);
  })();
  const youthRatio = youthPopulation !== undefined
    ? ((youthPopulation / totalPop) * 100).toFixed(1)
    : null;
  const elderlyRatio = elderlyPopulation !== undefined
    ? ((elderlyPopulation / totalPop) * 100).toFixed(1)
    : null;

  // 데이터 단위에 따라 레이블 기준 표시
  const has5yrData = (data.age_groups ?? []).some((g) => ELDERLY_5YR.includes(g.age_range));
  const elderlyLabel = has5yrData ? '고령화율 (65세 이상)' : '고령화율 (70세 이상, 근사치)';
  const youthLabel   = has5yrData ? '청년비율 (15–39세)'  : '청년비율 (20–39세, 근사치)';

  const sourceRows: Array<{ label: string; source?: PopulationFieldSource; value?: string | null }> = [
    { label: '총 인구', source: data.field_sources?.total_population, value: `${fmt(data.total_population)}명` },
    { label: '남성', source: data.field_sources?.male_population, value: `${fmt(data.male_population)}명` },
    { label: '여성', source: data.field_sources?.female_population, value: `${fmt(data.female_population)}명` },
    { label: '세대 수', source: data.field_sources?.total_households, value: `${fmt(data.total_households)}세대` },
    { label: youthLabel,   source: data.field_sources?.youth_ratio,   value: youthRatio   ? `${youthRatio}%`   : null },
    { label: elderlyLabel, source: data.field_sources?.elderly_ratio, value: elderlyRatio ? `${elderlyRatio}%` : null },
  ];

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <span className="panel-section-title">인구 현황</span>
        <div className="pop-source-wrap">
          <span className={`pop-source-badge pop-source-badge--${data.source_type ?? 'snapshot'}`}>
            {ROOT_SOURCE_LABELS[data.source_type ?? 'snapshot']}
          </span>
          <span className="panel-section-meta">{data.year}년 {data.month}월 기준</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatsCard
          icon={Users}
          label="총 인구"
          value={fmt(data.total_population)}
          sub="명"
          accentColor="#2563eb"
          fullWidth
        />
        <StatsCard
          icon={User}
          label="남성"
          value={fmt(data.male_population)}
          sub={`${maleRatio}%`}
          accentColor="#3b82f6"
        />
        <StatsCard
          icon={UserRound}
          label="여성"
          value={fmt(data.female_population)}
          sub={`${femaleRatio}%`}
          accentColor="#ec4899"
        />
        <StatsCard
          icon={Home}
          label="세대 수"
          value={fmt(data.total_households)}
          sub="세대"
          accentColor="#10b981"
          fullWidth
        />
      </div>

      {ageData.length > 0 && data.field_sources?.age_distribution.status !== 'unavailable' ? (
        <ChartCard
          title="연령별 인구 분포"
          action={
            <span className={`age-source-note age-source-note--${data.field_sources?.age_distribution.status}`}>
              {FIELD_STATUS_LABELS[data.field_sources?.age_distribution.status ?? 'unavailable']}
            </span>
          }
        >
          <div className="chart-responsive-wrap">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={ageData} barCategoryGap="22%" barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`}
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                formatter={(v, name, props) => {
                  const pctKey = `${name}Pct` as keyof typeof props.payload;
                  const pct = props.payload[pctKey];
                  return [`${(v as number).toLocaleString('ko-KR')}명 (${pct}%)`, name as string];
                }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'rgba(37,99,235,0.04)' }}
              />
              <Bar dataKey="남성" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={12} />
              <Bar dataKey="여성" fill="#ec4899" radius={[3, 3, 0, 0]} maxBarSize={12} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : (
        <ChartCard title="연령별 인구 분포">
          <div className="age-data-unavailable">
            <span className="age-data-unavailable__icon">📊</span>
            <p className="age-data-unavailable__title">{FIELD_STATUS_LABELS[data.field_sources?.age_distribution.status ?? 'unavailable']}</p>
            <p className="age-data-unavailable__desc">
              {data.field_sources?.age_distribution.note ?? '연령 분포 데이터가 없습니다.'}
            </p>
          </div>
        </ChartCard>
      )}

      {householdData.length > 0 && data.field_sources?.household_structure.status !== 'unavailable' ? (
        <ChartCard
          title="세대구조 (세대원수별)"
          action={
            <span className="age-source-note age-source-note--real">
              {data.field_sources?.household_structure.note}
            </span>
          }
        >
          <div className="chart-responsive-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={displayHouseholdData}
              margin={{ top: 4, right: 4, left: 0, bottom: 20 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => v >= 10000 ? `${(v / 10000).toFixed(0)}만` : `${v}`}
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                formatter={(v, _name, props) => [
                  `${(v as number).toLocaleString('ko-KR')}세대 (${props.payload.pct}%)`,
                  props.payload.name,
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                  fontSize: 12,
                }}
                cursor={{ fill: 'rgba(99,102,241,0.06)' }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
                {displayHouseholdData.map((_, i) => (
                  <Cell key={i} fill={HOUSEHOLD_COLORS[i % HOUSEHOLD_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </ChartCard>
      ) : (
        <ChartCard title="세대구조 (세대원수별)">
          <div className="age-data-unavailable">
            <span className="age-data-unavailable__icon">🏠</span>
            <p className="age-data-unavailable__title">{FIELD_STATUS_LABELS[data.field_sources?.household_structure.status ?? 'unavailable']}</p>
            <p className="age-data-unavailable__desc">
              {data.field_sources?.household_structure.note ?? '세대구조 데이터가 없습니다.'}
            </p>
          </div>
        </ChartCard>
      )}

      <ChartCard title="Sources">
        <div className="population-sources-list">
          {sourceRows.map((row) => (
            <div key={row.label} className="population-source-row">
              <div className="population-source-main">
                <span className="population-source-label">{row.label}</span>
                {row.value ? <span className="population-source-value">{row.value}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="panel-source-links">
          <span className="panel-source-links-label">공식 출처</span>
          <a href="https://jumin.mois.go.kr" target="_blank" rel="noopener noreferrer" className="panel-source-link">
            jumin.mois.go.kr <ExternalLink size={10} />
          </a>
          <a href="https://sgis.kostat.go.kr" target="_blank" rel="noopener noreferrer" className="panel-source-link">
            sgis.kostat.go.kr <ExternalLink size={10} />
          </a>
        </div>
      </ChartCard>
    </div>
  );
}
