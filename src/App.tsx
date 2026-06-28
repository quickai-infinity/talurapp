import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Download, Users, Clock, Car, ShieldCheck, LogOut, X, MessageSquare, Map as MapIcon, Edit2, Power, Calculator } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Poimport { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';pup } from 'react-leaflet';
import { Geolocation } from '@capacitor/geolocation';

// ==========================================
// FIX VISUAL DEL MAPA Y MOTOR DE AUTO-CENTRADO
// ==========================================
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

function AutoCentrarMapa({ posicion }: { posicion: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(posicion, map.getZoom(), { animate: true, duration: 1.5 });
  }, [posicion, map]);
  return null;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-yellow-500 font-mono">CARGANDO SISTEMA VIP...</div>;
  if (!session) return <LoginScreen />;
  return <RoleController session={session} />;
}

// ==========================================
// PANTALLA DE LOGIN
// ==========================================
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111] border border-zinc-800 p-8 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">TALUR</h1>
          <p className="text-yellow-500 font-mono text-xs tracking-widest mt-1">LUXURY CARS FLEET</p>
        </div>
        {error && <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded mb-4 text-sm text-center">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">Correo Corporativo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-yellow-500" required />
          </div>
          <div>
            <label className="block text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black border border-zinc-800 text-white px-4 py-3 rounded-lg focus:outline-none focus:border-yellow-500" required />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded-lg uppercase tracking-widest transition-all mt-4 disabled:opacity-50">
            {loading ? 'Verificando...' : 'Acceder al Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// CONTROLADOR DE ROLES
// ==========================================
function RoleController({ session }: { session: any }) {
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      const { data } = await supabase.from('perfiles').select('rol').eq('id', session.user.id).single();
      if (data) setRol(data.rol);
      setLoading(false);
    }
    fetchRole();
  }, [session]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-yellow-500 font-mono">LEYENDO CREDENCIALES...</div>;
  if (rol === 'admin') return <AdminDashboard session={session} />;
  if (rol === 'chofer') return <DriverApp session={session} />;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
      <p className="text-red-500 mb-4">Error: Perfil no asignado.</p>
      <button onClick={() => supabase.auth.signOut()} className="border border-zinc-700 px-4 py-2 rounded">Cerrar Sesión</button>
    </div>
  );
}

// ==========================================
// DASHBOARD DEL DUEÑO (ADMIN - CON IA Y MÉTRICAS AJUSTADAS)
// ==========================================
function AdminDashboard({ session }: { session: any }) {
  const [choferes, setChoferes] = useState<any[]>([]);
  const [choferSeleccionado, setChoferSeleccionado] = useState<any>(null);

  // Estados para el Chat IA del Admin
  const [mensajeIA, setMensajeIA] = useState('');
  const [historialIA, setHistorialIA] = useState<{rol: string, texto: string}[]>([{rol: 'ia', texto: 'IA Central activada. ¿En qué te ayudo a analizar la flota?'}]);
  const [enviandoIA, setEnviandoIA] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChoferes();
    const radar = supabase
      .channel('monitor_choferes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, () => {
        fetchChoferes();
      })
      .subscribe();
    return () => { supabase.removeChannel(radar); };
  }, []);

  // Efecto para bajar el scroll del chat automáticamente
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [historialIA]);

  async function fetchChoferes() {
    const { data } = await supabase.from('perfiles').select('*').eq('rol', 'chofer');
    if (data) setChoferes(data);
  }

  const enviarMensajeIA = async () => {
    if (!mensajeIA.trim()) return;
    const nuevoHistorial = [...historialIA, { rol: 'user', texto: mensajeIA }];
    setHistorialIA(nuevoHistorial);
    setMensajeIA('');
    setEnviandoIA(true);

    try {
      const res = await fetch('https://panel1.quickai.agency/webhook/abogadoya-agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chofer: 'Administrador Central', mensaje: mensajeIA, ubicacion: 'Base Central' })
      });
      const data = await res.json();
      setHistorialIA([...nuevoHistorial, { rol: 'ia', texto: data.output || "Mensaje procesado" }]);
    } catch (e) {
      setHistorialIA([...nuevoHistorial, { rol: 'ia', texto: 'Error de conexión con la central n8n.' }]);
    }
    setEnviandoIA(false);
  };

  // CÁLCULOS DINÁMICOS PARA LAS TARJETAS
  const vehiculosActivos = choferes.filter(c => c.estado_actual === 'conectado').length;

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans p-6 relative">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabecera */}
        <div className="flex justify-between items-end border-b border-zinc-800 pb-6">
          <div>
            <h1 className="text-2xl font-black text-white tracking-wide">Centro de Operaciones VIP</h1>
            <p className="text-sm text-zinc-500 font-mono tracking-wide mt-1">Admin: <span className="text-yellow-500">{session.user.email}</span></p>
          </div>
          <div>
            <button onClick={() => supabase.auth.signOut()} className="border border-zinc-800 hover:bg-zinc-900 text-zinc-400 px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2">
              <LogOut className="w-4 h-4" /> Salir del Sistema
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas (Ajustadas a 3 columnas) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MetricCard icon={<Users />} title="Choferes Activos" value={`${vehiculosActivos} / ${choferes.length}`} />
          <MetricCard icon={<Car />} title="Vehículos en Ruta" value={vehiculosActivos.toString()} />
          <MetricCard icon={<ShieldCheck className="text-yellow-500" />} title="Estado Inspección" value="Auditable" highlight />
        </div>

        {/* REGISTRO DE NUEVOS CHOFERES */}
        <RegistroChofer onAdd={fetchChoferes} adminEmail={session.user.email} />

        {/* SECCIÓN INFERIOR: MONITOR + CHAT IA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Columna Izquierda (Monitor - Toma 2 tercios) */}
          <div className="lg:col-span-2 bg-[#0f0f0f] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
            <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="font-bold text-white uppercase text-xs tracking-widest flex items-center gap-2"><MapIcon className="w-4 h-4 text-emerald-500"/> Monitor de Telemetría</h3>
            </div>
            {choferes.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-sm flex-1 flex items-center justify-center">Sin choferes registrados en el sistema.</div>
            ) : (
              <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-zinc-800">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-500 uppercase bg-black border-b border-zinc-800 font-mono sticky top-0">
                    <tr>
                      <th className="px-6 py-4">Chofer Designado</th>
                      <th className="px-6 py-4 text-right">Estado Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {choferes.map((chofer) => (
                      <tr 
                        key={chofer.id} 
                        className="hover:bg-zinc-800/50 cursor-pointer transition-colors"
                        onClick={() => setChoferSeleccionado(chofer)}
                      >
                        <td className="px-6 py-4 font-bold text-white uppercase tracking-wider">{chofer.nombre_completo}</td>
                        <td className={`px-6 py-4 font-mono text-right font-bold tracking-widest ${chofer.estado_actual === 'conectado' ? 'text-emerald-500' : 'text-zinc-500'}`}>
                          {chofer.estado_actual}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Columna Derecha (Chat IA - Toma 1 tercio) */}
          <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
             <div className="p-4 bg-zinc-900/50 border-b border-zinc-800 flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <h3 className="font-bold text-white uppercase text-xs tracking-widest">Consultor IA</h3>
             </div>
             
             <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-zinc-800">
                {historialIA.map((msg, i) => (
                   <div key={i} className={`flex ${msg.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`p-3 rounded-lg text-xs leading-relaxed max-w-[85%] ${msg.rol === 'user' ? 'bg-yellow-500 text-black font-bold' : 'bg-zinc-800 text-zinc-200 border border-zinc-700'}`}>
                         {msg.texto}
                      </div>
                   </div>
                ))}
                {enviandoIA && <div className="text-zinc-500 text-[10px] italic uppercase tracking-widest">Procesando consulta...</div>}
                <div ref={chatEndRef} />
             </div>

             <div className="p-3 border-t border-zinc-800 bg-black flex gap-2">
               <input 
                 type="text" 
                 value={mensajeIA} 
                 onChange={e => setMensajeIA(e.target.value)} 
                 onKeyDown={(e) => e.key === 'Enter' && enviarMensajeIA()}
                 placeholder="Consultar al agente..." 
                 className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-2 text-xs text-white focus:border-yellow-500 focus:outline-none transition-colors" 
               />
               <button onClick={enviarMensajeIA} disabled={enviandoIA} className="bg-yellow-500 text-black px-4 rounded font-bold uppercase text-[10px] tracking-wider hover:bg-yellow-400 disabled:opacity-50">
                 Enviar
               </button>
             </div>
          </div>

        </div>
      </div>

      {choferSeleccionado && (
        <ModalExpediente 
          chofer={choferSeleccionado} 
          onClose={() => setChoferSeleccionado(null)} 
        />
      )}
    </div>
  );
}

// ==========================================
// COMPONENTE: MODAL DE EXPEDIENTE (ADMIN - TOTALMENTE EN VIVO CON RADAR GPS)
// ==========================================
function ModalExpediente({ chofer, onClose }: { chofer: any, onClose: () => void }) {
  // 1. ESTADOS DE POSICIÓN DINÁMICA (EL RADAR EN VIVO)
  const [posicionActual, setPosicionActual] = useState<[number, number]>(
    chofer.latitud && chofer.longitud ? [chofer.latitud, chofer.longitud] : [0, 0]
  );
  const [tieneUbicacion, setTieneUbicacion] = useState(
    chofer.latitud !== null && chofer.longitud !== null && chofer.latitud !== undefined
  );

  const [horas, setHoras] = useState(parseFloat(chofer.horas_acumuladas) || 0);
  
  // Estados para la Edición de Horas (Separado en H y M)
  const [editandoHoras, setEditandoHoras] = useState(false);
  const [inputEditH, setInputEditH] = useState(0);
  const [inputEditM, setInputEditM] = useState(0);
  
  const [vistaActual, setVistaActual] = useState<'mapa' | 'historial'>('mapa');
  const [historialJornadas, setHistorialJornadas] = useState<any[]>([]);
  const [minutosEnVivo, setMinutosEnVivo] = useState(0);

  // Chat
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');
  const mensajesEndRef = useRef<HTMLDivElement>(null);

  // Sincronización en Tiempo Real (Canales de Supabase)
  useEffect(() => {
    cargarDatos();

    // RADAR ACTIVO: Detecta los movimientos continuos del teléfono del chofer
    const canalRadar = supabase.channel(`radar_${chofer.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'perfiles', filter: `id=eq.${chofer.id}` }, (payload) => {
        if (payload.new.latitud && payload.new.longitud) {
          setPosicionActual([payload.new.latitud, payload.new.longitud]);
          setTieneUbicacion(true);
        }
      }).subscribe();

    const canalChat = supabase.channel(`chat_admin_${chofer.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_directo', filter: `chofer_id=eq.${chofer.id}` }, (payload) => {
        setMensajes((prev) => [...prev, payload.new]);
        setTimeout(() => mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }).subscribe();

    const canalJornadas = supabase.channel(`jornadas_admin_${chofer.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jornadas', filter: `chofer_id=eq.${chofer.id}` }, () => {
        cargarDatos();
      }).subscribe();

    // Limpieza de todos los canales al cerrar el modal
    return () => { 
      supabase.removeChannel(canalRadar); 
      supabase.removeChannel(canalChat); 
      supabase.removeChannel(canalJornadas); 
    };
  }, [chofer.id]);

  // Cronómetro interno para acumular minutos en vivo en la UI del administrador
  useEffect(() => {
    let intervalo: any;
    if (chofer.estado_actual === 'conectado') {
      intervalo = setInterval(() => setMinutosEnVivo(m => m + 1), 60000);
    } else {
      setMinutosEnVivo(0);
    }
    return () => clearInterval(intervalo);
  }, [chofer.estado_actual]);

  async function cargarDatos() {
    const { data: chatData } = await supabase.from('chat_directo').select('*').eq('chofer_id', chofer.id).order('creado_en', { ascending: true });
    if (chatData) { setMensajes(chatData); setTimeout(() => mensajesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }
    
    const { data: jornadasData } = await supabase.from('jornadas').select('*').eq('chofer_id', chofer.id).order('hora_inicio', { ascending: false });
    if (jornadasData) {
       setHistorialJornadas(jornadasData);
       const activa = jornadasData.find(j => j.hora_fin === null);
       if (activa) {
         const diff = new Date().getTime() - new Date(activa.hora_inicio).getTime();
         setMinutosEnVivo(Math.floor(diff / 60000));
       } else {
         setMinutosEnVivo(0);
       }
    }
  }

  const guardarHoras = async () => {
    const totalDecimal = inputEditH + (inputEditM / 60);
    const { error } = await supabase.from('perfiles').update({ horas_acumuladas: totalDecimal }).eq('id', chofer.id);
    if (!error) { 
       setHoras(totalDecimal); 
       setEditandoHoras(false); 
    } else {
       alert("Error al guardar en la base de datos.");
    }
  };

  const recalcularDesdeHistorial = async () => {
    let totalMs = 0;
    historialJornadas.forEach(j => {
      if (j.hora_fin) {
        totalMs += new Date(j.hora_fin).getTime() - new Date(j.hora_inicio).getTime();
      }
    });
    const totalCalculado = totalMs / (1000 * 60 * 60);
    const { error } = await supabase.from('perfiles').update({ horas_acumuladas: totalCalculado }).eq('id', chofer.id);
    if (!error) {
       setHoras(totalCalculado);
       setEditandoHoras(false);
    }
  };

  const enviarMensaje = async () => {
    if (!nuevoMensaje.trim()) return;
    const msg = nuevoMensaje;
    setNuevoMensaje('');
    await supabase.from('chat_directo').insert({ chofer_id: chofer.id, remitente: 'admin', mensaje: msg });
  };

  const descargarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Reporte Oficial de Operaciones - TALUR LUXURY CARS`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Chofer: ${chofer.nombre_completo} ${chofer.apellidos}`, 14, 22);
    doc.text(`DNI/NIE: ${chofer.dni}`, 14, 27);
    
    const pdfMinutos = Math.round(horas * 60);
    doc.text(`Horas Totales Aprobadas: ${Math.floor(pdfMinutos / 60)}h ${pdfMinutos % 60}m`, 14, 32);

    const tablaDatos = historialJornadas.map(j => {
      const inicio = new Date(j.hora_inicio).toLocaleString();
      const fin = j.hora_fin ? new Date(j.hora_fin).toLocaleString() : 'EN RUTA...';
      let duracion = 'Activo';
      if (j.hora_fin) {
        const diffMins = Math.floor((new Date(j.hora_fin).getTime() - new Date(j.hora_inicio).getTime()) / 60000);
        duracion = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
      }
      return [inicio, fin, duracion, j.estado];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Hora de Inicio', 'Hora de Fin', 'Duración', 'Estado']],
      body: tablaDatos,
      theme: 'grid',
      headStyles: { fillColor: [234, 179, 8] }
    });

    doc.save(`Reporte_${chofer.nombre_completo.replace(/\s/g, '_')}.pdf`);
  };

  const baseMinutos = Math.round(horas * 60);
  const totalMinutos = baseMinutos + minutosEnVivo;
  const displayHoras = Math.floor(totalMinutos / 60);
  const displayMins = totalMinutos % 60;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#111] border border-zinc-800 w-full max-w-5xl h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-wide">{chofer.nombre_completo} {chofer.apellidos}</h2>
            <p className="text-zinc-500 font-mono text-sm mt-1">DNI/NIE: {chofer.dni} | Tel: {chofer.telefono}</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={descargarPDF} className="bg-yellow-500 text-black px-4 py-2 rounded font-bold text-xs flex items-center gap-2 hover:bg-yellow-400">
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
            <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors bg-zinc-800/50 p-2 rounded-full"><X className="w-6 h-6" /></button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* PANEL IZQUIERDO: HORAS Y CHAT */}
          <div className="w-1/3 border-r border-zinc-800 p-6 flex flex-col gap-4 overflow-hidden">
            
            <div className="bg-black border border-zinc-800 p-4 rounded-xl flex-shrink-0">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"><Clock className="w-3 h-3" /> Total Histórico {minutosEnVivo > 0 && <span className="text-emerald-500 animate-pulse">(En Vivo)</span>}</h3>
                {!editandoHoras && (
                  <button onClick={() => {
                     setInputEditH(Math.floor(baseMinutos / 60));
                     setInputEditM(baseMinutos % 60);
                     setEditandoHoras(true);
                  }} className="text-zinc-600 hover:text-yellow-500 transition-colors p-1"><Edit2 className="w-3 h-3" /></button>
                )}
              </div>

              {editandoHoras ? (
                 <div className="flex flex-col gap-2 mt-3">
                    <div className="flex gap-2 items-center justify-center">
                       <input type="number" min="0" value={inputEditH} onChange={e => setInputEditH(Number(e.target.value))} className="w-16 bg-zinc-900 border border-zinc-700 text-white p-2 rounded text-lg font-mono text-center outline-none focus:border-yellow-500" /> <span className="text-xs text-zinc-600 font-bold">h</span>
                       <input type="number" min="0" max="59" value={inputEditM} onChange={e => setInputEditM(Number(e.target.value))} className="w-16 bg-zinc-900 border border-zinc-700 text-white p-2 rounded text-lg font-mono text-center outline-none focus:border-yellow-500" /> <span className="text-xs text-zinc-600 font-bold">m</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                       <button onClick={guardarHoras} className="bg-yellow-500 text-black px-3 py-2 rounded font-bold text-[10px] uppercase flex-1 hover:bg-yellow-400">Guardar</button>
                       <button onClick={() => setEditandoHoras(false)} className="bg-zinc-800 text-zinc-400 px-3 py-2 rounded font-bold text-[10px] uppercase flex-1 hover:text-white transition-colors">Cancelar</button>
                    </div>
                    <button onClick={recalcularDesdeHistorial} className="mt-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-3 py-2 rounded font-bold text-[10px] uppercase w-full flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-colors">
                       <Calculator className="w-3 h-3" /> Auto-Calcular Historial
                    </button>
                 </div>
              ) : (
                 <p className="text-3xl font-mono font-black text-white">
                   {displayHoras} <span className="text-xs text-zinc-600 font-sans font-normal">h</span> {displayMins.toString().padStart(2, '0')} <span className="text-xs text-zinc-600 font-sans font-normal">m</span>
                 </p>
              )}
            </div>

            <div className="flex-1 bg-black border border-zinc-800 rounded-xl flex flex-col overflow-hidden min-h-0">
              <div className="bg-zinc-900/50 p-3 border-b border-zinc-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-500" />
                <h3 className="text-white text-xs font-bold uppercase tracking-wider">Chat Operaciones</h3>
              </div>
              <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 scrollbar-thin scrollbar-thumb-zinc-800">
                {mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.remitente === 'admin' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-2 rounded-lg text-xs max-w-[85%] ${m.remitente === 'admin' ? 'bg-emerald-500 text-black font-bold' : 'bg-zinc-800 text-zinc-200'}`}>{m.mensaje}</div>
                  </div>
                ))}
                <div ref={mensajesEndRef} />
              </div>
              <div className="p-2 border-t border-zinc-800 bg-zinc-900/30 flex gap-2">
                <input type="text" value={nuevoMensaje} onChange={e => setNuevoMensaje(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarMensaje()} placeholder="Escribir al chofer..." className="flex-1 bg-black border border-zinc-700 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none" />
                <button onClick={enviarMensaje} className="bg-emerald-500 text-black px-3 rounded font-bold text-[10px] uppercase">Enviar</button>
              </div>
            </div>
          </div>

          {/* PANEL DERECHO: TABS (MAPA CON SEGUIMIENTO EN VIVO / HISTORIAL) */}
          <div className="w-2/3 flex flex-col bg-zinc-900">
             <div className="flex border-b border-zinc-800 bg-black">
                <button onClick={() => setVistaActual('mapa')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest ${vistaActual === 'mapa' ? 'text-yellow-500 border-b-2 border-yellow-500 bg-zinc-900/50' : 'text-zinc-500'}`}>Localización GPS</button>
                <button onClick={() => setVistaActual('historial')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest ${vistaActual === 'historial' ? 'text-yellow-500 border-b-2 border-yellow-500 bg-zinc-900/50' : 'text-zinc-500'}`}>Fichajes y Turnos</button>
             </div>

             <div className="flex-1 relative">
                {vistaActual === 'mapa' ? (
                  tieneUbicacion ? (
                     <MapContainer center={posicionActual} zoom={15} style={{ height: '100%', width: '100%', zIndex: 10 }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                        <Marker position={posicionActual}><Popup className="text-black font-bold">{chofer.nombre_completo}</Popup></Marker>
                        <AutoCentrarMapa posicion={posicionActual} />
                     </MapContainer>
                  ) : (
                     <div className="h-full flex flex-col items-center justify-center text-zinc-500">
                        <MapIcon className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-sm uppercase tracking-widest font-bold">Sin telemetría actual</p>
                     </div>
                  )
                ) : (
                  <div className="h-full overflow-y-auto p-6">
                     <table className="w-full text-left text-sm text-zinc-300">
                        <thead className="text-xs text-zinc-500 uppercase border-b border-zinc-800 bg-black">
                           <tr>
                              <th className="py-3 px-4">Entrada</th>
                              <th className="py-3 px-4">Salida</th>
                              <th className="py-3 px-4">Total Horas</th>
                              <th className="py-3 px-4">Estado</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                           {historialJornadas.map(j => {
                              let duracionStr = 'En curso...';
                              if (j.hora_fin) {
                                const diffMins = Math.floor((new Date(j.hora_fin).getTime() - new Date(j.hora_inicio).getTime()) / 60000);
                                duracionStr = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
                              }
                              return (
                                <tr key={j.id} className="hover:bg-zinc-800/50">
                                   <td className="py-3 px-4 font-mono">{new Date(j.hora_inicio).toLocaleDateString()} <span className="text-zinc-500">{new Date(j.hora_inicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></td>
                                   <td className="py-3 px-4 font-mono">{j.hora_fin ? <>{new Date(j.hora_fin).toLocaleDateString()} <span className="text-zinc-500">{new Date(j.hora_fin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></> : <span className="text-emerald-500 animate-pulse">EN RUTA</span>}</td>
                                   <td className="py-3 px-4 font-bold text-white">{duracionStr}</td>
                                   <td className="py-3 px-4"><span className={`px-2 py-1 rounded text-[10px] uppercase font-bold ${j.estado === 'activa' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-zinc-800 text-zinc-400'}`}>{j.estado}</span></td>
                                </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function MetricCard({ icon, title, value, highlight = false }: any) {
  return (
    <div className={`p-5 rounded-xl border ${highlight ? 'bg-yellow-500/5 border-yellow-500/30' : 'bg-[#0f0f0f] border-zinc-800'}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${highlight ? 'bg-yellow-500/20 text-yellow-500' : 'bg-zinc-800 text-zinc-400'}`}>{icon}</div>
      <h4 className="text-xs text-zinc-500 font-bold uppercase tracking-wider">{title}</h4>
      <span className={`text-2xl font-black font-mono ${highlight ? 'text-yellow-500' : 'text-white'}`}>{value}</span>
    </div>
  );
}

// ==========================================
// COMPONENTE: FORMULARIO DE REGISTRO COMPLETO (CORREGIDO)
// ==========================================
function RegistroChofer({ onAdd, adminEmail }: { onAdd: () => void, adminEmail: string }) {
  const [formData, setFormData] = useState({
    nombre: '', apellidos: '', dni: '', direccion: '', telefono: '', email: '', adminPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const handleRegister = async () => {
    if (!formData.nombre || !formData.email || !formData.dni || !formData.adminPassword) {
      setMensaje('Error: Faltan datos obligatorios o la firma de autorización.');
      return;
    }
    setLoading(true);
    setMensaje('Registrando en base de datos...');

    const { data: user, error: authError } = await supabase.auth.signUp({ 
      email: formData.email, 
      password: formData.dni + 'Talur*' // Clave temporal: Su DNI + Talur*
    });

    if (authError) {
      setMensaje(`Error Auth: ${authError.message}`);
      setLoading(false);
      return;
    }

    if (user?.user) {
      const { error: dbError } = await supabase.from('perfiles').insert({
        id: user.user.id,
        nombre_completo: formData.nombre,
        apellidos: formData.apellidos,
        dni: formData.dni,
        direccion: formData.direccion,
        telefono: formData.telefono,
        rol: 'chofer',
        estado_actual: 'desconectado'
      });

      if (dbError) {
        setMensaje(`Error DB: ${dbError.message}`);
      } else {
        setMensaje('¡Expediente creado con éxito!');
        onAdd();
        // Limpiamos el formulario
        setFormData({ nombre: '', apellidos: '', dni: '', direccion: '', telefono: '', email: '', adminPassword: '' });
        
        // Recuperamos la sesión del administrador silenciosamente
        await supabase.auth.signInWithPassword({ email: adminEmail, password: formData.adminPassword });
      }
    }
    setLoading(false);
    setTimeout(() => setMensaje(''), 4000);
  };

  return (
    <div className="bg-[#111] border border-zinc-800 p-6 rounded-xl mb-6">
      <h2 className="text-white font-bold mb-4 uppercase text-xs tracking-widest flex justify-between">
        Apertura de Nuevo Expediente
        {mensaje && <span className={mensaje.includes('Error') ? 'text-red-500' : 'text-yellow-500'}>{mensaje}</span>}
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <input placeholder="Nombre(s)" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} />
        <input placeholder="Apellidos" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.apellidos} onChange={e => setFormData({...formData, apellidos: e.target.value})} />
        <input placeholder="Documento (DNI/NIE)" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.dni} onChange={e => setFormData({...formData, dni: e.target.value})} />
        <input placeholder="Teléfono Móvil" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} />
        <input placeholder="Dirección Residencial" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.direccion} onChange={e => setFormData({...formData, direccion: e.target.value})} />
        <input placeholder="Email Corporativo" type="email" className="bg-black border border-zinc-800 text-white p-2.5 rounded text-sm focus:border-yellow-500 focus:outline-none" 
          value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
      </div>
      
      <div className="flex justify-between items-center border-t border-zinc-800 pt-4 mt-2">
        <div className="flex items-center gap-3 w-1/2">
           <label className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Firma Autorización:</label>
           <input 
              type="password" 
              placeholder="Tu contraseña de Admin" 
              className="bg-zinc-900 border border-zinc-700 text-white p-2 rounded text-sm w-full focus:border-yellow-500 focus:outline-none"
              value={formData.adminPassword} 
              onChange={e => setFormData({...formData, adminPassword: e.target.value})} 
           />
        </div>
        <button onClick={handleRegister} disabled={loading} className="bg-yellow-500 text-black font-bold px-8 py-2.5 rounded hover:bg-yellow-400 disabled:opacity-50 text-sm uppercase tracking-wider transition-all">
          {loading ? 'Procesando...' : 'Dar de Alta al Chofer'}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// APP DEL CHOFER (INTERFAZ MÓVIL PRO + RASTREO GPS EN VIVO)
// ==========================================
function DriverApp({ session }: { session: any }) {
  const [perfil, setPerfil] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [minutosActivos, setMinutosActivos] = useState(0);
  const [jornadaActivaId, setJornadaActivaId] = useState<string | null>(null);
  
  const [chatIAAbierto, setChatIAAbierto] = useState(false);
  const [jornadaAbierta, setJornadaAbierta] = useState(false);
  const [historialJornadas, setHistorialJornadas] = useState<any[]>([]);
  
  const [mensajeIA, setMensajeIA] = useState('');
  const [historialIA, setHistorialIA] = useState<{rol: string, texto: string}[]>([{rol: 'ia', texto: 'Sistema Central Talur. ¿En qué puedo asistirte en tu ruta?'}]);
  const [enviandoIA, setEnviandoIA] = useState(false);

  const [mensajesDirectos, setMensajesDirectos] = useState<any[]>([]);
  const [nuevoMensajeDirecto, setNuevoMensajeDirecto] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { cargarPerfil(); }, []);

  // 1. EFECTO DE RASTREO EN VIVO (EL "EFECTO UBER")
  useEffect(() => {
    let watchId: string | null = null;
    const iniciarRastreo = async () => {
      if (perfil?.estado_actual === 'conectado') {
        const permisos = await Geolocation.checkPermissions();
        if (permisos.location === 'granted') {
          // Esto lee el GPS continuamente mientras esté conectado
          watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
            async (pos, err) => {
              if (pos) {
                await supabase.from('perfiles')
                  .update({ latitud: pos.coords.latitude, longitud: pos.coords.longitude })
                  .eq('id', session.user.id);
              }
            }
          );
        }
      }
    };
    iniciarRastreo();
    return () => { if (watchId !== null) Geolocation.clearWatch({ id: watchId }); };
  }, [perfil?.estado_actual, session.user.id]);

  // 2. Cronómetro del turno actual
  useEffect(() => {
    let intervalo: any;
    if (perfil?.estado_actual === 'conectado') {
      intervalo = setInterval(() => setMinutosActivos(m => m + 1), 60000);
    } else { setMinutosActivos(0); }
    return () => clearInterval(intervalo);
  }, [perfil?.estado_actual]);

  // 3. Radar de Base de Datos en Vivo (Chat y Jornadas)
  useEffect(() => {
    if (!session?.user?.id) return;
    const canalChat = supabase.channel('chat_chofer')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_directo', filter: `chofer_id=eq.${session.user.id}` }, (payload) => {
        setMensajesDirectos((prev) => [...prev, payload.new]);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }).subscribe();
      
    const canalJornadas = supabase.channel('jornadas_chofer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jornadas', filter: `chofer_id=eq.${session.user.id}` }, () => {
        cargarPerfil(); 
      }).subscribe();

    return () => { supabase.removeChannel(canalChat); supabase.removeChannel(canalJornadas); };
  }, [session?.user?.id]);

  async function cargarPerfil() {
    const { data: pData } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
    setPerfil(pData);

    const { data: jActiva } = await supabase.from('jornadas').select('*').eq('chofer_id', session.user.id).is('hora_fin', null).single();
    if (jActiva) {
      setJornadaActivaId(jActiva.id);
      const diffMs = new Date().getTime() - new Date(jActiva.hora_inicio).getTime();
      setMinutosActivos(Math.floor(diffMs / 60000));
    } else {
      setJornadaActivaId(null);
    }

    const { data: historial } = await supabase.from('jornadas').select('*').eq('chofer_id', session.user.id).order('hora_inicio', { ascending: false });
    if (historial) setHistorialJornadas(historial);

    const { data: cData } = await supabase.from('chat_directo').select('*').eq('chofer_id', session.user.id).order('creado_en', { ascending: true });
    if (cData) { setMensajesDirectos(cData); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }

    setLoading(false);
  }

  const enviarMensajeDirecto = async () => {
    if (!nuevoMensajeDirecto.trim() || !perfil) return;
    const msg = nuevoMensajeDirecto;
    setNuevoMensajeDirecto('');
    await supabase.from('chat_directo').insert({ chofer_id: session.user.id, remitente: 'chofer', mensaje: msg });
  };

  const toggleTurno = async () => {
    if (!perfil) return;
    setActualizando(true);

    const esConectar = perfil.estado_actual === 'desconectado';
    const nuevoEstado = esConectar ? 'conectado' : 'desconectado';
    let lat = perfil.latitud; let lng = perfil.longitud;

    try {
      if (esConectar) {
         let permisos = await Geolocation.checkPermissions();
         if (permisos.location !== 'granted') { permisos = await Geolocation.requestPermissions(); }
         if (permisos.location !== 'granted') throw new Error('Permisos de GPS denegados por Android.');
         
         const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
         lat = pos.coords.latitude; lng = pos.coords.longitude;
         
         const { data: nuevaJornada, error: errEntrada } = await supabase.from('jornadas').insert({ 
           chofer_id: session.user.id,
           hora_inicio: new Date().toISOString(),
           ubicacion_inicio: `${lat}, ${lng}`,
           estado: 'activa'
         }).select().single();
         
         if (errEntrada) throw new Error("Base de Datos bloqueó la entrada (RLS): " + errEntrada.message);
         if (nuevaJornada) setJornadaActivaId(nuevaJornada.id);

      } else {
        if (jornadaActivaId) {
          const fechaFin = new Date().toISOString();
          
          const { data: jornadaCerrada, error: errSalida } = await supabase.from('jornadas').update({ 
            hora_fin: fechaFin,
            ubicacion_fin: `${lat}, ${lng}`,
            estado: 'finalizada'
          }).eq('id', jornadaActivaId).select().single();

          if (errSalida) throw new Error("No se pudo registrar la salida: " + errSalida.message);

          if (jornadaCerrada) {
             const horasTurno = (new Date(jornadaCerrada.hora_fin).getTime() - new Date(jornadaCerrada.hora_inicio).getTime()) / (1000 * 60 * 60);
             const nuevoAcumulado = (parseFloat(perfil.horas_acumuladas || 0) + horasTurno).toFixed(4);
             await supabase.from('perfiles').update({ horas_acumuladas: nuevoAcumulado }).eq('id', session.user.id);
          }
          setJornadaActivaId(null);
          setMinutosActivos(0);
        }
      }

      const { error: errPerfil } = await supabase.from('perfiles').update({ estado_actual: nuevoEstado, latitud: lat, longitud: lng }).eq('id', session.user.id);
      if (errPerfil) throw new Error("No se pudo cambiar el estado a " + nuevoEstado);
      
      await cargarPerfil(); 
    } catch (error: any) {
      alert("⚠️ Fallo Operativo:\n" + error.message);
    }
    setActualizando(false);
  };

  const enviarMensajeIA = async () => {
    if (!mensajeIA) return;
    const nuevoHistorial = [...historialIA, { rol: 'user', texto: mensajeIA }];
    setHistorialIA(nuevoHistorial); setMensajeIA(''); setEnviandoIA(true);
    try {
      const res = await fetch('https://panel1.quickai.agency/webhook/abogadoya-agente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chofer: perfil.nombre_completo, mensaje: mensajeIA, ubicacion: `Lat: ${perfil.latitud}, Lng: ${perfil.longitud}` })
      });
      const data = await res.json();
      setHistorialIA([...nuevoHistorial, { rol: 'ia', texto: data.output || "Procesado sin respuesta textual" }]);
    } catch (e) {
      setHistorialIA([...nuevoHistorial, { rol: 'ia', texto: 'Error de conexión con IA central.' }]);
    }
    setEnviandoIA(false);
  };

  // Cálculos para mostrar Horas y Minutos en el total global
  const baseMinutos = Math.round(parseFloat(perfil?.horas_acumuladas || 0) * 60);
  const totalMinutos = baseMinutos + minutosActivos;
  const globalHoras = Math.floor(totalMinutos / 60);
  const globalMins = totalMinutos % 60;

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-yellow-500 font-mono">CARGANDO...</div>;
  const isActivo = perfil?.estado_actual === 'conectado';

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans max-w-md mx-auto relative h-[100dvh] overflow-hidden">
      
      <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-[#0a0a0a] flex-shrink-0">
        <div>
          <h2 className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Chofer Designado</h2>
          <h1 className="text-base font-black tracking-wide text-white uppercase">{perfil?.nombre_completo}</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-zinc-600 hover:text-red-500 p-2 bg-black rounded-full border border-zinc-900"><LogOut className="w-4 h-4" /></button>
      </div>

      <div className="flex flex-col items-center justify-center py-4 gap-4 flex-shrink-0 border-b border-zinc-800 bg-[#080808]">
        <div className="flex w-full px-6 justify-between items-center">
           <div className="text-left space-y-1">
             <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3"/> Transcurrido</p>
             <h2 className={`text-2xl font-mono font-black ${isActivo ? 'text-white' : 'text-zinc-700'}`}>
               {Math.floor(minutosActivos / 60).toString().padStart(2, '0')}:{(minutosActivos % 60).toString().padStart(2, '0')}
             </h2>
           </div>
           
           <div className="text-right space-y-1">
             <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Estado</p>
             <h2 className={`text-sm font-black uppercase tracking-widest ${isActivo ? 'text-emerald-500' : 'text-zinc-600'}`}>
               {perfil?.estado_actual === 'conectado' ? 'CONECTADO' : 'DESCONECTADO'}
             </h2>
           </div>
        </div>

        <button onClick={toggleTurno} disabled={actualizando}
          className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl active:scale-95 ${
            isActivo ? 'bg-emerald-500/10 border-4 border-emerald-500 text-emerald-500' : 'bg-zinc-900 border-4 border-zinc-800 text-zinc-600'
          }`}>
          <Power className={`w-12 h-12 transition-all ${actualizando ? 'animate-pulse' : ''}`} />
        </button>
        
        <div className="h-4">
          {isActivo && <div className="text-emerald-500 font-mono text-[9px] flex items-center gap-1 animate-pulse"><MapIcon className="w-3 h-3" /> GPS TRANSMITIENDO</div>}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[#0f0f0f] min-h-0">
         <div className="bg-zinc-900/50 p-2 border-b border-zinc-800 flex items-center justify-center gap-2">
            <ShieldCheck className="w-3 h-3 text-emerald-500" />
            <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">Chat Central de Operaciones</span>
         </div>
         <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {mensajesDirectos.length === 0 ? (
              <div className="text-center text-zinc-600 text-[9px] uppercase mt-4">Sin mensajes operativos</div>
            ) : (
              mensajesDirectos.map((m) => (
                <div key={m.id} className={`flex ${m.remitente === 'chofer' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-2 rounded-lg text-xs max-w-[85%] ${m.remitente === 'chofer' ? 'bg-emerald-500 text-black font-bold' : 'bg-zinc-800 text-zinc-200'}`}>{m.mensaje}</div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
         </div>
         <div className="p-2 border-t border-zinc-800 bg-zinc-900/80 flex gap-2">
            <input type="text" value={nuevoMensajeDirecto} onChange={e => setNuevoMensajeDirecto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enviarMensajeDirecto()} placeholder="Reportar a central..." className="flex-1 bg-black border border-zinc-700 rounded p-2 text-xs text-white focus:border-emerald-500 outline-none" />
            <button onClick={enviarMensajeDirecto} className="bg-emerald-500 text-black px-3 rounded font-bold text-[10px] uppercase">Enviar</button>
         </div>
      </div>

      <div className="grid grid-cols-2 border-t border-zinc-800 bg-[#0a0a0a] flex-shrink-0">
        <button onClick={() => setChatIAAbierto(true)} className="p-3 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-yellow-500 border-r border-zinc-800">
          <MessageSquare className="w-4 h-4" />
          <span className="text-[8px] uppercase font-bold tracking-widest">Soporte IA</span>
        </button>
        <button onClick={() => setJornadaAbierta(true)} className="p-3 flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-yellow-500">
          <Clock className="w-4 h-4" />
          <span className="text-[8px] uppercase font-bold tracking-widest">Mi Jornada</span>
        </button>
      </div>

      {chatIAAbierto && (
        <div className="absolute inset-0 bg-black/95 z-50 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-[#111]">
            <div className="flex items-center gap-3">
               <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
               <h3 className="text-xs font-bold text-white uppercase tracking-widest">Asistente IA (n8n)</h3>
            </div>
            <button onClick={() => setChatIAAbierto(false)}><X className="text-zinc-500 w-6 h-6" /></button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
             {historialIA.map((msg, i) => (
                <div key={i} className={`flex ${msg.rol === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`p-3 rounded-lg text-sm max-w-[80%] ${msg.rol === 'user' ? 'bg-yellow-500 text-black font-bold' : 'bg-zinc-800 text-white'}`}>{msg.texto}</div></div>
             ))}
             {enviandoIA && <div className="text-zinc-500 text-xs italic">Procesando...</div>}
          </div>
          <div className="p-4 border-t border-zinc-800 flex gap-2">
            <input type="text" value={mensajeIA} onChange={e => setMensajeIA(e.target.value)} className="flex-1 bg-black border border-zinc-800 p-3 text-sm text-white focus:border-yellow-500" />
            <button onClick={enviarMensajeIA} disabled={enviandoIA} className="bg-yellow-500 text-black px-4 rounded font-bold uppercase text-xs">Enviar</button>
          </div>
        </div>
      )}

      {jornadaAbierta && (
        <div className="absolute inset-0 bg-black z-50 flex flex-col">
           <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-[#111]">
             <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-500"/> Fichajes y Horas</h3>
             <button onClick={() => setJornadaAbierta(false)}><X className="text-zinc-500 w-6 h-6 hover:text-white" /></button>
           </div>
           
           <div className="p-6 bg-[#0a0a0a] border-b border-zinc-800 text-center">
             <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mb-1">Horas Acumuladas Globales</p>
             <p className="text-5xl font-mono font-black text-white">
               {globalHoras}<span className="text-sm text-zinc-600 font-sans">h</span> {globalMins.toString().padStart(2, '0')}<span className="text-sm text-zinc-600 font-sans">m</span>
             </p>
           </div>
           
           <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
             <h4 className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-2 px-2">Historial Reciente</h4>
             {historialJornadas.map(j => {
                let duracion = 'En ruta...';
                if (j.hora_fin) {
                   const diffMins = Math.floor((new Date(j.hora_fin).getTime() - new Date(j.hora_inicio).getTime()) / 60000);
                   duracion = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
                }
                const fechaStr = new Date(j.hora_inicio).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                
                return (
                  <div key={j.id} className="bg-[#111] border border-zinc-800 p-4 rounded-xl flex justify-between items-center">
                     <div>
                        <p className="text-white font-bold text-sm capitalize">{fechaStr}</p>
                        <p className="text-zinc-500 font-mono text-[10px] mt-1">
                          {new Date(j.hora_inicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                          {j.hora_fin ? new Date(j.hora_fin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ' Presente'}
                        </p>
                     </div>
                     <div className="text-right">
                        <p className={`font-mono font-black ${j.hora_fin ? 'text-white' : 'text-emerald-500 animate-pulse'}`}>{duracion}</p>
                     </div>
                  </div>
                );
             })}
           </div>
        </div>
      )}

    </div>
  );
}