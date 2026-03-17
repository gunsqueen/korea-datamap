import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts';
import type { PopulationData } from '../../types';

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
      <h3 className="panel-subtitle">
        {data.adm_nm} 인구 현황
        <span className="panel-date">{data.year}년 {data.month}월</span>
      </h3>

      <div className="stat-grid">
        <div className="stat-card total">
          <div className="stat-label">총 인구</div>
          <div className="stat-value">{fmt(data.total_population)}</div>
          <div className="stat-unit">명</div>
        </div>
        <div className="stat-card male">
          <div className="stat-label">남성</div>
          <div className="stat-value">{fmt(data.male_population)}</div>
          <div className="stat-sub">{maleRatio}%</div>
        </div>
        <div className="stat-card female">
          <div className="stat-label">여성</div>
          <div className="stat-value">{fmt(data.female_population)}</div>
          <div className="stat-sub">{femaleRatio}%</div>
        </div>
        <div className="stat-card household">
          <div className="stat-label">세대 수</div>
          <div className="stat-value">{fmt(data.total_households)}</div>
          <div className="stat-unit">세대</div>
        </div>
      </div>

      {ageData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">연령별 인구 분포</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ageData} barCategoryGap="20%">
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`${(v as number).toLocaleString('ko-KR')}명`]} />
              <Bar dataKey="남성" fill="#4A90D9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="여성" fill="#E85D9A" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {householdData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">세대구조 (세대원수별)</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={householdData}
                dataKey="value"
                nameKey="name"
                cx="40%"
                cy="50%"
                outerRadius={65}
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
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconSize={10}
                formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
