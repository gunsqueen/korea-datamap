import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// VITE_BASE_PATH=/ → 모바일 앱 빌드 (Capacitor)
// VITE_BASE_PATH 미설정 → GitHub Pages 빌드 (기본값)
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/korea-datamap/',
})
