import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

// 1. MANTENEMOS TUS VARIABLES DE VITE (Esto está perfecto y súper seguro)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 2. Creamos el adaptador para usar la memoria nativa del teléfono en lugar de la web
const capacitorStorage = {
  getItem: async (key: string) => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string) => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string) => {
    await Preferences.remove({ key });
  },
};

// 3. Inyectamos el almacenamiento a tu cliente actual
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: capacitorStorage, // 👈 Obligamos a Supabase a usar el disco duro del móvil
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});