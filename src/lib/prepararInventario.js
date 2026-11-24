// =====================================================================
// "Preparar nuevo inventario": cierra el conteo y deja todo listo para el siguiente.
//   1) El saldo de Bodega pasa a ser lo CONTADO (queda guardado como movimiento 'inventario').
//   2) Los conteos viejos se marcan como cerrados (no se borran; el respaldo en Excel los tiene).
//   3) El Google Sheets se renueva: guarda una copia con la fecha de las hojas viejas,
//      y deja Bodega con la Existencia = lo contado, Tienda en cero, Cantidad vacia y el costo al dia.
// =====================================================================
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

export async function prepararInventario(negocio, usuario, avisar) {
  const neg = negocio.codigo_negocio
  const hoy = new Date().toISOString().slice(0, 10)

  // 1) Lo contado en Bodega, por producto
  avisar('Leyendo lo contado...')
  const conteos = await leerTodo(() =>
    supabase.from('movimientos').select('codigo, cantidad').eq('negocio', neg).eq('seccion', 'Bodega').eq('anulado', false).order('id')
  )
  const contado = new Map()
  conteos.forEach((m) => contado.set(m.codigo, (contado.get(m.codigo) || 0) + (Number(m.cantidad) || 0)))

  // 2) Saldo de Bodega que llevaba la aplicacion (ingresos + saldos de inventario - salidas)
  avisar('Calculando saldos...')
  const movs = await leerTodo(() =>
    supabase.from('movimientos_mercancia').select('id, tipo, codigo, cantidad, destino').eq('negocio', neg).eq('anulado', false).order('id')
  )
  const saldo = new Map()
  movs.forEach((m) => {
    const c = Number(m.cantidad) || 0
    let delta = 0
    if (m.tipo === 'ingreso') delta = c
    else if (m.tipo === 'inventario' && m.destino === 'Bodega') delta = c
    else if (m.tipo === 'salida') delta = -c
    if (delta !== 0) saldo.set(m.codigo, (saldo.get(m.codigo) || 0) + delta)
  })

  // 3) Todos los productos (con su costo actual)
  const productos = await leerTodo(() =>
    supabase.from('productos').select('codigo, nombre, precio_de_compra, unidad_medida').eq('establecimiento', neg).order('codigo')
  )

  // 4) Ajustes para que el saldo de Bodega quede igual a lo contado
  avisar('Guardando saldos de Bodega...')
  const ajustes = []
  productos.forEach((p) => {
    const diff = (contado.get(p.codigo) || 0) - (saldo.get(p.codigo) || 0)
    if (Math.abs(diff) > 0.000001) {
      ajustes.push({
        negocio: neg, tipo: 'inventario', usuario: usuario || 'admin', codigo: p.codigo, nombre: p.nombre,
        cantidad: diff, unidad_medida: p.unidad_medida || null, destino: 'Bodega', nota: 'Cierre de inventario ' + hoy
      })
    }
  })
  for (let i = 0; i < ajustes.length; i += 500) {
    const r = await supabase.from('movimientos_mercancia').insert(ajustes.slice(i, i + 500))
    if (r.error) throw new Error('saldos: ' + r.error.message)
  }

  // 5) El Google Sheets: copia con fecha de las hojas viejas y hojas nuevas listas para contar
  const BLOQUE = 1000
  for (let i = 0; i < productos.length; i += BLOQUE) {
    avisar('Actualizando Google Sheets: ' + Math.min(i + BLOQUE, productos.length) + ' de ' + productos.length + '...')
    const lote = productos.slice(i, i + BLOQUE).map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      precio: Number(p.precio_de_compra) || 0,
      existenciaBodega: Math.max(0, Math.round(((contado.get(p.codigo) || 0)) * 1000) / 1000)
    }))
    const resp = await fetch(negocio.apps_script_url, {
      method: 'POST',
      body: JSON.stringify({ accion: 'prepararInventario', primerBloque: i === 0, fecha: hoy, productos: lote })
    })
    const datos = await resp.json()
    if (datos.error) throw new Error('Sheets: ' + datos.error)
  }

  // 6) Solo si todo salio bien: los conteos viejos quedan cerrados (el nuevo conteo empieza en cero)
  avisar('Cerrando el conteo anterior...')
  const cierre = await supabase.from('movimientos').update({ anulado: true, nota: 'Inventario cerrado ' + hoy })
    .eq('negocio', neg).eq('anulado', false)
  if (cierre.error) throw new Error('cierre: ' + cierre.error.message)

  return { productos: productos.length, ajustes: ajustes.length, fecha: hoy }
}
