import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record; // Los datos del mensaje insertado

    // 1. Conectar a la base de datos usando las variables de entorno de Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let tokenDestino = null;

    // 2. Lógica para saber a quién pitarle el teléfono
    if (record.remitente === 'admin') {
       // El dueño escribió: buscar el token FCM del chofer
       const { data } = await supabase.from('perfiles').select('fcm_token').eq('id', record.chofer_id).single()
       tokenDestino = data?.fcm_token;
    } else {
       // El chofer escribió: buscar el token FCM del dueño (rol: admin)
       const { data } = await supabase.from('perfiles').select('fcm_token').eq('rol', 'admin').limit(1).single()
       tokenDestino = data?.fcm_token;
    }

    // Si el usuario no ha dado permisos o borró la app, no hay token
    if (!tokenDestino) {
        return new Response("Usuario sin token de Firebase", { status: 200 })
    }

    // 3. Ejecutar la llamada a la puerta VIP de Firebase
    // Necesitarás guardar tu "Server Key" de Firebase en las variables de entorno de Supabase
    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY')! 
    
    const titulo = record.tabla === 'chat_directo' ? 'Mensaje Operativo' : 'Servicio Asignado';

    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `key=${firebaseServerKey}`
      },
      body: JSON.stringify({
        to: tokenDestino,
        notification: {
          title: titulo,
          body: record.mensaje,
          sound: 'default'
        }
      })
    })

    return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})