import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';

const STORAGE_KEY = 'disclaimer_accepted_v1';

const DATA_SOURCES = [
  { name: '통계청 SGIS', url: 'https://sgis.kostat.go.kr' },
  { name: '행정안전부', url: 'https://jumin.mois.go.kr' },
  { name: '중앙선거관리위원회', url: 'https://info.nec.go.kr' },
  { name: '공공데이터포털', url: 'https://www.data.go.kr' },
];

export function DisclaimerModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="dcl-overlay" role="dialog" aria-modal="true" aria-labelledby="dcl-title">
      <div className="dcl-modal">
        <div className="dcl-header">
          <AlertTriangle size={18} strokeWidth={2} className="dcl-header-icon" />
          <h2 id="dcl-title">서비스 안내</h2>
        </div>

        <div className="dcl-body">
          <p className="dcl-text">
            본 앱은 <strong>개인 개발자가 제작한 비공식 서비스</strong>이며,
            대한민국 정부·중앙선거관리위원회·행정안전부 등 정부기관과
            <strong> 무관합니다.</strong>
          </p>
          <p className="dcl-text">
            표시되는 데이터는 공공기관이 공개한 API를 통해 수집한 자료로,
            정확성 및 최신성을 보장하지 않습니다.
          </p>

          <div className="dcl-divider" />

          <p className="dcl-sources-title">데이터 출처</p>
          <ul className="dcl-sources">
            {DATA_SOURCES.map(({ name, url }) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="dcl-link">
                  {name}
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
