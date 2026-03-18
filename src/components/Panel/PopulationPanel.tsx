import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend, CartesianGrid,
} from 'recharts';
import { Users, User, UserRound, Home } from 'lucide-react';
import type { PopulationData } from '../../types';
import { StatsCard } from '../UI/StatsCard';
import { ChartCard } from '../UI/ChartCard';

interface Props {
  data: PopulationData;
}

const HOUSEHOLD_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

export function PopulationPanel({ data }: Props) {
  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const maleRatio = data.total_population > 0
    ? ((data.male_population / data.total_population) * 100).toFixed(1)
    : '0';
  const femaleRatio = data.total_population > 0
    ? ((data.female_population / data.total_population) * 100).toFixed(1)
    : '0';

  const ageData = data.age_groups?.map((g) => ({
    name: g.age_range,
    남성: g.male,
    여성: g.female,
  })) ?? [];

  const householdData = data.household_structure?.map((h) => ({
    name: h.members_label,
    value: h.count,
    pct: h.percentage,
  })) ?? [];

  return (
    <div className="panel-section">
      <div className="panel-section-header">
        <span className="panel-section-title">인구 현황</span>
        <div className="pop-source-wrap">
          <span className={`pop-source-badge pop-source-badge--${data.source_type ?? 'snapshot'}`}>
            {data.source_type === 'realtime' ? '실시간' : '스냅샷'}
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

      {ageData.length > 0 && (
        <ChartCard title="연령별 인구 분포">
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
                formatter={(v) => [`${(v as number).toLocaleString('ko-KR')}명`]}
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
      )}

      {householdData.length > 0 && (
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
      )}
    </div>
  );
}
