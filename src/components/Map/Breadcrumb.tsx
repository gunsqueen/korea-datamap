import type { NavItem } from '../../types';

interface Props {
  stack: NavItem[];
  onNavigate: (index: number) => void;
}

const LEVEL_LABELS = {
  sido: '시도',
  sigungu: '시군구',
  eupmyeondong: '읍면동',
};

export function Breadcrumb({ stack, onNavigate }: Props) {
  return (
    <div className="breadcrumb">
      <button className="breadcrumb-item root" onClick={() => onNavigate(-1)}>
        전국
      </button>
      {stack.map((item, i) => (
        <span key={item.adm_cd} className="breadcrumb-row">
          <span className="breadcrumb-sep">›</span>
          <button
            className={`breadcrumb-item ${i === stack.length - 1 ? 'current' : ''}`}
            onClick={() => onNavigate(i)}
          >
            {item.adm_nm}
            <span className="breadcrumb-level">{LEVEL_LABELS[item.level]}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
