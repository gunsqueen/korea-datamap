import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildTarget = process.env.BUILD_TARGET ?? 'android'
const base = buildTarget === 'web' ? '/korea-datamap/' : '/'

export default defineConfig({
  plugins: [react()],
  base,
  define: {
    __APP_BUILD_TARGET__: JSON.stringify(buildTarget),
  },
  server: {
    proxy: {
      '/api/nec': {
        target: 'https://apis.data.go.kr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nec/, ''),
      },
    },
  },
})
