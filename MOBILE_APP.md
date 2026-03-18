# Korea DataMap — 모바일 앱 가이드

> React + Vite 웹앱을 **Capacitor**로 감싸 Android/iOS 앱으로 패키징하는 방법을 안내합니다.

---

## 앱 구조 개요

```
웹앱 (React + Vite)
    ↓  npm run build:mobile  (VITE_BASE_PATH=/)
dist/ 폴더
    ↓  npx cap sync
android/ (또는 ios/) 네이티브 프로젝트
    ↓  Android Studio / Xcode
APK / AAB / IPA
```

- **Capacitor** 방식을 선택한 이유: 기존 React 코드 수정 최소화, 완성된 웹앱을 WebView로 래핑, 나중에 카메라·GPS 등 네이티브 기능 추가도 가능

---

## 필요한 도구

| 도구 | 필요 여부 | 설치 방법 |
|------|----------|----------|
| Node.js 18+ | 필수 | https://nodejs.org |
| Android Studio | Android 필수 | https://developer.android.com/studio |
| JDK 17+ | Android 필수 | Android Studio 설치 시 포함 |
| Xcode 15+ | iOS 필수 (macOS만) | Mac App Store |
| CocoaPods | iOS 필수 | `sudo gem install cocoapods` |

---

## Android 앱 실행하기

### 1. 웹 빌드 + 동기화

```bash
npm run cap:android
# = npm run build:mobile → npx cap sync android → npx cap open android
```

위 명령 실행 시 **Android Studio**가 자동으로 열립니다.

### 2. Android Studio에서 실행

1. Android Studio가 열리면 Gradle sync가 자동으로 시작됩니다 (1~3분 소요)
2. 상단 ▶ (Run) 버튼 클릭
3. 에뮬레이터 또는 연결된 기기 선택
4. 앱 실행 확인

> **처음 실행 시**: File → Project Structure → SDK Location에서 JDK 경로를 설정해야 할 수 있습니다.

---

## APK 만들기 (설치 파일)

Android Studio에서:
1. **Build** 메뉴 → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. 빌드 완료 후 `android/app/build/outputs/apk/debug/` 폴더에 `app-debug.apk` 생성
3. 이 파일을 Android 기기에 전송 후 설치

---

## AAB 만들기 (Google Play 배포용)

1. **Build** → **Generate Signed Bundle / APK**
2. **Android App Bundle** 선택
3. 서명 키스토어 생성/선택
4. Release 빌드 진행
5. `android/app/build/outputs/bundle/release/app-release.aab` 생성

---

## iOS 앱 만들기 (Mac + Xcode 필요)

```bash
# iOS 플랫폼 추가 (최초 1회)
npx cap add ios

# 빌드 + 동기화 + Xcode 열기
npm run cap:ios
```

Xcode에서:
1. 팀(Team) 설정: Signing & Capabilities → Team
2. ▶ 버튼으로 시뮬레이터 또는 실제 기기에서 실행
3. Archive로 App Store 배포 파일 생성

---

## 웹 변경사항 앱에 반영하기

코드를 수정한 후:

```bash
npm run cap:sync
# = npm run build:mobile + npx cap sync (전 플랫폼)
```

또는 Android만:
```bash
npm run build:mobile && npx cap sync android
```

---

## 빌드 스크립트 정리

| 명령 | 설명 |
|------|------|
| `npm run build` | GitHub Pages용 웹 빌드 (`base: /korea-datamap/`) |
| `npm run build:mobile` | 모바일용 웹 빌드 (`base: /`) |
| `npm run cap:sync` | 모바일 빌드 + 전 플랫폼 동기화 |
| `npm run cap:android` | 모바일 빌드 + Android Studio 열기 |
| `npm run cap:ios` | 모바일 빌드 + Xcode 열기 |

---

## 앱 정보

| 항목 | 값 |
|------|-----|
| App ID | `com.koreadatamap.app` |
| App Name | `Korea DataMap` |
| webDir | `dist` |
| Android scheme | `https` |

---

## 앱 아이콘 / 스플래시 변경

현재 placeholder 아이콘: `public/icons/icon-192.png`, `icon-512.png`

실제 아이콘으로 교체하려면:
1. `public/icons/` 폴더의 PNG 파일을 원하는 이미지로 교체
2. `npm run cap:sync` 실행

Android 네이티브 아이콘 (앱 서랍에 표시되는 아이콘)은 Android Studio → `android/app/src/main/res/` 에서 관리합니다.

---

## 자주 발생하는 오류

### `Unable to locate a Java Runtime`
→ JDK 설치 필요. Android Studio 설치 후 JDK 경로를 설정하거나
→ `brew install --cask temurin` (Homebrew, macOS)

### `Gradle sync failed`
→ Android Studio에서 File → Sync Project with Gradle Files

### `cannot find symbol: Capacitor`
→ `npx cap sync android` 재실행

### iOS: `No profiles for ... were found`
→ Xcode에서 Apple ID 로그인 후 자동 서명 활성화

### 지도가 흰 화면으로 표시
→ `npm run build:mobile` 후 `npx cap sync` 재실행
→ `VITE_BASE_PATH=/` 로 빌드했는지 확인

---

## 환경 변수

`.env` 파일의 API 키는 빌드 시 번들에 포함됩니다.
모바일 앱에서도 동일한 `.env` 파일이 사용됩니다.

```env
VITE_DATA_MODE=mock
VITE_BOUNDARY_MODE=mock
VITE_SGIS_CONSUMER_KEY=...
```

---

## 지원 기능

| 기능 | 모바일 지원 |
|------|------------|
| 전국 지도 표시 | ✅ |
| 시도→시군구→읍면동 drill-down | ✅ |
| 인구 데이터 패널 | ✅ |
| 선거 데이터 패널 | ✅ |
| 지역 검색 | ✅ |
| 지역 비교 | ✅ |
| 테마맵 | ✅ |
| 오프라인 동작 | ✅ (mock 모드) |
