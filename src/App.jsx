// =====================================================================
// App principal: maneja la sesion (nombre + negocio + rol), las pestañas
// y el envio pendiente a Google Sheets.
// =====================================================================
import { useState, useEffect } from 'react'
import Login from './components/Login'
import Contar from './components/contar'
import Importar from './components/importar'
import Correcciones from './components/Correcciones'
import { procesarCola, contarPendientes } from './lib/colaSheets'
import './App.css'

function App() {
  const [sesion, setSesion] = useState(null)
  const [tab, setTab] = useState('contar')
  const [pendientes, setPendientes] = useState(0)

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
    setTab('contar')
  }

  if (!sesion) {
    return <Login onLogin={setSesion} />
  }

  const esAdmin = sesion.rol === 'admin'

  return (
    <div>
      <div className="encabezado-user">
        <span>
          <b>{sesion.negocio.nombre_negocio}</b> · {sesion.nombreUsuario} ({sesion.rol})
        </span>
        <button onClick={cerrarSesion}>Salir</button>
      </div>

      {pendientes > 0 && (
        <div style={{ background: '#FFF3EB', color: '#FF6600', fontSize: 12, padding: '6px 16px', textAlign: 'center' }}>
          ⏳ {pendientes} envío(s) a Google Sheets en camino. Se reintentan solos, no cierres la página.
        </div>
      )}

      <div className="tabs">
        <div className={tab === 'contar' ? 'tab active' : 'tab'} onClick={() => setTab('contar')}>Contar</div>
        {esAdmin && (
          <div className={tab === 'correcciones' ? 'tab active' : 'tab'} onClick={() => setTab('correcciones')}>Correcciones</div>
        )}
        {esAdmin && (
          <div className={tab === 'importar' ? 'tab active' : 'tab'} onClick={() => setTab('importar')}>Importar</div>
        )}
      </div>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 12 }}>
        {tab === 'contar' && <Contar negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} />}
        {tab === 'correcciones' && esAdmin && <Correcciones negocio={sesion.negocio} nombreUsuario={sesion.nombreUsuario} />}
        {tab === 'importar' && esAdmin && <Importar negocio={sesion.negocio} />}
      </main>
    </div>
  )
}

export default App
