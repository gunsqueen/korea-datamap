# Mobile Branding Assets

이 폴더는 Android 앱 아이콘과 스플래시를 나중에 교체하기 위한 원본 placeholder 자산 위치입니다.

포함 파일:

- `icon-source.svg`
- `splash-source.svg`

권장 작업 순서:

1. SVG를 실제 디자인으로 교체
2. 필요한 PNG 해상도로 export
3. Android Studio의 `Image Asset`으로 런처 아이콘 갱신
4. `android/app/src/main/res/drawable*/splash.png` 교체
5. `npx cap sync android` 실행

웹 아이콘은 별도로 아래 파일도 함께 교체하면 됩니다.

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
