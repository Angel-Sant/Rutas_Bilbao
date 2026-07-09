const CACHE_NAME = "transporte-bilbao-v1";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

// Estrategia: red primero (para que el mapa/Firebase siempre estén al día),
// y si no hay conexión, cae al app shell guardado en caché.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

/* ---------- Notificaciones push (Firebase Cloud Messaging) ---------- */
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAB17etP2RcTdgUGN0SPVxASsdKqomS2zU",
  authDomain: "rutas-bilbao.firebaseapp.com",
  databaseURL: "https://rutas-bilbao-default-rtdb.firebaseio.com",
  projectId: "rutas-bilbao",
  storageBucket: "rutas-bilbao.firebasestorage.app",
  messagingSenderId: "1024214893395",
  appId: "1:1024214893395:web:8873b37286630b4c2fd7a6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "Transporte Bilbao";
  const options = {
    body: payload.notification?.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
  };
  self.registration.showNotification(title, options);
});
