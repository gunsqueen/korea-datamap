# Korea DataMap

전국 행정구역, 인구, 선거 데이터를 지도 기반으로 탐색하는 React + Vite 앱입니다. 웹앱으로 동작하며, 같은 코드를 Capacitor로 감싸 Android 앱으로도 빌드할 수 있습니다.

## 기술 스택

- React
- Vite
- TypeScript
- Leaflet
- Recharts
- Capacitor

## 프로젝트 구조

- 웹앱 소스: `src/`
- 정적 데이터: `src/data/`
- Android 네이티브 프로젝트: `android/`
- Capacitor 설정: `capacitor.config.ts`
- Android 패키징 가이드: `MOBILE_APP.md`

## 설치

```bash
cd /Users/sangwooklee/Documents/korea-datamap
npm install
```

## 웹 개발 서버

```bash
npm run dev
```

## 웹 배포용 빌드

GitHub Pages 기준 빌드입니다.

```bash
npm run build:web
```

## Android 앱용 빌드

Android WebView는 루트 경로 `/` 기준 자산을 읽어야 하므로, 웹 배포용 빌드와 별도로 Android용 빌드를 사용합니다.

```bash
npm run build:android
```

기본 `npm run build`도 Android용 빌드와 동일합니다.

## Capacitor / Android

현재 프로젝트에는 Capacitor와 Android 플랫폼이 이미 추가되어 있습니다.

- App ID: `com.koreadatamap.app`
- App Name: `Korea DataMap`
- Web assets directory: `dist`

최신 웹 코드를 Android 프로젝트로 반영하려면:

```bash
npm run cap:sync
```

이 명령은 아래를 자동으로 수행합니다.

1. Android용 웹 빌드 생성
2. `dist/`를 `android/app/src/main/assets/public/`으로 복사
3. Capacitor 설정과 플러그인 동기화

## Android Studio에서 열기

가장 간단한 방법:

```bash
npm run cap:android
```

이 명령은:

1. Android용 빌드
2. `cap sync android`
3. Android Studio 열기

수동으로 열려면 Android Studio에서 아래 폴더를 엽니다.

- `/Users/sangwooklee/Documents/korea-datamap/android`

## Android Studio에서 해야 할 일

1. Android Studio가 열리면 Gradle Sync가 끝날 때까지 기다립니다.
2. `Tools > Device Manager`에서 에뮬레이터를 만들거나, USB 디버깅이 켜진 실제 기기를 연결합니다.
3. 상단 기기 선택 드롭다운에서 실행 대상을 고릅니다.
4. 상단 `Run` 버튼을 눌러 앱을 실행합니다.

## APK / AAB 만들기

### 디버그 APK

Android Studio에서:

1. `Build`
2. `Build Bundle(s) / APK(s)`
3. `Build APK(s)`

출력 예시:

- `android/app/build/outputs/apk/debug/app-debug.apk`

### 스토어 배포용 AAB

Android Studio에서:

1. `Build`
2. `Generate Signed Bundle / APK`
3. `Android App Bundle`
4. 키스토어 생성 또는 선택
5. Release 빌드 진행

출력 예시:

- `android/app/build/outputs/bundle/release/app-release.aab`

## 코드 수정 후 Android 앱에 다시 반영하는 방법

웹 코드를 바꾼 뒤에는 아래 순서가 필요합니다.

```bash
npm run cap:sync
```

이미 Android Studio가 열려 있으면 sync 후 다시 Run 하면 됩니다.

## 현재 확인된 상태

- `npm run build:android` 성공
- `npm run cap:sync` 성공
- 최신 전국 선거 수정 내용까지 Android 자산으로 동기화 완료

## 참고

- 웹 배포용과 Android용은 Vite `base`가 다릅니다.
  - 웹: `/korea-datamap/`
  - Android: `/`
- Android 관련 상세 설명은 `MOBILE_APP.md`에 더 자세히 정리되어 있습니다.
