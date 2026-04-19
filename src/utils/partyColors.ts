import type { Candidate, ElectionData } from '../types';

const PARTY_COLORS: Record<string, string> = {
  // 민주 계열
  '더불어민주당': '#004EA2',
  '더불어민주연합': '#004EA2',
  '더불어시민당': '#004EA2',
  '새정치민주연합': '#004EA2',
  '민주당': '#004EA2',
  '민주통합당': '#004EA2',
  '열린민주당': '#003DA5',
  '새로운미래': '#0066B2',

  // 보수 계열
  '국민의힘': '#E61E2B',
  '국민의미래': '#E61E2B',
  '자유한국당': '#E61E2B',
  '새누리당': '#E61E2B',
  '미래한국당': '#E61E2B',
  '비례자유한국당': '#E61E2B',
  '한나라당': '#0095DA',

  // 중도/제3지대
  '국민의당': '#EA5504',
  '안철수신당': '#EA5504',
  '개혁신당': '#FF7210',
  '바른미래당': '#00B0B9',
  '자유선진당': '#2E8B57',
  '미래연합': '#F28C28',
  '국민참여당': '#F6C343',

  // 진보 계열
  '정의당': '#FFCC00',
  '녹색정의당': '#FFCC00',
  '진보당': '#D6001C',
  '민중당': '#D6001C',
  '노동당': '#D6001C',
  '진보신당': '#D6001C',
  '통합진보당': '#6A1B9A',
  '사회당': '#F07D00',

  // 기타
  '기본소득당': '#82C8A0',
  '시대전환': '#5C2D91',
  '무소속': '#999999',
  '기타': '#888888',
};

export function getPartyColor(party: string): string {
  return PARTY_COLORS[party] ?? '#888888';
}

function normalizeCandidateColor(candidate: Candidate): Candidate {
  return {
    ...candidate,
    party_color: getPartyColor(candidate.party || candidate.name),
  };
}

export function applyPartyColors(data: ElectionData): ElectionData {
  return {
    ...data,
    candidates: data.candidates.map(normalizeCandidateColor),
  };
}
