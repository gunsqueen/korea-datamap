import type { CandidateRegistrationCandidate } from '../../types';
import { getPartyColor } from '../../utils/partyColors';

interface Props {
  candidate: CandidateRegistrationCandidate;
  expanded: boolean;
  onToggle: () => void;
}

function formatAge(age: number) {
  return age > 0 ? `${age}세` : '나이 미상';
}

function getStatusClass(status: string) {
  if (status === '등록') return 'registered';
  if (status === '사퇴') return 'withdrawn';
  return 'other';
}

export function CandidateItem({ candidate, expanded, onToggle }: Props) {
  const partyColor = getPartyColor(candidate.party);

  return (
    <article className="candidate-card">
      <button type="button" className="candidate-card__toggle" onClick={onToggle}>
        <span className="candidate-card__title">
          <span className="cand-dot" style={{ background: partyColor }} />
          <strong className="candidate-card__name">{candidate.name}</strong>
        </span>
        <span className="candidate-card__toggle-icon">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <>
          <div className="candidate-card__header">
            <span className="candidate-card__party">[{candidate.party}]</span>
            <span className={`candidate-status-badge candidate-status-badge--${getStatusClass(candidate.status)}`}>
              {candidate.status}
            </span>
          </div>

          <dl className="candidate-card__meta">
            <div>
              <dt>선거구</dt>
              <dd>{candidate.district}</dd>
            </div>
            <div>
              <dt>기본정보</dt>
              <dd>{formatAge(candidate.age)} / {candidate.gender}</dd>
            </div>
            <div>
              <dt>직업</dt>
              <dd>{candidate.job}</dd>
            </div>
            <div>
              <dt>학력</dt>
              <dd>{candidate.education}</dd>
            </div>
            <div>
              <dt>주요경력</dt>
              <dd>{candidate.career}</dd>
            </div>
          </dl>
        </>
      )}
    </article>
  );
}
