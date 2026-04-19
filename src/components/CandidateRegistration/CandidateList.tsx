import { useState } from 'react';
import type { CandidateRegistrationCandidate } from '../../types';
import { CandidateItem } from './CandidateItem';

interface Props {
  candidates: CandidateRegistrationCandidate[];
}

export function CandidateList({ candidates }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (candidates.length === 0) {
    return <div className="empty">등록된 후보자가 없습니다</div>;
  }

  return (
    <div className="candidate-list">
      {candidates.map((candidate) => {
        const key = `${candidate.party}-${candidate.name}-${candidate.district}`;
        return (
          <CandidateItem
            key={key}
            candidate={candidate}
            expanded={expandedKey === key}
            onToggle={() => setExpandedKey((current) => (current === key ? null : key))}
          />
        );
      })}
    </div>
  );
}
