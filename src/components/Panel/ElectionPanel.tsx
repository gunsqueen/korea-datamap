import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ExternalLink } from 'lucide-react';
import type { ElectionType, ElectionData } from '../../types';
import { useElection } from '../../hooks/useElection';
import { ELECTIONS_META } from '../../services';

interface Props {
  admCd: string;
  admNm?: string;
}

const TYPE_LABELS: Record<ElectionType, string> = {
  presidential: '대통령',
  assembly: '국회의원',
  local: '지방선거',
};

const TYPE_ORDER: ElectionType[] = ['presidential', 'assembly', 'local'];

const ASSEMBLY_SUB_LABELS = [
  { key: 'district', label: '지역구' },
  { key: 'pr', label: '비례대표' },
];

const LOCAL_SUB_LABELS = [
  { key: 'metro_mayor', label: '광역단체장' },
  { key: 'mayor', label: '기초단체장' },
  { key: 'council_district', label: '광역의원' },
  { key: 'council_pr', label: '광역비례' },
  { key: 'basic_district', label: '기초의원' },
  { key: 'basic_pr', label: '기초비례' },
];

export function ElectionPanel({ admCd, admNm }: Props) {
  const [activeType, setActiveType] = useState<ElectionType>('presidential');

  // ── 대통령 ───────────────────────────────────────────
  const presidentialMetas = useMemo(
    () => ELECTIONS_META.filter((m) => m.type === 'presidential').sort((a, b) => b.year - a.year),
    []
  );
  const [selectedPresidentialId, setSelectedPresidentialId] = useState(
    presidentialMetas[0]?.id ?? ''
  );

  // ── 국회의원: 선거(suffix) + 지역구/비례 ──────────────
  const assemblyGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: { suffix: string; short_name: string; year: number }[] = [];
    ELECTIONS_META.filter((m) => m.type === 'assembly')
      .sort((a, b) => b.year - a.year)
      .forEach((m) => {
        const match = m.id.match(/^assembly_(\d+)_/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          groups.push({ suffix: match[1], short_name: m.short_name, year: m.year });
        }
      });
    return groups;
  }, []);
  const [selectedAssemblySuffix, setSelectedAssemblySuffix] = useState(
    assemblyGroups[0]?.suffix ?? '22'
  );
  const [assemblySubType, setAssemblySubType] = useState('district');

  // ── 지방선거: 선거(prefix) + 세부 유형 ─────────────────
  const localGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: { prefix: string; short_name: string; year: number }[] = [];
    ELECTIONS_META.filter((m) => m.type === 'local')
      .sort((a, b) => b.year - a.year)
      .forEach((m) => {
        const match = m.id.match(/^(local_\d+)_/);
        if (match && !seen.has(match[1])) {
          seen.add(match[1]);
          groups.push({ prefix: match[1], short_name: m.short_name, year: m.year });
        }
      });
    return groups;
  }, []);
  const [selectedLocalPrefix, setSelectedLocalPrefix] = useState(
    localGroups[0]?.prefix ?? 'local_8'
  );
  const [localSubType, setLocalSubType] = useState('metro_mayor');

  // ── selectedId 도출 ────────────────────────────────────
  const selectedId = useMemo(() => {
    if (activeType === 'presidential') return selectedPresidentialId;
    if (activeType === 'assembly') return `assembly_${selectedAssemblySuffix}_${assemblySubType}`;
    if (activeType === 'local') return `${selectedLocalPrefix}_${localSubType}`;
    return '';
  }, [activeType, selectedPresidentialId, selectedAssemblySuffix, assemblySubType, selectedLocalPrefix, localSubType]);

  const { data, loading, error } = useElection(admCd, selectedId, admNm);

  return (
    <div className="panel-section">
      {/* 선거 종류 탭 */}
      <div className="election-type-tabs">
        {TYPE_ORDER.map((type) => (
          <button
            key={type}
            className={`election-type-tab ${activeType === type ? 'active' : ''}`}
            onClick={() => setActiveType(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* 대통령 선거 목록 */}
      {activeType === 'presidential' && (
        <div className="election-year-list">
          {presidentialMetas.map((meta) => (
            <button
              key={meta.id}
              className={`election-year-btn ${selectedPresidentialId === meta.id ? 'active' : ''}`}
              onClick={() => setSelectedPresidentialId(meta.id)}
            >
              <span className="election-year-name">{meta.short_name}</span>
              <span className="election-year-date">
                {meta.date.slice(0, 4)}.{meta.date.slice(5, 7)}.{meta.date.slice(8, 10)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 국회의원: 선거 선택 → 지역구/비례 탭 */}
      {activeType === 'assembly' && (
        <>
          <div className="election-year-list">
            {assemblyGroups.map((g) => (
              <button
                key={g.suffix}
                className={`election-year-btn ${selectedAssemblySuffix === g.suffix ? 'active' : ''}`}
                onClick={() => setSelectedAssemblySuffix(g.suffix)}
              >
                <span className="election-year-name">{g.short_name}</span>
                <span className="election-year-date">{g.year}</span>
              </button>
            ))}
          </div>
          <div className="election-sub-type-tabs">
            {ASSEMBLY_SUB_LABELS.map((s) => (
              <button
                key={s.key}
                className={`election-sub-tab ${assemblySubType === s.key ? 'active' : ''}`}
                onClick={() => setAssemblySubType(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 지방선거: 선거 선택 → 세부 유형 탭 */}
      {activeType === 'local' && (
        <>
          <div className="election-year-list">
            {localGroups.map((g) => (
              <button
                key={g.prefix}
                className={`election-year-btn ${selectedLocalPrefix === g.prefix ? 'active' : ''}`}
                onClick={() => setSelectedLocalPrefix(g.prefix)}
              >
                <span className="election-year-name">{g.short_name}</span>
                <span className="election-year-date">{g.year}</span>
              </button>
            ))}
          </div>
          <div className="election-sub-type-tabs election-sub-type-tabs--local">
            {LOCAL_SUB_LABELS.map((s) => (
              <button
                key={s.key}
                className={`election-sub-tab ${localSubType === s.key ? 'active' : ''}`}
                onClick={() => setLocalSubType(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 결과 표시 */}
      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : error === '선거 데이터 확인 필요' ? (
        <div className="empty">선거 데이터 확인 필요</div>
      ) : data?.is_uncontested ? (
        <UncandidateResult data={data} />
      ) : data ? (
        <ElectionResult data={data} requestedAdmCd={admCd} />
      ) : (
        <div className="empty">선거 데이터 없음</div>
      )}
    </div>
  );
}

function ElectionResult({ data, requestedAdmCd }: { data: ElectionData; requestedAdmCd: string }) {
  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const pieData = data.candidates.slice(0, 6).map((c) => ({
    name: c.name,
    value: c.votes,
    color: c.party_color,
    party: c.party,
    vote_rate: c.vote_rate,
  }));

  const dataLevel =
    data.adm_cd === '00' ? '전국' :
    data.adm_cd.length === 2 ? '시·도' :
    data.adm_cd.length === 5 ? '시·군·구' : '동';
  const isBroaderFallback = data.adm_cd !== requestedAdmCd;

  return (
    <>
      {/* 헤더 */}
      <div className="election-result-header">
        <h3 className="panel-subtitle">
          {data.adm_nm} 선거 결과
          <span className="panel-date">{data.election_name}</span>
        </h3>
        {data.sub_type && (
          <span className="election-sub-badge">{data.sub_type}</span>
        )}
        <span className="election-level-badge">{dataLevel} 기준</span>
      </div>
      {isBroaderFallback && (
        <div className="election-fallback-note">
          해당 회차는 하위 행정동 공식 결과가 없어 실제 {dataLevel} 결과를 표시합니다.
        </div>
      )}

      {/* 투개표 현황 */}
      <div className="election-stats-grid">
        <div className="estat-item">
          <span className="estat-label">선거인수</span>
          <span className="estat-value">{fmt(data.total_voters)}명</span>
        </div>
        <div className="estat-item">
          <span className="estat-label">투표수</span>
          <span className="estat-value">{fmt(data.total_votes)}표</span>
        </div>
        <div className="estat-item">
          <span className="estat-label">투표율</span>
          <span className="estat-value highlight">{data.turnout_rate.toFixed(1)}%</span>
        </div>
        <div className="estat-item">
          <span className="estat-label">유효투표</span>
          <span className="estat-value">{fmt(data.valid_votes)}표</span>
        </div>
        <div className="estat-item">
          <span className="estat-label">무효투표</span>
          <span className="estat-value">{fmt(data.invalid_votes)}표</span>
        </div>
      </div>

      {/* 파이 차트 */}
      {pieData.length > 1 && (
        <div className="chart-container">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="45%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, _n, props) => [
                  `${fmt(v as number)}표 (${props.payload.vote_rate?.toFixed(2) ?? ''}%)`,
                  `${props.payload.name} (${props.payload.party})`
                ]}
              />
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconSize={10}
                formatter={(_, entry: { payload?: { name?: string } }) =>
                  <span style={{ fontSize: 11 }}>{entry.payload?.name ?? ''}</span>
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 전체 후보 결과 테이블 */}
      <div className="candidates-table-wrap">
        <table className="candidates-table">
          <thead>
            <tr>
              <th>순위</th>
              <th>후보/정당</th>
              <th>득표수</th>
              <th>득표율</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.candidates.map((c, i) => (
              <tr key={i}>
                <td className="col-rank">{c.rank}</td>
                <td className="col-name">
                  <span className="cand-dot" style={{ background: c.party_color }} />
                  <span className="cand-name">{c.name}</span>
                  <span className="cand-party">{c.party}</span>
                </td>
                <td className="col-num">{fmt(c.votes)}</td>
                <td className="col-rate">{c.vote_rate.toFixed(2)}%</td>
                <td className="col-bar">
                  <div className="tbl-bar-wrap">
                    <div
                      className="tbl-bar"
                      style={{ width: `${Math.min(c.vote_rate, 100)}%`, background: c.party_color }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-source-links">
        <span className="panel-source-links-label">공식 출처</span>
        <a href="https://info.nec.go.kr" target="_blank" rel="noopener noreferrer" className="panel-source-link">
          info.nec.go.kr <ExternalLink size={10} />
        </a>
        <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="panel-source-link">
          data.go.kr <ExternalLink size={10} />
        </a>
      </div>
    </>
  );
}

function UncandidateResult({ data }: { data: ElectionData }) {
  return (
    <div className="panel-section">
      <div className="uncontested-banner">
        <span className="uncontested-badge">무투표당선</span>
        <p className="uncontested-desc">
          이 선거구는 후보자 수가 당선인 수와 같아 투표 없이 당선이 결정되었습니다.
        </p>
        {data.uncontested_district && (
          <p className="uncontested-sgg">선거구: {data.uncontested_district}</p>
        )}
      </div>

      {data.candidates.length > 0 ? (
        <div className="uncontested-candidates">
          {data.candidates.map((c, i) => (
            <div key={i} className="uncontested-candidate-row">
              <span
                className="uncontested-party-dot"
                style={{ background: c.party_color }}
              />
              <span className="uncontested-name">{c.name}</span>
              <span className="uncontested-party">{c.party}</span>
              <span className="uncontested-elected-badge">당선</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="uncontested-no-data">당선인 정보를 불러오는 중입니다.</p>
      )}

      <div className="panel-source-links" style={{ marginTop: 16 }}>
        <span className="panel-source-links-label">공식 출처</span>
        <a href="https://info.nec.go.kr" target="_blank" rel="noopener noreferrer" className="panel-source-link">
          info.nec.go.kr <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
}
