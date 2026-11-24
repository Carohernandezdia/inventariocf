// =====================================================================
// Reporte del inventario en Excel (para que el supermercado revise sin tocar el Google Sheets).
// Hojas:
//   Totales              : plata y unidades de Bodega y Tienda, y cuantos envios hubo
//   Resumen por producto : lo contado de cada producto en Bodega y Tienda, con su valor
//   Para revisar         : lo que mas pesa en plata y lo que parece un error (ej. cajas contadas como unidades)
//   Detalle de envios    : quien envio que, cuando y en que seccion (y quien corrigio)
//   Por persona          : cuanto envio cada persona
//   Sin contar           : productos de la lista que nadie ha contado
// Solo cuenta lo que NO esta anulado. Si los productos traen "existencia" tambien muestra la diferencia.
// =====================================================================
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

// Un envio de esta cantidad o mas se marca "para revisar" (suele ser error de unidad contra caja)
const ENVIO_GRANDE = 100
// Cuantos productos de mayor valor se muestran siempre en "Para revisar"
const TOP_VALOR = 40

// Lee TODAS las filas de una consulta (Supabase entrega maximo 1000 por vez)
async function leerTodo(armarConsulta) {
  const todo = []
  const TAM = 1000
  for (let desde = 0; ; desde += TAM) {
    const { data, error } = await armarConsulta().range(desde, desde + TAM - 1)
    if (error) throw new Error(error.message)
    todo.push(...data)
    if (data.length < TAM) break
  }
  return todo
}

const fecha = (t) => (t ? new Date(t).toLocaleString('es-CO') : '')
const redondear = (n) => Math.round((Number(n) || 0) * 1000) / 1000

// Arma una hoja a partir de una lista de objetos (si esta vacia deja solo el encabezado) y ajusta anchos
function hoja(filas, encabezado, anchos) {
  const ws = filas.length > 0 ? XLSX.utils.json_to_sheet(filas, { header: encabezado }) : XLSX.utils.aoa_to_sheet([encabezado])
  ws['!cols'] = (anchos || encabezado.map(() => 16)).map((w) => ({ wch: w }))
  return ws
}

export async function generarReporteInventario(negocio, avisar) {
  const neg = negocio.codigo_negocio
  const decir = avisar || function () {}

  decir('Leyendo los conteos...')
  const conteos = await leerTodo(() =>
    supabase.from('movimientos').select('id, usuario, seccion, codigo, nombre, cantidad, anulado, corrige_id, nota, creado_en')
      .eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
  )
  decir('Leyendo los productos...')
  const productos = await leerTodo(() =>
    supabase.from('productos').select('codigo, nombre, precio_de_compra, unidad_medida, existencia')
      .eq('establecimiento', neg).order('codigo')
  )
  const prod = new Map(productos.map((p) => [String(p.codigo), p]))
  const hayExistencia = productos.some((p) => p.existencia !== null && p.existencia !== undefined && Number(p.existencia) !== 0)

  decir('Calculando...')
  const vigentes = conteos.filter((m) => !m.anulado)

  // ---- Suma por producto ----
  const porProd = new Map()
  const porPersona = new Map()
  vigentes.forEach((m) => {
    const cod = String(m.codigo)
    const cant = Number(m.cantidad) || 0
    if (!porProd.has(cod)) porProd.set(cod, { cod, nombre: m.nombre, bodega: 0, tienda: 0, maxEnvio: 0, envios: 0 })
    const f = porProd.get(cod)
    if (m.seccion === 'Bodega') f.bodega += cant
    if (m.seccion === 'Tienda') f.tienda += cant
    if (cant > f.maxEnvio) f.maxEnvio = cant
    f.envios++

    const p = prod.get(cod)
    const precio = p ? Number(p.precio_de_compra) || 0 : 0
    const u = m.usuario || 'sin nombre'
    if (!porPersona.has(u)) porPersona.set(u, { Persona: u, Envios: 0, Unidades: 0, Valor: 0 })
    const pp = porPersona.get(u)
    pp.Envios++
    pp.Unidades += cant
    pp.Valor += cant * precio
  })

  // ---- Filas del resumen ----
  const resumen = []
  let valBodega = 0, valTienda = 0, undBodega = 0, undTienda = 0, sinPrecio = 0
  porProd.forEach((f) => {
    const p = prod.get(f.cod)
    const precio = p ? Number(p.precio_de_compra) || 0 : 0
    const total = f.bodega + f.tienda
    const vB = f.bodega * precio, vT = f.tienda * precio
    valBodega += vB; valTienda += vT; undBodega += f.bodega; undTienda += f.tienda
    if (precio === 0) sinPrecio++

    const motivos = []
    if (p === undefined) motivos.push('El producto ya no está en la lista')
    if (precio === 0) motivos.push('Sin precio (su valor sale en cero)')
    if (f.maxEnvio >= ENVIO_GRANDE) motivos.push('Un envío de ' + redondear(f.maxEnvio) + ' (¿unidad o caja?)')
    let existencia = ''
    let diferencia = ''
    if (hayExistencia && p && p.existencia !== null && p.existencia !== undefined) {
      existencia = Number(p.existencia) || 0
      diferencia = redondear(total - existencia)
      const grande = Math.abs(diferencia) >= 5 && Math.abs(diferencia) > 0.5 * Math.max(existencia, 1)
      if (grande) motivos.push('Muy distinto a la existencia del sistema (' + existencia + ')')
    }

    const fila = {
      Codigo: f.cod, Nombre: p ? p.nombre : f.nombre, Medida: p && p.unidad_medida ? p.unidad_medida : '',
      Precio: precio, 'Cant. Bodega': redondear(f.bodega), 'Cant. Tienda': redondear(f.tienda), 'Cant. Total': redondear(total),
      'Valor Bodega': Math.round(vB), 'Valor Tienda': Math.round(vT), 'Valor Total': Math.round(vB + vT)
    }
    if (hayExistencia) { fila['Existencia sistema'] = existencia; fila.Diferencia = diferencia }
    fila._motivos = motivos
    resumen.push(fila)
  })
  resumen.sort((a, b) => b['Valor Total'] - a['Valor Total'])

  // ---- Para revisar: los de mayor valor + los que tienen algun motivo ----
  resumen.slice(0, TOP_VALOR).forEach((f) => { f._motivos.unshift('Está entre los ' + TOP_VALOR + ' que más valen') })
  const paraRevisar = resumen.filter((f) => f._motivos.length > 0).map((f) => {
    const o = { ...f, Motivo: f._motivos.join(' · ') }
    delete o._motivos
    return o
  })
  const resumenLimpio = resumen.map((f) => { const o = { ...f }; delete o._motivos; return o })

  // ---- Detalle de envios (todos, los anulados marcados) ----
  const detalle = conteos.map((m) => {
    const p = prod.get(String(m.codigo))
    const precio = p ? Number(p.precio_de_compra) || 0 : 0
    return {
      Fecha: fecha(m.creado_en), Persona: m.usuario, Seccion: m.seccion, Codigo: String(m.codigo), Nombre: m.nombre,
      Cantidad: Number(m.cantidad) || 0, Precio: precio, Valor: Math.round((Number(m.cantidad) || 0) * precio), Anulado: m.anulado ? 'SI' : '',
      'Es corrección': m.corrige_id ? 'SI' : '', Nota: m.nota || ''
    }
  })

  // ---- Productos sin contar ----
  const sinContar = productos.filter((p) => !porProd.has(String(p.codigo))).map((p) => ({
    Codigo: String(p.codigo), Nombre: p.nombre, Medida: p.unidad_medida || '', Precio: Number(p.precio_de_compra) || 0,
    'Existencia sistema': p.existencia === null || p.existencia === undefined ? '' : p.existencia
  }))

  // ---- Totales ----
  const hoy = new Date()
  const totales = [
    ['Reporte del inventario - ' + negocio.nombre_negocio, ''],
    ['Fecha del reporte', hoy.toLocaleString('es-CO')],
    ['', ''],
    ['Valor en Bodega', Math.round(valBodega)],
    ['Valor en Tienda', Math.round(valTienda)],
    ['VALOR TOTAL', Math.round(valBodega + valTienda)],
    ['', ''],
    ['Unidades contadas en Bodega', redondear(undBodega)],
    ['Unidades contadas en Tienda', redondear(undTienda)],
    ['', ''],
    ['Productos contados', porProd.size],
    ['Productos sin contar', sinContar.length],
    ['Productos contados sin precio', sinPrecio],
    ['Productos para revisar', paraRevisar.length],
    ['Envíos corregidos (anulados)', conteos.length - vigentes.length]
  ]
  const wsTot = XLSX.utils.aoa_to_sheet(totales)
  wsTot['!cols'] = [{ wch: 36 }, { wch: 26 }]

  const colsResumen = ['Codigo', 'Nombre', 'Medida', 'Precio', 'Cant. Bodega', 'Cant. Tienda', 'Cant. Total', 'Valor Bodega', 'Valor Tienda', 'Valor Total']
  if (hayExistencia) colsResumen.push('Existencia sistema', 'Diferencia')
  const anchosResumen = [18, 44, 10, 12, 13, 13, 12, 15, 15, 15].concat(hayExistencia ? [16, 12] : [])

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, wsTot, 'Totales')
  XLSX.utils.book_append_sheet(libro, hoja(resumenLimpio, colsResumen, anchosResumen), 'Resumen por producto')
  XLSX.utils.book_append_sheet(libro, hoja(paraRevisar, colsResumen.concat(['Motivo']), anchosResumen.concat([60])), 'Para revisar')
  XLSX.utils.book_append_sheet(libro, hoja(detalle, ['Fecha', 'Persona', 'Seccion', 'Codigo', 'Nombre', 'Cantidad', 'Precio', 'Valor', 'Anulado', 'Es corrección', 'Nota'], [20, 16, 10, 18, 44, 10, 12, 14, 9, 14, 30]), 'Detalle de envios')
  XLSX.utils.book_append_sheet(libro, hoja(Array.from(porPersona.values()).map((x) => ({ ...x, Unidades: redondear(x.Unidades), Valor: Math.round(x.Valor) })).sort((a, b) => b.Envios - a.Envios), ['Persona', 'Envios', 'Unidades', 'Valor'], [20, 10, 12, 16]), 'Por persona')
  XLSX.utils.book_append_sheet(libro, hoja(sinContar, ['Codigo', 'Nombre', 'Medida', 'Precio', 'Existencia sistema'], [18, 44, 10, 12, 16]), 'Sin contar')

  const archivo = 'reporte-inventario-' + negocio.codigo_negocio + '-' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0') + '.xlsx'
  XLSX.writeFile(libro, archivo)

  return { archivo, productos: porProd.size, paraRevisar: paraRevisar.length, valorTotal: Math.round(valBodega + valTienda) }
}
