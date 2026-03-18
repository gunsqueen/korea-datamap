import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, CartesianGrid,
} from 'recharts';
import { Users, User, UserRound, Home } from 'lucide-react';
import type { PopulationData, PopulationFieldSource, PopulationFieldStatus } from '../../types';
import { StatsCard } from '../UI/StatsCard';
import { ChartCard } from '../UI/ChartCard';

interface Props {
  data: PopulationData;
}

const HOUSEHOLD_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
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
  const ageData = data.age_groups?.map((g) => ({
    name: g.age_range,
    남성: g.male,
    여성: g.female,
    남성Pct: totalPop > 0 ? ((g.male / totalPop) * 100).toFixed(1) : '0',
    여성Pct: totalPop > 0 ? ((g.female / totalPop) * 100).toFixed(1) : '0',
  })) ?? [];

  const householdData = data.household_structure?.map((h) => ({
    name: h.members_label,
    value: h.count,
    pct: h.percentage,
  })) ?? [];
  const youthPopulation = data.age_groups
    ?.filter((group) => ['15-19', '20-29', '30-39'].includes(group.age_range))
    .reduce((sum, group) => sum + group.total, 0);
  const elderlyPopulation = data.age_groups
    ?.filter((group) => ['65-69', '70-79', '80+'].includes(group.age_range))
    .reduce((sum, group) => sum + group.total, 0);
  const youthRatio = youthPopulation !== undefined
    ? ((youthPopulation / totalPop) * 100).toFixed(1)
    : null;
  const elderlyRatio = elderlyPopulation !== undefined
    ? ((elderlyPopulation / totalPop) * 100).toFixed(1)
    : null;

  const sourceRows: Array<{ label: string; source?: PopulationFieldSource; value?: string | null }> = [
    { label: '총 인구', source: data.field_sources?.total_population, value: `${fmt(data.total_population)}명` },
    { label: '남성', source: data.field_sources?.male_population, value: `${fmt(data.male_population)}명` },
    { label: '여성', source: data.field_sources?.female_population, value: `${fmt(data.female_population)}명` },
    { label: '세대 수', source: data.field_sources?.total_households, value: `${fmt(data.total_households)}세대` },
    { label: '연령 분포', source: data.field_sources?.age_distribution },
    { label: '청년비율', source: data.field_sources?.youth_ratio, value: youthRatio ? `${youthRatio}%` : null },
    { label: '고령화율', source: data.field_sources?.elderly_ratio, value: elderlyRatio ? `${elderlyRatio}%` : null },
    { label: '세대원수별 세대수', source: data.field_sources?.household_structure },
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
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={ageData} barCategoryGap="22%" barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
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
        <ChartCard title="세대구조 (세대원수별)">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={householdData}
                dataKey="value"
                nameKey="name"
                cx="38%"
                cy="50%"
                outerRadius={65}
                innerRadius={32}
                label={({ payload }) => `${payload?.pct ?? ''}%`}
                labelLine={false}
              >
                {householdData.map((_, i) => (
                  <Cell key={i} fill={HOUSEHOLD_COLORS[i % HOUSEHOLD_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name, props) => [
                  `${(v as number).toLocaleString('ko-KR')}세대 (${props.payload.pct}%)`,
                  name,
                ]}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconSize={8}
                iconType="circle"
                formatter={(value) => (
                  <span style={{ fontSize: 11, color: '#334155' }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
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
              <div className="population-source-meta">
                <span className={`population-source-badge population-source-badge--${row.source?.status ?? 'unavailable'}`}>
                  {FIELD_STATUS_LABELS[row.source?.status ?? 'unavailable']}
                </span>
                <span className="population-source-note">{row.source?.note ?? '출처 정보 없음'}</span>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}
