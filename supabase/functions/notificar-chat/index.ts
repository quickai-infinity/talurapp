import { serve } from "https://deno.land/std@0.182.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Utilidad para autenticar con Firebase HTTP v1 usando el Service Account
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";

const FIREBASE_SERVICE_ACCOUNT = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "{}");

async function getFirebaseAccessToken() {
  const jwtPayload = {
    iss: FIREBASE_SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };

  const privateKey = FIREBASE_SERVICE_ACCOUNT.private_key;
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    jwtPayload,
    privateKey
  );

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const data = await response.json();
  return data.access_token;
}

serve(async (req) => {
  try {
    // 1. Recibir el payload exacto del webhook sin alterar los parámetros originales
    const payload = await req.json();
    const record = payload.record;

    // Validar que sea una inserción válida
    if (!record || !record.receptor_id || !record.mensaje) {
      return new Response(JSON.stringify({ error: "Faltan parámetros requeridos en el record" }), { status: 400 });
    }

    // 2. Inicializar cliente de Supabase para buscar el Token del chofer
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: perfil, error } = await supabaseClient
      .from('perfiles')
      .select('fcm_token')
      .eq('id', record.receptor_id)
      .single();

    if (error || !perfil?.fcm_token) {
      return new Response(JSON.stringify({ message: "El usuario no tiene un fcm_token registrado." }), { status: 200 });
    }

    // 3. Preparar la notificación para Firebase
    const accessToken = await getFirebaseAccessToken();
    const projectId = FIREBASE_SERVICE_ACCOUNT.project_id;

    const fcmMessage = {
      message: {
        token: perfil.fcm_token,
        notification: {
          title: "Nuevo mensaje de Base",
          body: record.mensaje
        },
        data: {
          chat_id: record.id || "",
          remitente_id: record.remitente_id || ""
        },
        android: {
          priority: "high",
          notification: {
            sound: "default"
          }
        }
      }
    };

    // 4. Enviar a Firebase Cloud Messaging
    const fcmResponse = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fcmMessage)
    });

    if (!fcmResponse.ok) {
      const errorText = await fcmResponse.text();
      throw new Error(`Error de Firebase: ${errorText}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});