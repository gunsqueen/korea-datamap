# Korea DataMap Android Packaging Guide

이 프로젝트는 기존 React + Vite 웹앱을 그대로 유지한 채 **Capacitor**로 Android 앱으로 감싸는 방식으로 구성되어 있습니다.

## 현재 구성

- 앱 이름: `Korea DataMap`
- 앱 아이디: `com.koreadatamap.app`
- Capacitor 설정 파일: `capacitor.config.ts`
- Android Studio 프로젝트: `android/`
- Capacitor가 읽는 웹 빌드 폴더: `dist/`

현재 프로젝트에는 다음이 이미 연결되어 있습니다.

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`
- `android/` 네이티브 프로젝트
- Android 런처 아이콘 리소스
- Android 스플래시 리소스

## 흰 화면 원인과 수정 내용

Android 앱에서 흰 화면이 나오던 주된 원인은 빌드 경로 분리 방식이었습니다.

점검 결과:

1. `capacitor.config.ts`의 `webDir`는 `dist`로 되어 있어 실제 빌드 폴더와 일치했습니다.
2. 문제는 `vite.config.ts`와 `package.json`의 기본 빌드 동작이었습니다.
3. 기존 `npm run build`는 사실상 GitHub Pages용 base 경로인 `/korea-datamap/` 기준 빌드였고, 이 결과물을 Android WebView에 넣으면 자산 경로가 깨질 수 있었습니다.
4. React Router는 현재 프로젝트에서 사용하지 않으므로 이번 빈 화면의 직접 원인은 아니었습니다.
5. `npx cap sync android` 자체는 정상 동작했고, 문제는 sync 이전에 어떤 base로 `dist/`를 만들었느냐였습니다.

수정 후 기준:

- `npm run build`는 Android용 base `/`로 빌드
- `npm run build:web`는 GitHub Pages용 base `/korea-datamap/`로 빌드
- `npm run cap:android`와 `npm run cap:sync`는 항상 Android용 빌드를 먼저 수행

즉, Android Studio 실행 전 아래 순서를 쓰면 WebView 자산 경로가 깨지지 않습니다.

```bash
npm run build
npx cap sync android
```

## 핵심 명령

Android 앱용 빌드:

```bash
npm run build
```

GitHub Pages용 웹 빌드:

```bash
npm run build:web
```

Android 앱용 별도 명령:

```bash
npm run build:mobile
```

Android 동기화:

```bash
npx cap sync android
```

Android Studio 열기:

```bash
npx cap open android
```

한 번에 처리:

```bash
npm run cap:sync
npm run cap:android
```

`package.json`에 등록된 스크립트는 다음과 같습니다.

- `npm run build`
- `npm run build:web`
- `npm run build:android`
- `npm run build:mobile`
- `npm run cap:sync`
- `npm run cap:android`

## Android Studio에서 실행하는 방법

### 1. 프로젝트 준비

```bash
cd /Users/sangwooklee/Documents/korea-datamap
npm install
npm run cap:android
```

위 명령은 아래 순서로 실행됩니다.

1. Android용 웹 빌드 생성
2. Capacitor가 `dist/` 내용을 `android/app/src/main/assets/public/`로 복사
3. Android Studio에서 `android/` 프로젝트 열기

### 2. Android Studio에서 눌러야 하는 것

1. Android Studio가 열리면 Gradle Sync가 끝날 때까지 기다립니다.
2. 상단 디바이스 선택 드롭다운에서 에뮬레이터 또는 연결된 기기를 선택합니다.
3. 상단의 `Run` 버튼(초록색 삼각형)을 누릅니다.

프로젝트를 수동으로 열어야 할 경우에는 Android Studio에서 `Open`을 누른 뒤 아래 폴더를 선택하면 됩니다.

`/Users/sangwooklee/Documents/korea-datamap/android`

## 에뮬레이터 실행 방법

1. Android Studio 상단 메뉴에서 `Tools` → `Device Manager`
2. `Create device`를 눌러 가상 디바이스를 만듭니다.
3. Pixel 계열 기기 하나와 최신 안정 버전 시스템 이미지를 선택합니다.
4. 생성한 에뮬레이터의 재생 버튼을 눌러 실행합니다.
5. 앱 실행 시 상단 `Run` 버튼으로 해당 에뮬레이터를 선택합니다.

## 실제 안드로이드폰 연결 방법

1. 휴대폰에서 개발자 옵션을 활성화합니다.
2. `USB debugging`을 켭니다.
3. USB로 Mac에 연결합니다.
4. 휴대폰에 디버깅 허용 팝업이 뜨면 허용합니다.
5. Android Studio 상단 디바이스 목록에 휴대폰이 나타나면 선택 후 `Run`을 누릅니다.

ADB가 설치된 경우 터미널에서 연결 확인도 가능합니다.

```bash
adb devices
```

## 코드 수정 후 앱에 다시 반영하는 방법

웹 코드를 수정한 뒤에는 아래 순서로 반영합니다.

```bash
npm run build
npx cap sync android
npx cap open android
```

이미 Android Studio가 열려 있다면 `open`은 다시 하지 않아도 됩니다.

보통은 아래 한 줄이면 충분합니다.

```bash
npm run cap:android
```

## APK / AAB 만드는 방법

### 디버그 APK

Android Studio에서:

1. `Build`
2. `Build Bundle(s) / APK(s)`
3. `Build APK(s)`

출력 위치:

`android/app/build/outputs/apk/debug/app-debug.apk`

### 배포용 AAB

Android Studio에서:

1. `Build`
2. `Generate Signed Bundle / APK`
3. `Android App Bundle` 선택
4. 키스토어를 생성하거나 기존 키스토어를 선택
5. Release 빌드 진행

출력 위치:

`android/app/build/outputs/bundle/release/app-release.aab`

## 아이콘 / 스플래시 기본 구조

현재 Android 프로젝트에는 기본 placeholder 리소스가 이미 들어 있습니다.

- 런처 아이콘 위치: `android/app/src/main/res/mipmap-*`
- 스플래시 이미지 위치: `android/app/src/main/res/drawable*`

교체용 원본 placeholder 파일도 추가해 두었습니다.

- `assets/mobile/icon-source.svg`
- `assets/mobile/splash-source.svg`
- `assets/mobile/README.md`

추천 교체 방식:

1. 위 SVG를 실제 디자인으로 교체
2. PNG로 export
3. Android Studio의 `Image Asset` 또는 외부 생성 도구로 `mipmap-*` 아이콘 갱신
4. 스플래시 이미지는 `drawable*`의 `splash.png` 교체
5. `npx cap sync android` 재실행

웹 PWA 아이콘은 아래 파일을 사용합니다.

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`

## 환경 변수 / API 점검

현재 앱은 `VITE_*` 환경 변수를 사용합니다. 이 값들은 빌드 시 클라이언트 번들에 포함됩니다.

현재 확인된 항목:

- `VITE_DATA_MODE`
- `VITE_BOUNDARY_MODE`
- `VITE_SGIS_CONSUMER_KEY`
- `VITE_SGIS_CONSUMER_SECRET`
- `VITE_MOIS_API_KEY`
- `VITE_NEC_API_KEY`

주의 사항:

1. `VITE_*` 값은 비밀값으로 취급하면 안 됩니다. Android 앱 안에도 포함됩니다.
2. 현재 앱은 `fetch` 기반으로 외부 API를 직접 호출합니다.
3. Android WebView에서는 Capacitor 설정상 `https` 스킴을 사용하므로 secure origin 기반 동작은 유지됩니다.
4. 다만 외부 API가 `Origin`, `Referer`, User-Agent, 앱/WebView 환경을 엄격히 검사하면 실기기에서 차이가 생길 수 있습니다.
5. 현재 AndroidManifest에는 `INTERNET` 권한이 포함되어 있어 네트워크 호출 자체는 가능합니다.

즉, 구조적으로는 Android WebView에서도 동작 가능한 형태입니다. 다만 API 제공처 정책이 바뀌면 실기기에서 별도 검증이 필요합니다.

## 개발 모드 진단 로그

앱 시작 시 브라우저 콘솔 또는 Android Studio Logcat/Chrome remote inspect에서 아래 항목이 출력되도록 추가했습니다.

- 현재 build target
- 현재 `BASE_URL`
- 현재 router mode
- root element 존재 여부
- asset load 실패 여부
- 처리되지 않은 에러 / Promise rejection

현재 프로젝트의 router mode는 `none`입니다. React Router는 사용하지 않습니다.

로그 예시:

```text
[startup] App booting { buildTarget: "android", baseUrl: "/", routerMode: "none", ... }
[startup] Root element { found: true }
[startup] Asset load failed { tag: "SCRIPT", assetUrl: "...", ... }
```

## 기능 유지 범위

Capacitor는 웹앱을 그대로 감싸므로, 아래 기능은 같은 빌드 결과를 Android 앱 안에서 사용합니다.

- 첫 화면 전국 지도
- 시도 → 시군구 → 읍면동 drill-down
- 인구 통계 패널
- 선거 패널
- 검색
- Sources 페이지

이번 작업에서는 기능 로직을 바꾸지 않고, 기존 웹앱 빌드를 Android 프로젝트에 연결하는 데 집중했습니다.

## 이번 작업 기준 검증 결과

성공 확인:

- `npm run build`
- `npm run build:web`
- `npm run build:mobile`
- `npx cap sync android`
- `npx cap open android`

확인된 상태:

- Android Studio에서 열 수 있는 `android/` 프로젝트가 존재함
- Capacitor가 `dist/` 웹 빌드를 Android asset으로 복사함
- 기존 웹앱 빌드도 계속 정상 동작함

실기기/에뮬레이터 UI 동작 자체는 이 환경에서 직접 누를 수 없으므로 Android Studio에서 한 번 더 실행 확인하면 됩니다.
