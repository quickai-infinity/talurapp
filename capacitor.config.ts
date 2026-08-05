import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.talur.app',
  appName: 'TalurApp',
  webDir: 'dist', // <-- Coma añadida aquí
  // bundledWebRuntime ha sido eliminado por completo
  plugins: {
    PushNotifications: {
      // Obliga al sistema a mostrar banner, sonar y vibrar aunque la app esté abierta
      presentationOptions: ["badge", "sound", "alert"]
    }
  }
};

export default config;