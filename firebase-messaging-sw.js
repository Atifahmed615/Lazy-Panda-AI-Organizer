// firebase-messaging-sw.js — Handles background push notifications from FCM.
// This file MUST live at the root of the hosting origin.

importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyABHSM6EFseBSxqKMajA0OPEoQd81KkJDM",
  authDomain: "gen-lang-client-0412969424.firebaseapp.com",
  projectId: "gen-lang-client-0412969424",
  storageBucket: "gen-lang-client-0412969424.firebasestorage.app",
  messagingSenderId: "428339420555",
  appId: "1:428339420555:web:8b040024cd3c039ca0638e"
});

const messaging = firebase.messaging();

// Handle background messages (when app is NOT in foreground)
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM SW] Background message received:', payload);

  const data = payload.data || {};
  const notifTitle = data.title || payload.notification?.title || '🐼 Lazy Panda';
  const notifBody  = data.body  || payload.notification?.body  || 'You have a notification.';

  const notificationOptions = {
    body: notifBody,
    icon: './icon.png',
    badge: './icon.png',
    tag: data.tag || 'panda-push-' + Date.now(),
    data: data,
    requireInteraction: data.requireInteraction === 'true',
    actions: data.actionLabel ? [
      { action: 'open', title: data.actionLabel }
    ] : []
  };

  return self.registration.showNotification(notifTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // If app is already open, focus it
      for (let client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});
