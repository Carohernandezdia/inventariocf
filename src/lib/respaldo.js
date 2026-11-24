// =====================================================================
// Respaldo en Excel: baja a un archivo TODO lo que hay antes de borrar o de empezar un inventario nuevo.
// Hojas: Conteos, Ingresos y salidas, Reportes y Resumen por producto.
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

// Fecha y hora legible para el Excel
function fecha(t) {
  return t ? new Date(t).toLocaleString('es-CO') : ''
}

export async function generarRespaldo(negocio, avisar) {
  const neg = negocio.codigo_negocio
  const decir = avisar || function () {}

  decir('Leyendo los conteos...')
  const conteos = await leerTodo(() =>
    supabase.from('movimientos').select('*').eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
  )

  decir('Leyendo ingresos y salidas...')
  let mercancia = []
  let reportes = []
  try {
    mercancia = await leerTodo(() =>
      supabase.from('movimientos_mercancia').select('*').eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
    )
  } catch (e) { mercancia = [] }
  try {
    reportes = await leerTodo(() =>
      supabase.from('reportes_mercancia').select('*').eq('negocio', neg).order('creado_en', { ascending: true }).order('id')
    )
  } catch (e) { reportes = [] }

  // ---- Resumen por producto: ingresos, salidas a tienda, otras salidas y saldo de bodega registrado ----
  const resumen = new Map()
  function fila(m) {
    if (!resumen.has(m.codigo)) {
      resumen.set(m.codigo, { Codigo: m.codigo, Nombre: m.nombre, Medida: m.unidad_medida || '', Ingresos: 0, 'Salidas a Tienda': 0, 'Otras salidas': 0, 'Saldo Bodega registrado': 0 })
    }
    return resumen.get(m.codigo)
  }
  mercancia.filter((m) => !m.anulado).forEach((m) => {
    const f = fila(m)
    const c = Number(m.cantidad) || 0
    if (m.tipo === 'ingreso') { f.Ingresos += c; f['Saldo Bodega registrado'] += c }
    if (m.tipo === 'inventario' && m.destino === 'Bodega') { f['Saldo Bodega registrado'] += c }
    if (m.tipo === 'salida') {
      if (m.destino === 'Tienda') f['Salidas a Tienda'] += c
      else f['Otras salidas'] += c
      f['Saldo Bodega registrado'] -= c
    }
  })

  const libro = XLSX.utils.book_new()

  const hojaConteos = conteos.map((m) => ({
    Fecha: fecha(m.creado_en), Usuario: m.usuario, Seccion: m.seccion, Codigo: m.codigo, Nombre: m.nombre,
    Cantidad: m.cantidad, Anulado: m.anulado ? 'SI' : '', Nota: m.nota || ''
  }))
  const hojaMov = mercancia.map((m) => ({
    Fecha: fecha(m.creado_en), Tipo: m.tipo, Usuario: m.usuario, Codigo: m.codigo, Nombre: m.nombre,
    Cantidad: m.cantidad, Medida: m.unidad_medida || '', Costo: m.costo === null ? '' : m.costo,
    Origen: m.origen || '', Destino: m.destino || '', Nota: m.nota || '', Anulado: m.anulado ? 'SI' : ''
  }))
  const hojaRep = reportes.map((m) => ({
    Fecha: fecha(m.creado_en), Tipo: m.tipo, Ubicacion: m.ubicacion, Usuario: m.usuario, Codigo: m.codigo, Nombre: m.nombre,
    Cantidad: m.cantidad, Medida: m.unidad_medida || '', Vence: m.fecha_vencimiento || '', Nota: m.nota || '',
    Estado: m.estado, Anulado: m.anulado ? 'SI' : ''
  }))

  // Una hoja vacia con encabezado minimo, para que el archivo siempre tenga las 4 hojas
  function agregar(nombreHoja, filas, encabezado) {
    const hoja = filas.length > 0 ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([encabezado])
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja)
  }
  agregar('Conteos', hojaConteos, ['Fecha', 'Usuario', 'Seccion', 'Codigo', 'Nombre', 'Cantidad', 'Anulado', 'Nota'])
  agregar('Ingresos y salidas', hojaMov, ['Fecha', 'Tipo', 'Usuario', 'Codigo', 'Nombre', 'Cantidad'])
  agregar('Reportes', hojaRep, ['Fecha', 'Tipo', 'Ubicacion', 'Usuario', 'Codigo', 'Nombre', 'Cantidad'])
  agregar('Resumen por producto', Array.from(resumen.values()), ['Codigo', 'Nombre', 'Medida', 'Ingresos', 'Salidas a Tienda', 'Otras salidas', 'Saldo Bodega registrado'])

  const hoy = new Date()
  const nombreArchivo = 'respaldo-' + neg + '-' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0') + '.xlsx'
  XLSX.writeFile(libro, nombreArchivo)

  return { conteos: conteos.length, mercancia: mercancia.length, reportes: reportes.length, archivo: nombreArchivo }
}
