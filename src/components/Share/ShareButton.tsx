import { useCallback, useEffect, useState } from 'react';
import { Share2, Check } from 'lucide-react';

type ShareState = 'idle' | 'shared' | 'copied' | 'manual' | 'error';

interface ShareButtonProps {
  title?: string;
  className?: string;
  ariaLabel?: string;
}

function isNativeCapacitor(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

async function nativeShare(url: string, title: string): Promise<boolean> {
  if (!isNativeCapacitor()) return false;
  try {
    const mod = await import('@capacitor/share');
    await mod.Share.share({ url, title });
    return true;
  } catch (err) {
    console.warn('[share] native share failed', err);
    return false;
  }
}

async function webShare(url: string, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('share' in navigator)) return false;
  try {
    await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
      url,
      title,
    });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return true;
    console.warn('[share] web share failed', err);
    return false;
  }
}

async function clipboardCopy(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (err) {
    console.warn('[share] clipboard failed', err);
  }
  return false;
}

function legacyClipboardCopy(url: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    textarea.style.top = '0';
    textarea.style.left = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch (err) {
    console.warn('[share] legacy clipboard failed', err);
    return false;
  }
}

function manualCopyPrompt(url: string): boolean {
  try {
    window.prompt('이 URL을 복사하세요', url);
    return true;
  } catch (err) {
    console.warn('[share] manual prompt failed', err);
    return false;
  }
}

export function ShareButton({ title = 'Korea DataMap', className, ariaLabel }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const handleClick = useCallback(async () => {
    const url = window.location.href;

    if (await nativeShare(url, title)) {
      setState('shared');
      return;
    }

    if (await webShare(url, title)) {
      setState('shared');
      return;
    }

    if (await clipboardCopy(url)) {
      setState('copied');
      return;
    }

    if (legacyClipboardCopy(url)) {
      setState('copied');
      return;
    }

    if (manualCopyPrompt(url)) {
      setState('manual');
      return;
    }

    setState('error');
  }, [title]);

  const feedback =
    state === 'copied' ? 'URL 복사됨' :
    state === 'shared' ? '공유됨' :
    state === 'manual' ? 'URL 확인창 열림' :
    state === 'error' ? '공유 실패' : null;

  return (
    <button
      type="button"
      className={className ?? 'share-btn'}
      onClick={handleClick}
      aria-label={ariaLabel ?? '현재 페이지 URL 공유'}
      title="URL 공유"
    >
      {state === 'copied' || state === 'shared' ? (
        <Check size={16} strokeWidth={2.5} />
      ) : (
        <Share2 size={16} strokeWidth={2} />
      )}
      {feedback && <span className="share-btn-feedback">{feedback}</span>}
    </button>
  );
}
