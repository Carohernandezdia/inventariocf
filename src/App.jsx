// =====================================================================
// App principal: maneja la sesion (nombre + negocio + rol), las pantallas
// y el envio pendiente a Google Sheets.
//
// ADMINISTRADOR: barra de abajo con 3 opciones (Inicio = dashboard, Contar, Mercancia) y un
//   engranaje arriba para Configuracion (respaldo, claves, importar).
// EMPLEADO: solo ve la pantalla de contar (sin barra ni engranaje).
// =====================================================================
import { useState, useEffect } from 'react'
import { Home, ScanBarcode, Package, Settings, Pencil, BarChart3 } from 'lucide-react'
import Login from './components/Login'
import Contar from './components/contar'
import Correcciones from './components/Correcciones'
import ReporteInventario from './components/ReporteInventario'
import Dashboard from './components/Dashboard'
import Gestion from './components/Gestion'
import Configuracion from './components/Configuracion'
import { procesarCola, contarPendientes } from './lib/colaSheets'
import './App.css'

// ---------- Iconos de la barra inferior (Lucide, lineamientos OrCore) ----------
// Naranja #FF6600 y trazo 2.25 cuando esta activo; gris #A0A7B0 y trazo 1.75 cuando no. Tamaño 24.
const ICONOS = { inicio: Home, contar: ScanBarcode, gestion: Package }

// Una opcion de la barra: icono arriba y nombre abajo
function BotonBarra({ id, texto, activo, onClick }) {
  const Icono = ICONOS[id]
  return (
    <div onClick={onClick} style={{ flex: 1, textAlign: 'center', padding: '8px 0 6px', cursor: 'pointer' }}>
      <Icono size={24} strokeWidth={activo ? 2.25 : 1.75} color={activo ? '#FF6600' : '#A0A7B0'} />
      <div style={{ fontSize: 12, fontWeight: activo ? 600 : 400, color: activo ? '#FF6600' : '#5B6470' }}>{texto}</div>
    </div>
  )
}

function App() {
  const [sesion, setSesion] = useState(null)
  const [tab, setTab] = useState('inicio')            // inicio, contar, gestion o config
  const [subContar, setSubContar] = useState('contar') // dentro de Contar (solo admin): contar, corregir o reporte
  const [pendientes, setPendientes] = useState(0)
  const [codigoNuevo, setCodigoNuevo] = useState('')   // codigo que el admin quiere crear (viene de Contar)

  // Al abrir: recupera la sesion guardada. Si es una sesion vieja (sin nombre), pide entrar de nuevo.
  useEffect(() => {
    const guardada = localStorage.getItem('sesion-inventario')
    if (guardada) {
      const s = JSON.parse(guardada)
      if (s.nombreUsuario) setSesion(s)
      else localStorage.removeItem('sesion-inventario')
    }
  }, [])

  // Mantiene el contador de envios pendientes a Sheets y reintenta cada 15 segundos
  useEffect(() => {
    if (!sesion) return
    const codigo = sesion.negocio.codigo_negocio
    const url = sesion.negocio.apps_script_url
    const actualizar = () => setPendientes(contarPendientes(codigo))

    window.addEventListener('cola-sheets', actualizar)
    actualizar()
    procesarCola(codigo, url)
    const reloj = setInterval(() => procesarCola(codigo, url), 15000)
    return () => {
      window.removeEventListener('cola-sheets', actualizar)
      clearInterval(reloj)
    }
  }, [sesion])

  function cerrarSesion() {
    localStorage.removeItem('sesion-inventario')
    setSesion(null)
    setTab('inicio')
    setSubContar('contar')
  }

  if (!sesion) {
    return <Login onLogin={setSesion} />
  }

  const esAdmin = sesion.rol === 'admin'
  // El empleado SIEMPRE ve solo Contar, pase lo que pase con la variable tab
  const pantalla = esAdmin ? tab : 'contar'

  // Botones de arriba en Contar (Contar / Corregir / Reporte): icono Lucide pequeño + palabra grande
  const botonSub = (id, texto, Icono) => (
    <button
      onClick={() => setSubContar(id)}
      style={{
        flex: 1, padding: '14px 6px', borderRadius: 12, fontWeight: 600, fontSize: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: '1px solid ' + (subContar === id ? '#FF6600' : '#E4E7EB'),
        background: subContar === id ? '#FF6600' : 'white',
        color: subContar === id ? 'white' : '#111417'
      }}
    >
      <Icono size={16} strokeWidth={subContar === id ? 2.25 : 1.75} color={subContar === id ? 'white' : '#FF6600'} />
      {texto}
    </button>
  )

  return (
    <div>
      <div className="encabezado-user">
        <span>
          <b>{sesion.negocio.nombre_negocio}</b> · {sesion.nombreUsuario} ({sesion.rol})
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          {esAdmin && <button onClick={() => setTab('config')} title="Configuración" style={{ display: 'flex', alignItems: 'center' }}><Settings size={16} strokeWidth={1.75} /></button>}
          <button onClick={cerrarSesion}>Salir</button>
        </span>
      </div>

      {pendientes > 0 && (
        <div style={{ background: '#FFF3EB', color: '#FF6600', fontSize: 12, padding: '6px 16px', textAlign: 'center' }}>
          ⏳ {pendientes} envío(s) a Google Sheets en camino. Se reintentan solos, no cierres la página.
        </div>
      )}

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: 12, paddingBottom: esAdmin ? 90 : 12 }}>
        {/* Inicio = Dashboard (solo admin) */}
        {pantalla === 'inicio' && <Dashboard negocio={sesion.negocio} />}

        {/* Contar: el admin ademas tiene el boton Corregir (las correcciones son del conteo del dia) */}
        {pantalla === 'contar' && (
          <div>
            {esAdmin && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
                {botonSub('contar', 'Contar', ScanBarcode)}
                {botonSub('corregir', 'Corregir', Pencil)}
                {botonSub('reporte', 'Reporte', BarChart3)}
              </div>
            )}
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              {(!esAdmin || subContar === 'contar') && (
                <Contar
                  negocio={sesion.negocio}
                  nombreUsuario={sesion.nombreUsuario}
                  rol={sesion.rol}
                  onCrearProducto={(c) => { setCodigoNuevo(c); setTab('gestion') }}
                />
              )}
              {esAdmin && subContar === 'corregir' && <Correcciones negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} />}
              {esAdmin && subContar === 'reporte' && <ReporteInventario negocio={sesion.negocio} />}
            </div>
          </div>
        )}

        {/* Mercancia: junta Productos y Mercancia */}
        {pantalla === 'gestion' && (
          <Gestion
            key={codigoNuevo}
            negocio={sesion.negocio}
            nombreUsuario={sesion.nombreUsuario}
            codigoInicial={codigoNuevo}
            onListo={() => setCodigoNuevo('')}
          />
        )}

        {/* Configuracion (engranaje de arriba) */}
        {pantalla === 'config' && <Configuracion negocio={sesion.negocio} onVolver={() => setTab('inicio')} />}
      </main>

      {/* Barra inferior: solo para el administrador. Los empleados solo ven la pantalla de contar. */}
      {esAdmin && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', background: 'white', borderTop: '1px solid #E4E7EB', zIndex: 50 }}>
          <BotonBarra id="inicio" texto="Inicio" activo={pantalla === 'inicio'} onClick={() => setTab('inicio')} />
          <BotonBarra id="contar" texto="Contar" activo={pantalla === 'contar'} onClick={() => setTab('contar')} />
          <BotonBarra id="gestion" texto="Mercancía" activo={pantalla === 'gestion'} onClick={() => { setCodigoNuevo(''); setTab('gestion') }} />
        </div>
      )}
    </div>
  )
}

export default App
