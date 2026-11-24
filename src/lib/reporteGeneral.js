// =====================================================================
// Reporte general de la mercancia en Excel (el del Inicio): lo que entra y sale, no el conteo del inventario.
// Hojas:
//   Ingresos        : todo lo que entro a Bodega (quien, cuando, cuanto, costo)
//   Salidas         : todo lo que salio de Bodega (a Tienda u otro destino)
//   Reportes        : mercancia vencida, por vencerse, para devolver, danada u otra
//   Stock de Bodega : stock inicial + ingresos - salidas = stock actual, con el minimo y el maximo si se definieron
// Solo cuenta lo que NO esta anulado (las hojas de ingresos y salidas muestran los anulados marcados).
// =====================================================================
import * as XLSX from 'xlsx'
import { supabase } from './supabaseClient'

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

// Hoja a partir de una lista de objetos (si esta vacia deja solo el encabezado)
function hoja(filas, encabezado, anchos) {
  const ws = filas.length > 0 ? XLSX.utils.json_to_sheet(filas, { header: encabezado }) : XLSX.utils.aoa_to_sheet([encabezado])
  ws['!cols'] = anchos.map((w) => ({ wch: w }))
  return ws
}

export async function generarReporteGeneral(negocio, avisar) {
  const neg = negocio.codigo_negocio
  const decir = avisar || function () {}

  decir('Leyendo ingresos y salidas...')
  const mercancia = await leerTodo(() =>
    supabase.from('movimientos_mercancia').select('*').eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
  )
  decir('Leyendo reportes...')
  let reportes = []
  try {
    reportes = await leerTodo(() =>
      supabase.from('reportes_mercancia').select('*').eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
    )
  } catch (e) { reportes = [] }
  decir('Leyendo productos...')
  const productos = await leerTodo(() =>
    supabase.from('productos').select('codigo, nombre, unidad_medida, precio_de_compra, stock_minimo, stock_maximo')
      .eq('establecimiento', neg).order('codigo')
  )
  const prod = new Map(productos.map((p) => [String(p.codigo), p]))

  // ---- Stock de Bodega por producto: inicial + ingresos - salidas ----
  const stock = new Map()
  mercancia.filter((m) => !m.anulado).forEach((m) => {
    const cod = String(m.codigo)
    if (!stock.has(cod)) stock.set(cod, { cod, nombre: m.nombre, inicial: 0, ingresos: 0, salidas: 0 })
    const s = stock.get(cod)
    const c = Number(m.cantidad) || 0
    if (m.tipo === 'inventario' && m.destino === 'Bodega') s.inicial += c
    if (m.tipo === 'ingreso') s.ingresos += c
    if (m.tipo === 'salida') s.salidas += c
  })
  const filasStock = Array.from(stock.values()).map((s) => {
    const p = prod.get(s.cod)
    const actual = s.inicial + s.ingresos - s.salidas
    const min = p && p.stock_minimo !== null && p.stock_minimo !== undefined ? Number(p.stock_minimo) : null
    const max = p && p.stock_maximo !== null && p.stock_maximo !== undefined ? Number(p.stock_maximo) : null
    let estado = ''
    if (min !== null && actual < min) estado = 'Hay poquito'
    else if (max !== null && actual > max) estado = 'Hay mucho'
    else if (min !== null || max !== null) estado = 'Normal'
    return {
      Codigo: s.cod, Nombre: p ? p.nombre : s.nombre, Medida: p && p.unidad_medida ? p.unidad_medida : '',
      'Stock inicial': redondear(s.inicial), Ingresos: redondear(s.ingresos), Salidas: redondear(s.salidas), 'Stock actual': redondear(actual),
      Minimo: min === null ? '' : min, Maximo: max === null ? '' : max, Estado: estado
    }
  }).sort((a, b) => String(a.Nombre).localeCompare(String(b.Nombre)))

  const filasIngresos = mercancia.filter((m) => m.tipo === 'ingreso').map((m) => ({
    Fecha: fecha(m.creado_en), Persona: m.usuario, Codigo: String(m.codigo), Nombre: m.nombre, Cantidad: Number(m.cantidad) || 0,
    Medida: m.unidad_medida || '', 'Costo por medida': m.costo === null || m.costo === undefined ? '' : Number(m.costo),
    Valor: Math.round((Number(m.cantidad) || 0) * (Number(m.costo) || 0)), Nota: m.nota || '', Anulado: m.anulado ? 'SI' : ''
  }))
  const filasSalidas = mercancia.filter((m) => m.tipo === 'salida').map((m) => ({
    Fecha: fecha(m.creado_en), Persona: m.usuario, Codigo: String(m.codigo), Nombre: m.nombre, Cantidad: Number(m.cantidad) || 0,
    Medida: m.unidad_medida || '', Destino: m.destino || '', Nota: m.nota || '', Anulado: m.anulado ? 'SI' : ''
  }))
  const filasReportes = reportes.map((m) => ({
    Fecha: fecha(m.creado_en), Tipo: m.tipo, Ubicacion: m.ubicacion || '', Persona: m.usuario, Codigo: String(m.codigo), Nombre: m.nombre,
    Cantidad: Number(m.cantidad) || 0, Medida: m.unidad_medida || '', Vence: m.fecha_vencimiento || '', Estado: m.estado, Nota: m.nota || '', Anulado: m.anulado ? 'SI' : ''
  }))

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja(filasIngresos, ['Fecha', 'Persona', 'Codigo', 'Nombre', 'Cantidad', 'Medida', 'Costo por medida', 'Valor', 'Nota', 'Anulado'], [20, 16, 18, 44, 10, 10, 16, 14, 30, 9]), 'Ingresos')
  XLSX.utils.book_append_sheet(libro, hoja(filasSalidas, ['Fecha', 'Persona', 'Codigo', 'Nombre', 'Cantidad', 'Medida', 'Destino', 'Nota', 'Anulado'], [20, 16, 18, 44, 10, 10, 14, 30, 9]), 'Salidas')
  XLSX.utils.book_append_sheet(libro, hoja(filasReportes, ['Fecha', 'Tipo', 'Ubicacion', 'Persona', 'Codigo', 'Nombre', 'Cantidad', 'Medida', 'Vence', 'Estado', 'Nota', 'Anulado'], [20, 14, 12, 16, 18, 44, 10, 10, 12, 11, 30, 9]), 'Reportes')
  XLSX.utils.book_append_sheet(libro, hoja(filasStock, ['Codigo', 'Nombre', 'Medida', 'Stock inicial', 'Ingresos', 'Salidas', 'Stock actual', 'Minimo', 'Maximo', 'Estado'], [18, 44, 10, 13, 11, 11, 13, 10, 10, 13]), 'Stock de Bodega')

  const hoy = new Date()
  const archivo = 'reporte-general-' + neg + '-' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0') + '.xlsx'
  XLSX.writeFile(libro, archivo)
  return { archivo, ingresos: filasIngresos.length, salidas: filasSalidas.length, reportes: filasReportes.length, productos: filasStock.length }
}
