import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const buildTarget = process.env.BUILD_TARGET ?? 'android'
const base = buildTarget === 'web' ? '/korea-datamap/' : '/'

function necInfoProxyPlugin(): Plugin {
  return {
    name: 'nec-info-proxy',
    configureServer(server) {
      server.middlewares.use('/api/nec-info', async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }

          const upstream = await fetch(`https://info.nec.go.kr${req.url ?? ''}`, {
            method: req.method,
            headers: {
              'content-type': req.headers['content-type'] ?? 'application/x-www-form-urlencoded',
              'user-agent': 'Mozilla/5.0',
            },
            body: req.method === 'GET' || req.method === 'HEAD'
              ? undefined
              : Buffer.concat(chunks),
          });

          res.statusCode = upstream.status;
          res.setHeader('content-type', upstream.headers.get('content-type') ?? 'text/html; charset=utf-8');
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.end(error instanceof Error ? error.message : 'NEC info proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), necInfoProxyPlugin()],
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
