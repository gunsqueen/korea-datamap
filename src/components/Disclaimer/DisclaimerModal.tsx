import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';

const SESSION_KEY = 'disclaimer_shown';

const DATA_SOURCES = [
  { name: '중앙선거관리위원회 선거통계시스템', url: 'https://info.nec.go.kr', domain: 'info.nec.go.kr' },
  { name: '행정안전부 주민등록 인구통계', url: 'https://jumin.mois.go.kr', domain: 'jumin.mois.go.kr' },
  { name: '통계청 SGIS 행정경계', url: 'https://sgis.kostat.go.kr', domain: 'sgis.kostat.go.kr' },
  { name: '공공데이터포털', url: 'https://www.data.go.kr', domain: 'data.go.kr' },
];

export function DisclaimerModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(SESSION_KEY)) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem(SESSION_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="dcl-overlay" role="dialog" aria-modal="true" aria-labelledby="dcl-title">
      <div className="dcl-modal">
        <div className="dcl-header">
          <AlertTriangle size={18} strokeWidth={2} className="dcl-header-icon" />
          <h2 id="dcl-title">⚠ 비공식 앱 안내</h2>
        </div>

        <div className="dcl-body">
          <p className="dcl-text">
            본 앱은 <strong>대한민국 정부 기관과 제휴하거나 정부를 대표하지 않습니다.</strong>
          </p>
          <p className="dcl-text dcl-text-en">
            This app is not affiliated with, endorsed by, or representative of any government agency.
          </p>
          <p className="dcl-text">
            제공되는 데이터의 정확성과 최신성을 보장하지 않습니다.
            공식 정보는 각 출처를 직접 확인하시기 바랍니다.
          </p>

          <div className="dcl-divider" />

          <p className="dcl-sources-title">📊 공식 데이터 출처</p>
          <ul className="dcl-sources">
            {DATA_SOURCES.map(({ name, url, domain }) => (
              <li key={url} className="dcl-source-item">
                <a href={url} target="_blank" rel="noopener noreferrer" className="dcl-link">
                  <span className="dcl-source-name">{name}</span>
                  <span className="dcl-source-domain">{domain}</span>
                  <ExternalLink size={11} strokeWidth={2} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <button className="dcl-accept-btn" onClick={handleAccept}>
          확인했습니다
        </button>
      </div>
    </div>
  );
}
