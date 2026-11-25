// =====================================================================
// EMPEZAR DE CERO: borra TODO de este negocio y lo deja completamente limpio.
//   - productos
//   - conteos (lo que contaron los muchachos)
//   - ingresos, salidas y saldos de inventario
//   - reportes de mercancia
//   - los inventarios abiertos/cerrados (ciclo de inventario)
//   - Google Sheets: Bodega, Tienda y Log quedan vacios (con su encabezado)
// No se puede deshacer. La pantalla de Configuracion pide antes el respaldo y la clave del administrador.
// =====================================================================
import { supabase } from './supabaseClient'
import { limpiarCola } from './colaSheets'

export async function limpiarTodo(negocio, avisar) {
  const decir = avisar || function () {}
  const neg = negocio.codigo_negocio

  // Cada tabla con la columna que dice a que negocio pertenece
  const tablas = [
    ['movimientos_mercancia', 'negocio', 'ingresos y salidas'],
    ['reportes_mercancia', 'negocio', 'reportes de mercancía'],
    ['movimientos', 'negocio', 'conteos'],
    ['productos', 'establecimiento', 'productos']
  ]
  for (let i = 0; i < tablas.length; i++) {
    decir('Borrando ' + tablas[i][2] + '...')
    const r = await supabase.from(tablas[i][0]).delete().eq(tablas[i][1], neg)
    if (r.error) throw new Error(tablas[i][2] + ': ' + r.error.message)
  }

  // El ciclo de inventarios vuelve a empezar (si la tabla todavia no existe, se ignora)
  await supabase.from('inventarios').delete().eq('negocio', neg)

  decir('Limpiando Google Sheets...')
  limpiarCola(neg) // descarta envios pendientes de este celular
  const respuesta = await fetch(negocio.apps_script_url, {
    method: 'POST',
    body: JSON.stringify({ accion: 'vaciarTodo' })
  })
  const datos = await respuesta.json()
  if (datos.error) throw new Error('Sheets: ' + datos.error)
}
