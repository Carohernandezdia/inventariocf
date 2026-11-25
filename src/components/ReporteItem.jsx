// =====================================================================
// Un reporte de mercancia con sus botones para cerrarlo.
// Se usa en Mercancia > Reportar, en Inicio > Reportes y en la ficha del buscador.
//
// REGLAS:
//   - Vencida, Dañada y Devolver al proveedor DESCUENTAN al guardarse el reporte (ver Mercancia.jsx).
//     Ese descuento es una "salida" con destino 'Reporte' y la nota 'REPORTE#<id> ...'.
//   - Para cerrar un reporte pendiente hay tres caminos:
//       Reintegraron  -> la mercancia vuelve a entrar al mismo sitio (un ingreso con nota 'REPORTE#<id> Reintegro').
//       Pérdida       -> queda cerrado y el saldo no cambia (ej. Colanta/Alpina la descuentan de la factura).
//       Anular        -> el reporte fue un error: se anula tambien el descuento.
//   - Un reporte cerrado SIN movimiento de reintegro es una pérdida. Asi no hace falta ninguna columna nueva.
//   - Por vencerse y Otro solo avisan: se cierran con "Marcar resuelto".
// =====================================================================
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { leerNumero } from '../lib/numeros'

export const TIPOS_REPORTE = {
  vencida: 'Vencida',
  por_vencerse: 'Por vencerse',
  devolver: 'Para devolver al proveedor',
  danada: 'Dañada o en mal estado',
  otro: 'Otro'
}

// Tipos que descuentan la mercancia de donde esta
export const DESCUENTAN = ['vencida', 'danada', 'devolver']
export const descuenta = (tipo) => DESCUENTAN.includes(tipo)

// Marca que se escribe en la nota de los movimientos que nacen de un reporte
export const MARCA = 'REPORTE#'

// Nombre en plural para decir "4 unidades vencidas", "2 dañadas"...
export const TIPOS_PLURAL = {
  vencida: 'vencidas',
  por_vencerse: 'por vencerse',
  devolver: 'para devolver al proveedor',
  danada: 'dañadas',
  otro: 'de otro reporte'
}

// Repara los reportes que descuentan pero no tienen su salida (los hechos con la version anterior).
// Se ejecutan uno despues de otro (cola) para que dos pantallas abiertas a la vez no dupliquen el descuento.
let colaReparar = Promise.resolve()
function repararDescuentos(negocio, lista) {
  const candidatos = lista.filter((r) => descuenta(r.tipo))
  if (candidatos.length === 0) return colaReparar
  colaReparar = colaReparar.then(async () => {
    try {
      const { data, error } = await supabase.from('movimientos_mercancia').select('nota')
        .eq('negocio', negocio.codigo_negocio).eq('tipo', 'salida').eq('anulado', false)
        .like('nota', MARCA + '%').limit(2000)
      if (error) return
      const existentes = new Set((data || []).map((m) => String(m.nota).slice(MARCA.length).split(' ')[0]))
      const faltan = candidatos.filter((r) => !existentes.has(String(r.id)))
      if (faltan.length === 0) return
      await supabase.from('movimientos_mercancia').insert(faltan.map((r) => ({
        negocio: negocio.codigo_negocio,
        tipo: 'salida',
        usuario: r.usuario || 'sistema',
        codigo: r.codigo,
        nombre: r.nombre,
        cantidad: r.cantidad,
        unidad_medida: r.unidad_medida,
        origen: r.ubicacion,
        destino: 'Reporte',
        nota: MARCA + r.id + ' ' + (TIPOS_REPORTE[r.tipo] || r.tipo)
      })))
    } catch (e) { /* si falla, se intenta la proxima vez que se abra la pantalla */ }
  })
  return colaReparar
}

// Trae los reportes (pendientes primero, luego los cerrados) y cuanto se reintegro de cada uno.
// Si se pasa un codigo, solo los de ese producto. Se usa en Reportar, Inicio y el buscador.
export async function cargarReportes(negocio, codigo, limite = 60) {
  let q = supabase.from('reportes_mercancia')
    .select('id, codigo, nombre, cantidad, unidad_medida, tipo, ubicacion, fecha_vencimiento, nota, usuario, creado_en, estado, resuelto_en')
    .eq('negocio', negocio.codigo_negocio).eq('anulado', false)
  if (codigo) q = q.eq('codigo', codigo)
  const { data, error } = await q.order('creado_en', { ascending: false }).limit(limite)
  if (error) return []
  // Los reintegros son ingresos cuya nota empieza por REPORTE#<id>
  let q2 = supabase.from('movimientos_mercancia').select('nota, cantidad')
    .eq('negocio', negocio.codigo_negocio).eq('tipo', 'ingreso').eq('anulado', false).like('nota', MARCA + '%')
  if (codigo) q2 = q2.eq('codigo', codigo)
  const rein = await q2.order('creado_en', { ascending: false }).limit(500)
  const porReporte = {}
  ;(rein.data || []).forEach((m) => {
    const id = String(m.nota).slice(MARCA.length).split(' ')[0]
    porReporte[id] = (porReporte[id] || 0) + (Number(m.cantidad) || 0)
  })
  const lista = (data || []).map((r) => ({ ...r, reintegrado: porReporte[String(r.id)] || 0 }))
  await repararDescuentos(negocio, lista)
  return [...lista.filter((r) => r.estado === 'pendiente'), ...lista.filter((r) => r.estado !== 'pendiente')]
}

// Unidades que quedaron descontadas por un reporte = lo reportado - lo que reintegraron
export function unidadesDescontadas(r) {
  return Math.max(0, Number(r.cantidad) - (Number(r.reintegrado) || 0))
}

// Los reportes hechos con la version anterior no descontaron nada. Si falta el descuento, se crea ahora.
async function asegurarDescuento(r, negocio, nombreUsuario) {
  const ya = await supabase.from('movimientos_mercancia').select('id')
    .eq('negocio', negocio.codigo_negocio).eq('tipo', 'salida').eq('anulado', false)
    .like('nota', MARCA + r.id + ' %').limit(1)
  if (ya.error) return ya.error.message
  if (ya.data && ya.data.length > 0) return null
  const m = await supabase.from('movimientos_mercancia').insert({
    negocio: negocio.codigo_negocio,
    tipo: 'salida',
    usuario: nombreUsuario,
    codigo: r.codigo,
    nombre: r.nombre,
    cantidad: r.cantidad,
    unidad_medida: r.unidad_medida,
    origen: r.ubicacion,
    destino: 'Reporte',
    nota: MARCA + r.id + ' ' + (TIPOS_REPORTE[r.tipo] || r.tipo)
  })
  return m.error ? m.error.message : null
}

const fechaCorta = (f) => new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const fechaLarga = (f) => new Date(f).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const estiloBoton = { padding: '6px 10px', background: 'white', border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 13, cursor: 'pointer' }

function ReporteItem({ r, negocio, nombreUsuario, onCambio }) {
  const [abierto, setAbierto] = useState(false)   // formulario de "Reintegraron"
  const [cant, setCant] = useState(String(r.cantidad))
  const [mensaje, setMensaje] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const descontado = descuenta(r.tipo)
  const cerrado = r.estado === 'resuelto'
  const reint = Number(r.reintegrado) || 0

  // Reintegraron: la mercancia vuelve a entrar al mismo sitio de donde salio
  async function reintegrar() {
    const c = leerNumero(cant)
    if (!(c > 0) || c > Number(r.cantidad)) { setMensaje('Escribe una cantidad entre 0 y ' + r.cantidad); return }
    setTrabajando(true)
    setMensaje('')
    const falla = await asegurarDescuento(r, negocio, nombreUsuario)
    if (falla) { setMensaje('No se pudo descontar: ' + falla); setTrabajando(false); return }
    // El ingreso necesita un costo: se usa el precio de compra actual del producto
    const p = await supabase.from('productos').select('precio_de_compra')
      .eq('establecimiento', negocio.codigo_negocio).eq('codigo', r.codigo).maybeSingle()
    const costo = p.data ? Number(p.data.precio_de_compra) || 0 : 0
    const a = await supabase.from('movimientos_mercancia').insert({
      negocio: negocio.codigo_negocio,
      tipo: 'ingreso',
      usuario: nombreUsuario,
      codigo: r.codigo,
      nombre: r.nombre,
      cantidad: c,
      unidad_medida: r.unidad_medida,
      costo: costo,
      destino: r.ubicacion,
      nota: MARCA + r.id + ' Reintegro'
    })
    if (a.error) { setMensaje('No se pudo reintegrar: ' + a.error.message); setTrabajando(false); return }
    const b = await supabase.from('reportes_mercancia')
      .update({ estado: 'resuelto', resuelto_en: new Date().toISOString() }).eq('id', r.id)
    if (b.error) { setMensaje('Entró la mercancía pero no se cerró el reporte: ' + b.error.message); setTrabajando(false); return }
    setTrabajando(false)
    onCambio()
  }

  // Pérdida: se cierra sin devolver nada al saldo
  async function perdida() {
    if (!confirm('¿Cerrar como pérdida? La mercancía no vuelve a entrar y queda descontada.')) return
    setTrabajando(true)
    const falla = await asegurarDescuento(r, negocio, nombreUsuario)
    if (falla) { setMensaje('No se pudo descontar: ' + falla); setTrabajando(false); return }
    const b = await supabase.from('reportes_mercancia')
      .update({ estado: 'resuelto', resuelto_en: new Date().toISOString() }).eq('id', r.id)
    setTrabajando(false)
    if (b.error) { setMensaje('No se pudo cerrar: ' + b.error.message); return }
    onCambio()
  }

  // Marcar resuelto (por vencerse / otro): no mueve mercancia
  async function resolver() {
    setTrabajando(true)
    const b = await supabase.from('reportes_mercancia')
      .update({ estado: 'resuelto', resuelto_en: new Date().toISOString() }).eq('id', r.id)
    setTrabajando(false)
    if (b.error) { setMensaje('No se pudo marcar: ' + b.error.message); return }
    onCambio()
  }

  // Anular: el reporte fue un error. Tambien se anula el descuento que hizo.
  async function anular() {
    if (!confirm('¿Anular este reporte? (se hizo por error)' + (descontado ? ' La mercancía vuelve a quedar en ' + r.ubicacion + '.' : ''))) return
    setTrabajando(true)
    const b = await supabase.from('reportes_mercancia').update({ anulado: true }).eq('id', r.id)
    if (b.error) { setMensaje('No se pudo anular: ' + b.error.message); setTrabajando(false); return }
    if (descontado) {
      const m = await supabase.from('movimientos_mercancia').update({ anulado: true })
        .eq('negocio', negocio.codigo_negocio).eq('tipo', 'salida').like('nota', MARCA + r.id + ' %')
      if (m.error) { setMensaje('Se anuló el reporte pero no el descuento: ' + m.error.message); setTrabajando(false); return }
    }
    setTrabajando(false)
    onCambio()
  }

  return (
    <div style={{ fontSize: 13, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '8px 0' }}>
      <div style={{ color: '#111417' }}>
        <b>{r.nombre}</b>
      </div>
      <div>
        {TIPOS_REPORTE[r.tipo] || r.tipo} · {r.cantidad} {r.unidad_medida} · {r.ubicacion}
        {r.fecha_vencimiento ? ' · vence ' + r.fecha_vencimiento : ''}
      </div>
      {descontado && !cerrado && <div>Ya se descontó de {r.ubicacion}.</div>}
      {r.nota && <div>Nota: {r.nota}</div>}
      <div>{r.usuario} · {fechaCorta(r.creado_en)}</div>

      {mensaje && <div style={{ color: '#DC2626', marginTop: 4 }}>{mensaje}</div>}

      {/* Reporte ya revisado: se muestra como quedo, sin botones */}
      {cerrado && (
        <div style={{ marginTop: 4, color: '#16A34A' }}>
          {!descontado && 'Resuelto el ' + fechaLarga(r.resuelto_en || r.creado_en) + '.'}
          {descontado && reint <= 0 && 'Revisado el ' + fechaLarga(r.resuelto_en || r.creado_en) + ': no se reintegró la mercancía. Quedó descontada.'}
          {descontado && reint > 0 && 'Revisado el ' + fechaLarga(r.resuelto_en || r.creado_en) + ': se reintegraron ' + reint + ' ' + (r.unidad_medida || '') + ' a ' + r.ubicacion + '.' + (unidadesDescontadas(r) > 0 ? ' Quedaron descontadas ' + unidadesDescontadas(r) + '.' : '')}
        </div>
      )}

      {/* Botones para cerrar el reporte */}
      {!cerrado && !abierto && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {descontado ? (
            <>
              <button style={{ ...estiloBoton, borderColor: '#FF6600', color: '#FF6600' }} disabled={trabajando} onClick={() => setAbierto(true)}>Reintegraron</button>
              <button style={estiloBoton} disabled={trabajando} onClick={perdida}>No reintegraron (pérdida)</button>
            </>
          ) : (
            <button style={estiloBoton} disabled={trabajando} onClick={resolver}>Marcar resuelto</button>
          )}
          <button style={{ ...estiloBoton, color: '#DC2626' }} disabled={trabajando} onClick={anular}>Anular</button>
        </div>
      )}

      {/* Formulario de reintegro: por defecto toda la cantidad; se puede bajar si devolvieron menos */}
      {abierto && (
        <div style={{ marginTop: 6 }}>
          <div style={{ marginBottom: 4 }}>¿Cuántas {r.unidad_medida || 'unidades'} reintegraron a {r.ubicacion}?</div>
          <input
            type="text"
            inputMode="decimal"
            value={cant}
            onChange={(e) => setCant(e.target.value)}
            style={{ width: 120, padding: 8, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, marginRight: 6 }}
          />
          <button style={{ ...estiloBoton, borderColor: '#FF6600', color: '#FF6600' }} disabled={trabajando} onClick={reintegrar}>
            {trabajando ? 'Guardando...' : 'Confirmar'}
          </button>
          <button style={estiloBoton} disabled={trabajando} onClick={() => { setAbierto(false); setMensaje('') }}>Cancelar</button>
          <div style={{ fontSize: 12, marginTop: 4 }}>Si reintegran menos, lo que falte queda como pérdida.</div>
        </div>
      )}
    </div>
  )
}

export default ReporteItem