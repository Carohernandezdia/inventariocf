// =====================================================================
// Botones del CICLO DE INVENTARIO (ver lib/inventario.js)
//   <EmpezarInventario>  : pantalla de Contar cuando el inventario esta CERRADO.
//                          El admin ve el boton grande "Empezar un inventario" (pide su clave).
//                          Los empleados solo ven el aviso: no pueden contar ni enviar nada.
//   <CerrarInventario>   : boton en la pestaña Reporte (solo admin) para CERRAR el inventario.
//                          Lo contado pasa a ser el stock inicial y el contador vuelve a cero.
// Las dos piden la clave del administrador.
// =====================================================================
import { useState } from 'react'
import { PlayCircle, Lock } from 'lucide-react'
import { abrirInventario, cerrarInventario, regenerarSheets } from '../lib/inventario'
import '../paneles.css'

const NARANJA = '#FF6600'

// ---------- Inventario CERRADO: no se puede contar; el admin puede empezar uno ----------
export function EmpezarInventario({ negocio, nombreUsuario, esAdmin, inv, onCambio }) {
  const [clave, setClave] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [avance, setAvance] = useState('')        // lo que va haciendo (gris)
  const [trabajando, setTrabajando] = useState(false)

  // Empezar: 1) regenera el Google Sheets con los saldos  2) abre el inventario.
  // Si el Sheets falla, el inventario NO se abre y se puede volver a intentar.
  async function empezar() {
    if (clave.trim() !== String(negocio.codigo_admin).trim()) { setMensaje('La clave del administrador no es correcta.'); return }
    if (!confirm('Se va a guardar una copia con fecha del Google Sheets actual y a regenerarlo con los saldos de hoy. ¿Empezar el inventario?')) return
    setTrabajando(true)
    setMensaje('')
    try {
      await regenerarSheets(negocio, setAvance)
      setAvance('Abriendo el inventario...')
      await abrirInventario(negocio, nombreUsuario)
      setClave('')
      setAvance('')
      onCambio()
    } catch (e) {
      setAvance('')
      setMensaje(e.message)
    }
    setTrabajando(false)
  }

  return (
    <div className="caja-panel" style={{ textAlign: 'center', marginTop: 24 }}>
      <Lock size={40} strokeWidth={1.75} color={NARANJA} />
      <div style={{ fontSize: 20, fontWeight: 600, margin: '8px 0 4px' }}>Inventario cerrado</div>
      <p style={{ fontSize: 14, color: '#5B6470', margin: '0 0 16px' }}>
        {esAdmin
          ? 'Ahora nadie puede contar. Cuando vayan a hacer el siguiente inventario, toca el botón de abajo.'
          : 'En este momento no se está contando. Espera a que el administrador empiece un inventario.'}
      </p>

      {esAdmin && (
        <div>
          <input
            type="password"
            placeholder="Clave del administrador"
            value={clave}
            onChange={(e) => { setClave(e.target.value); setMensaje('') }}
            style={{ width: '100%', padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 10 }}
          />
          <button className="boton-reporte" onClick={empezar} disabled={trabajando} style={{ background: NARANJA, color: 'white', opacity: trabajando ? 0.6 : 1 }}>
            <PlayCircle size={18} strokeWidth={1.75} /> {trabajando ? 'Abriendo...' : 'Empezar un inventario'}
          </button>
          <p style={{ fontSize: 12, color: '#5B6470', marginBottom: 0 }}>
            Al empezar, el Google Sheets se regenera con los saldos de hoy (queda una copia con fecha del anterior).
            Lo que se cuente no se suma a lo que ya hay: se compara con lo que debería haber.
          </p>
          {avance && <p style={{ fontSize: 14, color: '#5B6470', marginBottom: 0 }}>{avance}</p>}
        </div>
      )}

      {mensaje && <p style={{ fontSize: 14, color: '#DC2626', marginBottom: 0 }}>{mensaje}</p>}
    </div>
  )
}

// ---------- Inventario ABIERTO: boton para cerrarlo (en Contar > Reporte) ----------
export function CerrarInventario({ negocio, nombreUsuario, inv, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [resumen, setResumen] = useState(null)

  async function cerrar() {
    if (clave.trim() !== String(negocio.codigo_admin).trim()) { setMensaje('La clave del administrador no es correcta.'); return }
    setTrabajando(true)
    setMensaje('')
    try {
      const r = await cerrarInventario(negocio, nombreUsuario, setMensaje)
      setResumen(r)
      setMensaje('')
      setClave('')
      setAbierto(false)
      onCambio()
    } catch (e) {
      setMensaje(e.message)
    }
    setTrabajando(false)
  }

  if (resumen) {
    return (
      <div className="caja-panel" style={{ marginTop: 12 }}>
        <div style={{ color: '#16A34A', fontWeight: 600 }}>✓ Inventario cerrado</div>
        <p style={{ fontSize: 14, color: '#5B6470', marginBottom: 0 }}>
          Se guardó el stock inicial de {resumen.productos.toLocaleString('es-CO')} productos
          ({resumen.bodega.toLocaleString('es-CO')} en Bodega y {resumen.tienda.toLocaleString('es-CO')} en Tienda).
          El contador quedó en cero.
        </p>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {!abierto && (
        <button
          className="boton-reporte"
          onClick={() => setAbierto(true)}
          style={{ background: 'white', color: NARANJA, border: '2px solid ' + NARANJA, padding: '16px 12px', fontSize: 18 }}
        >
          <Lock size={20} strokeWidth={1.75} /> Cerrar inventario
        </button>
      )}

      {abierto && (
        <div className="caja-panel">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>¿Cerrar el inventario {inv.numero}?</div>
          <ul style={{ fontSize: 14, color: '#5B6470', margin: '0 0 10px', paddingLeft: 18 }}>
            <li>Lo contado en Bodega y en Tienda queda como stock inicial.</li>
            <li>Nadie podrá contar hasta que usted empiece otro inventario.</li>
            <li>Los productos que nadie contó quedan en cero.</li>
            <li>Los conteos no se borran: quedan guardados.</li>
          </ul>
          <input
            type="password"
            placeholder="Clave del administrador"
            value={clave}
            onChange={(e) => { setClave(e.target.value); setMensaje('') }}
            style={{ width: '100%', padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, boxSizing: 'border-box', marginBottom: 10 }}
          />
          <button className="boton-reporte" onClick={cerrar} disabled={trabajando} style={{ background: NARANJA, color: 'white', opacity: trabajando ? 0.6 : 1 }}>
            {trabajando ? 'Cerrando...' : 'Sí, cerrar inventario'}
          </button>
          {!trabajando && (
            <button className="boton-reporte" onClick={() => { setAbierto(false); setMensaje('') }} style={{ background: 'white', color: '#5B6470', border: '1px solid #E4E7EB', marginTop: 8 }}>
              Cancelar
            </button>
          )}
        </div>
      )}

      {mensaje && <p style={{ fontSize: 14, color: mensaje.startsWith('Sumando') || mensaje.startsWith('Buscando') || mensaje.startsWith('Guardando') || mensaje.startsWith('Cerrando') ? '#5B6470' : '#DC2626', marginBottom: 0 }}>{mensaje}</p>}
    </div>
  )
}


