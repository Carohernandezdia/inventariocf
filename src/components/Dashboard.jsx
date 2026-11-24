// =====================================================================
// Pantalla "Inicio" (solo admin).
//   - Buscador grande: codigo de barras o nombre -> cuanto hay en Bodega, precio y valor.
//   - Tres botones: Ingresos, Salidas y Reportes; cada uno abre su historial.
//   - Boton para bajar el reporte general en Excel.
// Las tarjetas de Bodega / Tienda / Total ahora estan en Contar > Reporte.
// Iconos: Lucide (lineamientos OrCore: naranja #FF6600, trazo 1.75).
// =====================================================================
import { useState, useEffect } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Download, RefreshCw, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { generarReporteGeneral } from '../lib/reporteGeneral'
import BuscadorMercancia from './BuscadorMercancia'
import '../paneles.css'

const NARANJA = '#FF6600'

const TIPOS_REPORTE = {
  vencida: 'Vencida',
  por_vencerse: 'Por vencerse',
  devolver: 'Para devolver',
  danada: 'Dañada',
  otro: 'Otro'
}

// Formato de plata colombiana: $1.234.567
function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
}

function Dashboard({ negocio }) {
  const [historial, setHistorial] = useState([])
  const [vista, setVista] = useState('') // '' = inicio, o 'ingresos' / 'salidas' / 'reportes'
  const [reportes, setReportes] = useState([])
  const [cargando, setCargando] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [reporteMsg, setReporteMsg] = useState('')

  // Trae los ingresos, las salidas y los reportes pendientes
  async function calcular() {
    setCargando(true)
    try {
      const r = await supabase
        .from('movimientos_mercancia')
        .select('id, tipo, nombre, cantidad, unidad_medida, costo, destino, usuario, creado_en')
        .eq('negocio', negocio.codigo_negocio)
        .eq('anulado', false)
        .in('tipo', ['ingreso', 'salida'])
        .order('creado_en', { ascending: false })
        .limit(500)
      setHistorial(r.error ? [] : r.data || [])
    } catch (e) {
      setHistorial([])
    }
    try {
      const rep = await supabase
        .from('reportes_mercancia')
        .select('id, nombre, cantidad, unidad_medida, tipo, ubicacion, fecha_vencimiento')
        .eq('negocio', negocio.codigo_negocio).eq('anulado', false).eq('estado', 'pendiente')
        .order('creado_en', { ascending: false }).limit(200)
      setReportes(rep.error ? [] : rep.data || [])
    } catch (e) {
      setReportes([])
    }
    setCargando(false)
  }

  // Baja el reporte general de la mercancia en Excel (ingresos, salidas, reportes y stock)
  async function bajarReporte() {
    setBajando(true)
    setReporteMsg('')
    try {
      const r = await generarReporteGeneral(negocio, setReporteMsg)
      setReporteMsg('✓ Descargado ' + r.archivo + ' (' + r.ingresos + ' ingresos, ' + r.salidas + ' salidas, ' + r.reportes + ' reportes)')
    } catch (e) {
      setReporteMsg('No se pudo generar el reporte: ' + e.message)
    }
    setBajando(false)
  }

  useEffect(() => { calcular() }, [])

  const fechaCorta = (f) => new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  // Boton "Volver" de las pantallas de historial
  const botonVolver = (
    <button className="boton-chico" onClick={() => setVista('')}>
      <ArrowLeft size={16} strokeWidth={1.75} color={NARANJA} /> Volver
    </button>
  )

  // ---------- Pantallas de historial (se abren desde los botones de Inicio) ----------
  if (vista === 'ingresos' || vista === 'salidas') {
    const esIngreso = vista === 'ingresos'
    const lista = historial.filter((m) => m.tipo === (esIngreso ? 'ingreso' : 'salida'))
    return (
      <div style={{ padding: 4, maxWidth: 700, margin: '0 auto' }}>
        <div className="pantalla-cabeza">
          <div className="pantalla-titulo">{esIngreso ? 'Ingresos' : 'Salidas'}</div>
          {botonVolver}
        </div>
        <div className="caja-panel">
          {lista.length === 0 && <div style={{ fontSize: 14, color: '#5B6470' }}>Todavía no hay {esIngreso ? 'ingresos' : 'salidas'}.</div>}
          {lista.map((m) => (
            <div key={m.id} style={{ fontSize: 14, borderBottom: '1px dashed #E4E7EB', padding: '8px 0' }}>
              <b>{m.nombre}</b>
              <div style={{ fontSize: 12, color: '#5B6470' }}>
                {m.cantidad} {m.unidad_medida}
                {esIngreso && m.costo ? ' · ' + plata(m.costo) + ' c/u' : ''}
                {!esIngreso ? ' → ' + m.destino : ''}
                {' · '}{m.usuario}{' · '}{fechaCorta(m.creado_en)}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (vista === 'reportes') {
    return (
      <div style={{ padding: 4, maxWidth: 700, margin: '0 auto' }}>
        <div className="pantalla-cabeza">
          <div className="pantalla-titulo">Reportes</div>
          {botonVolver}
        </div>
        <div className="caja-panel">
          {reportes.length === 0 && <div style={{ fontSize: 14, color: '#5B6470' }}>No hay reportes pendientes.</div>}
          {Object.keys(TIPOS_REPORTE).map((k) => {
            const lista = reportes.filter((r) => r.tipo === k)
            if (lista.length === 0) return null
            return (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: k === 'vencida' || k === 'danada' ? '#DC2626' : '#111417' }}>
                  {TIPOS_REPORTE[k]} ({lista.length})
                </div>
                {lista.map((r) => (
                  <div key={r.id} style={{ fontSize: 12, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '5px 0' }}>
                    {r.nombre} · {r.cantidad} {r.unidad_medida} · {r.ubicacion}{r.fecha_vencimiento ? ' · vence ' + r.fecha_vencimiento : ''}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- Inicio ----------
  return (
    <div style={{ padding: 4, maxWidth: 700, margin: '0 auto' }}>
      <div className="pantalla-cabeza">
        <div className="pantalla-titulo">Inicio</div>
        <button className="boton-chico" onClick={calcular} disabled={cargando} style={{ opacity: cargando ? 0.6 : 1 }}>
          <RefreshCw size={16} strokeWidth={1.75} color={NARANJA} /> {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {/* Buscador de mercancia */}
      <BuscadorMercancia negocio={negocio} />

      {/* Botones que abren el historial: palabra grande, icono pequeño en naranja */}
      <div className="botones-historial">
        <button onClick={() => setVista('ingresos')}>
          <ArrowDownToLine size={16} strokeWidth={2.25} color={NARANJA} />
          <span>Ingresos</span>
        </button>
        <button onClick={() => setVista('salidas')}>
          <ArrowUpFromLine size={16} strokeWidth={2.25} color={NARANJA} />
          <span>Salidas</span>
        </button>
        <button onClick={() => setVista('reportes')}>
          <AlertTriangle size={16} strokeWidth={2.25} color={NARANJA} />
          <span>Reportes</span>
          {reportes.length > 0 && <span className="globito">{reportes.length}</span>}
        </button>
      </div>

      {/* Reporte general de la mercancia en Excel */}
      <button className="boton-reporte" onClick={bajarReporte} disabled={bajando}>
        <Download size={16} strokeWidth={1.75} /> {bajando ? 'Preparando el reporte...' : 'Descargar reporte general (Excel)'}
      </button>
      {reporteMsg && <p style={{ fontSize: 14, color: reporteMsg.startsWith('✓') ? '#16A34A' : '#5B6470', textAlign: 'center' }}>{reporteMsg}</p>}
    </div>
  )
}

export default Dashboard
