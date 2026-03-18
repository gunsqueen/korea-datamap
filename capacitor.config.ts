import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.koreadatamap.app',
  appName: 'Korea DataMap',
  webDir: 'dist',
  server: {
    // https 스킴 사용 - localStorage, CORS 등 보안 정책 정상 동작
    androidScheme: 'https',
  },
  android: {
    // 상태바를 반투명으로 설정 (노치/펀치홀 대응)
    backgroundColor: '#1a1a2e',
  },
};

export default config;
