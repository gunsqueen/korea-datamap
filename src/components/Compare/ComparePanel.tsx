import type { AdminArea } from '../../types';
import { usePopulation } from '../../hooks/usePopulation';
import { useElection } from '../../hooks/useElection';

interface Props {
  areaA: AdminArea;
  areaB: AdminArea | null;
  onClose: () => void;
}

export function ComparePanel({ areaA, areaB, onClose }: Props) {
  const { data: popA } = usePopulation(areaA.adm_cd);
  const { data: popB } = usePopulation(areaB?.adm_cd ?? null);
  const { data: elecA } = useElection(areaA.adm_cd);
  const { data: elecB } = useElection(areaB?.adm_cd ?? null);

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  return (
    <div className="compare-panel">
      <div className="panel-header">
        <h2 className="panel-title">지역 비교</h2>
        <button className="btn-close" onClick={onClose}>✕</button>
      </div>

      <div className="compare-grid">
        <div className="compare-col header">
          <div className="compare-area-name">{areaA.adm_nm}</div>
        </div>
        <div className="compare-col divider">vs</div>
        <div className="compare-col header">
          <div className="compare-area-name">{areaB?.adm_nm ?? '지도에서 선택'}</div>
        </div>
      </div>

      {popA && (
        <div className="compare-section">
          <div className="compare-section-title">인구</div>
          <CompareRow
            label="총 인구"
            valA={fmt(popA.total_population) + '명'}
            valB={popB ? fmt(popB.total_population) + '명' : '-'}
            numA={popA.total_population}
            numB={popB?.total_population}
          />
          <CompareRow
            label="세대 수"
            valA={fmt(popA.total_households) + '세대'}
            valB={popB ? fmt(popB.total_households) + '세대' : '-'}
            numA={popA.total_households}
            numB={popB?.total_households}
          />
        </div>
      )}

      {elecA && (
        <div className="compare-section">
          <div className="compare-section-title">선거 (2022 지방선거)</div>
          <CompareRow
            label="투표율"
            valA={elecA.turnout_rate.toFixed(1) + '%'}
            valB={elecB ? elecB.turnout_rate.toFixed(1) + '%' : '-'}
            numA={elecA.turnout_rate}
            numB={elecB?.turnout_rate}
          />
          {elecA.candidates[0] && (
            <div className="compare-winner">
              <div className="cw-item">
                <span
                  className="cw-party"
                  style={{ color: elecA.candidates[0].party_color }}
                >
                  {elecA.candidates[0].party}
                </span>
                <span className="cw-name">{elecA.candidates[0].name}</span>
                <span className="cw-rate">{elecA.candidates[0].vote_rate.toFixed(1)}%</span>
              </div>
              <div className="cw-vs">당선자</div>
              <div className="cw-item">
                {elecB?.candidates[0] ? (
                  <>
                    <span
                      className="cw-party"
                      style={{ color: elecB.candidates[0].party_color }}
                    >
                      {elecB.candidates[0].party}
                    </span>
                    <span className="cw-name">{elecB.candidates[0].name}</span>
                    <span className="cw-rate">{elecB.candidates[0].vote_rate.toFixed(1)}%</span>
                  </>
                ) : (
                  <span className="cw-empty">-</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompareRow({
  label,
  valA,
  valB,
  numA,
  numB,
}: {
  label: string;
  valA: string;
  valB: string;
  numA?: number;
  numB?: number;
}) {
  const aWins = numA !== undefined && numB !== undefined && numA > numB;
  const bWins = numA !== undefined && numB !== undefined && numB > numA;

  return (
    <div className="compare-row">
      <div className={`compare-cell ${aWins ? 'winner' : ''}`}>{valA}</div>
      <div className="compare-label">{label}</div>
      <div className={`compare-cell ${bWins ? 'winner' : ''}`}>{valB}</div>
    </div>
  );
}
