import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JWT } from 'https://esm.sh/google-auth-library@9'

serve(async (req: Request) => {
  console.log("🔔 [V1] Configurando notificación personalizada...");
  
  try {
    const payload = await req.json();
    const record = payload.record;
    
    // CORRECCIÓN: Aquí es donde viene el nombre de la tabla desde el SQL
    const nombreTabla = payload.tabla; 
    
    if (!record) return new Response("No record", { status: 400 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. OBTENER LOS DATOS DEL CHOFER
    // Necesitamos consultar su perfil para saber su nombre exacto
    const { data: choferInfo } = await supabase
      .from('perfiles')
      .select('nombre_completo, fcm_token')
      .eq('id', record.chofer_id)
      .single();

    let tokenDestino = null;
    let nombreRemitente = '';

    // 2. ¿QUIÉN ENVÍA Y A QUIÉN VA DIRIGIDO?
    if (record.remitente === 'admin') {
       // Envía el Admin -> Va para el Chofer
       tokenDestino = choferInfo?.fcm_token;
       nombreRemitente = 'Central Operaciones';
    } else {
       // Envía el Chofer -> Va para el Admin
       const { data: adminInfo } = await supabase.from('perfiles').select('fcm_token').eq('rol', 'admin').limit(1).single();
       tokenDestino = adminInfo?.fcm_token;
       // Cogemos el nombre de la base de datos (o ponemos "Chofer" si por algún error no hay nombre)
       nombreRemitente = choferInfo?.nombre_completo || 'Chofer';
    }

    if (!tokenDestino) {
        console.log("⚠️ Sin token destino");
        return new Response("Sin token", { status: 200 });
    }

    // 3. CREAR EL TÍTULO DINÁMICO
    // Definimos si es Chat o Servicio
    const contextoMensaje = nombreTabla === 'chat_directo' ? 'Chat Operaciones' : 'Gestión de Servicio';
    
    // Unimos el nombre de quien envía y desde dónde (Ej: "Juan Navarro • Chat Operaciones")
    const tituloPush = `${nombreRemitente} • ${contextoMensaje}`;

    // 4. LEER LA CUENTA DE SERVICIO (V1)
    const serviceAccountRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if(!serviceAccountRaw) return new Response("Falta service account", { status: 500 });
    const serviceAccount = JSON.parse(serviceAccountRaw);

    // 5. GENERAR EL PASE VIP TEMPORAL (OAUTH2)
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const tokens = await jwtClient.authorize();

    // 6. ENVIAR POR LA NUEVA RUTA V1
    console.log(`🚀 Enviando Push: [${tituloPush}]`);
    const fcmRes = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.access_token}`
      },
      body: JSON.stringify({
        message: {
          token: tokenDestino,
          notification: {
            title: tituloPush,    // <--- Aquí inyectamos nuestro título personalizado
            body: record.mensaje  // <--- Aquí va el texto que escriben
          }
        }
      })
    });

  
    const fcmData = await fcmRes.json();
    return new Response(JSON.stringify({ success: true, fcmData }), { headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("❌ [ERROR]", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
})