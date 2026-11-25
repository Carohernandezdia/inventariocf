// =====================================================================
// App principal: maneja la sesion (nombre + negocio + rol), las pantallas
// y el envio pendiente a Google Sheets.
//
// ADMINISTRADOR: barra de abajo con 3 opciones (Inicio = dashboard, Contar, Mercancia) y un
//   engranaje arriba para Configuracion (respaldo, claves, importar).
// EMPLEADO: solo ve la pantalla de contar (sin barra ni engranaje).
// =====================================================================
import { useState, useEffect } from 'react'
import { Home, ScanBarcode, Package, Settings, Pencil, BarChart3, LogOut } from 'lucide-react'
import Login from './components/Login'
import Contar from './components/contar'
import Correcciones from './components/Correcciones'
import ReporteInventario from './components/ReporteInventario'
import Dashboard from './components/Dashboard'
import Gestion from './components/Gestion'
import Configuracion from './components/Configuracion'
import { EmpezarInventario, CerrarInventario } from './components/PanelInventario'
import { estadoInventario } from './lib/inventario'
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
  const [inv, setInv] = useState(null)               // estado del inventario: abierto o cerrado (ver lib/inventario.js)
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

  // Estado del inventario: se pregunta al entrar y cada 20 segundos, para que si el admin lo cierra
  // o lo abre, las pantallas de los empleados se enteren solas.
  function refrescarInv() {
    if (!sesion) return
    estadoInventario(sesion.negocio, true).then(setInv).catch(() => {})
  }
  useEffect(() => {
    if (!sesion) return
    refrescarInv()
    const reloj = setInterval(refrescarInv, 20000)
    return () => clearInterval(reloj)
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

  // Pestaña tipo carpeta de Contar (igual que Mercancia / Productos): la abierta va en naranja
  const carpeta = (id, texto, Icono) => {
    const activa = subContar === id
    return (
      <button className={'carpeta-tab' + (activa ? ' activa' : '')} onClick={() => setSubContar(id)}>
        <Icono size={20} strokeWidth={activa ? 2.25 : 1.75} color={activa ? 'white' : '#FF6600'} />
        {texto}
      </button>
    )
  }

  // Centra el contenido en la pantalla (menos en Contar y Corregir, donde abajo va una lista)
  const centrada = (contenido) => (
    <div className="pantalla"><div className="pantalla-centro">{contenido}</div></div>
  )

  return (
    <div>
      {/* Banner naranja compacto con linea cian (igual que las otras aplicaciones de OrCore) */}
      <div className="banner-compacto">
        <div className="banner-texto">
          <div className="banner-negocio">{sesion.negocio.nombre_negocio}</div>
          <div className="banner-usuario">{sesion.nombreUsuario} · {sesion.rol === 'admin' ? 'administrador' : 'empleado'}</div>
        </div>
        <div className="banner-botones">
          {esAdmin && (
            <button className="banner-boton" onClick={() => setTab('config')} aria-label="Configuración">
              <Settings size={18} strokeWidth={1.75} />
            </button>
          )}
          <button className="banner-boton" onClick={cerrarSesion}>
            <LogOut size={18} strokeWidth={1.75} /> Salir
          </button>
        </div>
      </div>

      {pendientes > 0 && (
        <div className="aviso-envios">
          ⏳ {pendientes} envío(s) a Google Sheets en camino. Se reintentan solos, no cierres la página.
        </div>
      )}

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: 12, paddingBottom: esAdmin ? 90 : 12 }}>
        {/* Inicio = Dashboard (solo admin) */}
        {pantalla === 'inicio' && centrada(<Dashboard negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} />)}

        {/* Contar: el admin ve 3 pestañas tipo carpeta (Contar / Corregir / Reporte), igual que Mercancia / Productos.
            El empleado ve solo la pantalla de contar, sin pestañas. */}
        {pantalla === 'contar' && (
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {esAdmin && (
              <div className="carpeta-tabs">
                {carpeta('contar', 'Contar', ScanBarcode)}
                {carpeta('corregir', 'Corregir', Pencil)}
                {carpeta('reporte', 'Reporte', BarChart3)}
              </div>
            )}
            <div className={esAdmin ? 'carpeta-cuerpo' : ''}>
              {/* Inventario cerrado: no se puede contar ni corregir (el admin puede empezar uno nuevo) */}
              {inv && !inv.abierto && (!esAdmin || subContar !== 'reporte') && (
                <EmpezarInventario negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} esAdmin={esAdmin} inv={inv} onCambio={refrescarInv} />
              )}

              {/* Boton grande para CERRAR el inventario (solo admin, mientras esta abierto) */}
              {esAdmin && inv && inv.abierto && subContar === 'contar' && (
                <CerrarInventario negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} inv={inv} onCambio={refrescarInv} />
              )}

              {(!inv || inv.abierto) && (!esAdmin || subContar === 'contar') && (
                <Contar
                  negocio={sesion.negocio}
                  nombreUsuario={sesion.nombreUsuario}
                  rol={sesion.rol}
                  onCrearProducto={(c) => { setCodigoNuevo(c); setTab('gestion') }}
                />
              )}
              {esAdmin && inv && inv.abierto && subContar === 'corregir' && <Correcciones negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} />}
              {esAdmin && subContar === 'reporte' && <ReporteInventario negocio={sesion.negocio} />}
            </div>
          </div>
        )}

        {/* Mercancia: junta Productos y Mercancia */}
        {pantalla === 'gestion' && centrada(
          <Gestion
            key={codigoNuevo}
            negocio={sesion.negocio}
            nombreUsuario={sesion.nombreUsuario}
            codigoInicial={codigoNuevo}
            onListo={() => setCodigoNuevo('')}
          />
        )}

        {/* Configuracion (engranaje de arriba) */}
        {pantalla === 'config' && centrada(<Configuracion negocio={sesion.negocio} onVolver={() => setTab('inicio')} />)}
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