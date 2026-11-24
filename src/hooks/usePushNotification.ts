import { useCallback, useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isIosNonStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  return isIos && !isStandalone;
}

export function usePushNotification(showToast: (text: string) => void) {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    let active = true;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setIsSubscribed(Boolean(sub));
      })
      .catch(() => {
        // ignore registration errors on unsupported environments
      });
    return () => {
      active = false;
    };
  }, [isSupported]);

  const togglePush = useCallback(async () => {
    if (isIosNonStandalone()) {
      showToast('iPhone에서는 공유 버튼 → 홈 화면에 추가 후 알림을 켤 수 있어요');
      return;
    }
    if (!isSupported) {
      showToast('이 브라우저는 푸시 알림을 지원하지 않아요');
      return;
    }

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setIsSubscribed(false);
        showToast('썬데이 메이플 푸시 알림을 껐어요');
        return;
      }

      if (Notification.permission === 'denied') {
        showToast('브라우저 설정에서 알림 권한을 허용해 주세요');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('알림 권한이 허용되지 않았어요');
        return;
      }

      const keyRes = await fetch('/api/push/vapid-public-key');
      if (!keyRes.ok) {
        showToast('푸시 서버가 아직 준비되지 않았어요');
        return;
      }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = sub.toJSON();
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (!saveRes.ok) {
        await sub.unsubscribe().catch(() => {});
        showToast('알림 등록에 실패했어요');
        return;
      }

      setIsSubscribed(true);
      showToast('썬데이 메이플 알림이 켜졌어요!');
    } catch {
      showToast('알림 설정 중 오류가 발생했어요');
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, showToast]);

  return { isSupported, isSubscribed, isLoading, togglePush };
}
