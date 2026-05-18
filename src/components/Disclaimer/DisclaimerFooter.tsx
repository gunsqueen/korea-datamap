const SOURCES = [
  { name: 'info.nec.go.kr', label: '중앙선관위', url: 'https://info.nec.go.kr' },
  { name: 'jumin.mois.go.kr', label: '행안부', url: 'https://jumin.mois.go.kr' },
  { name: 'sgis.kostat.go.kr', label: '통계청 SGIS', url: 'https://sgis.kostat.go.kr' },
  { name: 'data.go.kr', label: '공공데이터포털', url: 'https://www.data.go.kr' },
];

export function DisclaimerFooter() {
  return (
    <div className="dcl-footer" role="contentinfo">
      <span className="dcl-footer-badge">⚠️ 비공식 앱</span>
      <span className="dcl-footer-sep">|</span>
      <span className="dcl-footer-label">출처:</span>
      {SOURCES.map(({ name, label, url }, i) => (
        <span key={url}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="dcl-footer-link"
            aria-label={label}
          >
            {name}
          </a>
          {i < SOURCES.length - 1 && <span className="dcl-footer-dot"> · </span>}
        </span>
      ))}
    </div>
  );
}
