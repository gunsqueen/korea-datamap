import { X, ExternalLink, AlertTriangle, Database, Info } from 'lucide-react';

interface DataSource {
  name: string;
  label: string;
  url: string;
}

const DATA_SOURCES: DataSource[] = [
  {
    name: '중앙선거관리위원회 — 선거 결과',
    label: 'info.nec.go.kr · 공공데이터포털 API',
    url: 'https://info.nec.go.kr',
  },
  {
    name: '통계지리정보서비스 (SGIS) — 행정 경계',
    label: 'sgis.kostat.go.kr',
    url: 'https://sgis.kostat.go.kr',
  },
  {
    name: '행정안전부 — 인구 통계',
    label: 'jumin.mois.go.kr',
    url: 'https://jumin.mois.go.kr',
  },
  {
    name: '공공데이터포털 — 오픈 API',
    label: 'data.go.kr',
    url: 'https://www.data.go.kr',
  },
];

interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <div className="about-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        {/* 헤더 */}
        <div className="about-modal-header">
          <div className="about-modal-title-row">
            <Info size={18} strokeWidth={2} />
            <h2 id="about-title">앱 정보</h2>
          </div>
          <button className="about-close-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="about-modal-body">
          {/* 앱 이름 */}
          <div className="about-app-name">
            <span className="about-app-title">한국 데이터맵</span>
            <span className="about-app-version">v1.2</span>
          </div>

          {/* 면책 조항 */}
          <section className="about-section">
            <div className="about-section-header">
              <AlertTriangle size={15} strokeWidth={2} className="about-section-icon warning" />
              <h3>면책 조항</h3>
            </div>
            <p className="about-disclaimer">
              이 앱은 대한민국 정부 또는 중앙선거관리위원회, 행정안전부와
              <strong> 공식적으로 제휴하거나 승인받은 앱이 아닙니다.</strong>
            </p>
            <p className="about-disclaimer">
              표시된 선거 결과 및 인구 통계 데이터는 공공데이터포털(data.go.kr)에서
              제공하는 공개 API를 통해 수집한 자료입니다. 데이터의 정확성이나 최신성을
              보장하지 않으며, 공식 정보는 반드시 해당 기관의 공식 웹사이트를 참조하시기 바랍니다.
            </p>
          </section>

          <div className="about-divider" />

          {/* 데이터 출처 */}
          <section className="about-section">
            <div className="about-section-header">
              <Database size={15} strokeWidth={2} className="about-section-icon" />
              <h3>데이터 출처</h3>
            </div>
            <ul className="about-sources-list">
              {DATA_SOURCES.map((source) => (
                <li key={source.url} className="about-source-item">
                  <span className="about-source-name">{source.name}</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-source-link"
                  >
                    {source.label}
                    <ExternalLink size={12} strokeWidth={2} />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <div className="about-divider" />

          {/* 앱 소개 */}
          <section className="about-section">
            <p className="about-app-desc">
              한국 데이터맵은 대한민국 전국 행정구역의 인구 통계와 역대 선거 결과를
              지도 기반으로 탐색할 수 있는 비영리 오픈소스 앱입니다.
              시도 → 시군구 → 읍면동 단계로 드릴다운하며 각 지역의 데이터를 확인할 수 있습니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
