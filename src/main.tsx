import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppRouter } from './router/AppRouter'

declare const __APP_BUILD_TARGET__: string

const routerMode = 'react-router-dom/browser'
const baseUrl = import.meta.env.BASE_URL
const buildTarget = __APP_BUILD_TARGET__

console.info('[startup] App booting', {
  buildTarget,
  baseUrl,
  routerMode,
  dev: import.meta.env.DEV,
  prod: import.meta.env.PROD,
  href: window.location.href,
})

window.addEventListener('error', (event) => {
  const target = event.target
  if (
    target instanceof HTMLScriptElement ||
    target instanceof HTMLLinkElement ||
    target instanceof HTMLImageElement
  ) {
    const assetUrl =
      target instanceof HTMLLinkElement ? target.href :
      target instanceof HTMLImageElement ? target.src :
      target.src

    console.error('[startup] Asset load failed', {
      tag: target.tagName,
      assetUrl,
      baseUrl,
      buildTarget,
    })
    return
  }

  console.error('[startup] Unhandled window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  })
}, true)

window.addEventListener('unhandledrejection', (event) => {
  console.error('[startup] Unhandled promise rejection', event.reason)
})

console.info('[startup] Root element', {
  found: Boolean(document.getElementById('root')),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
