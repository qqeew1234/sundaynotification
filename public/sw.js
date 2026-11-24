self.addEventListener('push', (event) => {
  let payload = {
    title: '일요일 요정 · 썬데이 메이플',
    body: '새로운 썬데이 메이플 이벤트가 도착했어요!',
    icon: '/favicon.png',
    badge: '/favicon.png',
    image: '',
    url: '/',
    noticeUrl: '',
    tag: 'sunday-maple',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = { ...payload, ...parsed };
      }
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/favicon.png',
    badge: payload.badge || '/favicon.png',
    tag: payload.tag || 'sunday-maple',
    renotify: true,
    data: {
      url: payload.url || '/',
      noticeUrl: payload.noticeUrl || '',
    },
  };

  if (payload.image && /^https:\/\//i.test(payload.image)) {
    options.image = payload.image;
  }

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/';
  let targetUrl = self.location.origin + '/';
  try {
    const resolved = new URL(rawUrl, self.location.origin);
    if (resolved.origin === self.location.origin || resolved.protocol === 'https:') {
      targetUrl = resolved.toString();
    }
  } catch {
    // fallback to origin root
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
