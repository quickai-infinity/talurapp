importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// PEGA AQUÍ TU firebaseConfig DEL PASO 1
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "talurapp-xxx.firebaseapp.com",
  projectId: "talurapp-xxx",
  storageBucket: "talurapp-xxx.appspot.com",
  messagingSenderId: "38765...",
  appId: "1:38765..."
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Esto controla cómo se ve la notificación cuando la pestaña está CERRADA
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Mensaje recibido en segundo plano ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icono-talur.png' // Opcional: Pon la ruta al logo de tu app si lo tienes
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});