// =====================================================================
// CICLO DE INVENTARIO: abierto / cerrado.
//
//  - Mientras el inventario esta ABIERTO se puede contar (Bodega, Tienda, codigo de barras).
//  - Al CERRARLO, lo contado se guarda como STOCK INICIAL de cada producto (en Bodega y en Tienda)
//    y el contador queda en cero hasta el proximo inventario. Los conteos NO se borran: quedan guardados.
//  - Desde el cierre, el saldo de cada producto = stock inicial + ingresos - salidas.
//  - En el SIGUIENTE inventario, lo que se cuente NO se suma al saldo: se compara contra el saldo esperado.
//    (Solo el primer inventario es "provisional": lo contado se ve ya en Bodega mientras se cuenta.)
//
// Se guarda en la tabla "inventarios" (ver 01_crear_tabla_inventarios.sql).
// Si todavia no hay ninguna fila, el inventario se considera ABIERTO (asi siguen funcionando las pruebas).
// =====================================================================
import { supabase } from './supabaseClient'

const INICIO_DE_LOS_TIEMPOS = '1970-01-01T00:00:00.000Z'

// Guarda la respuesta unos segundos para no preguntar en cada pantalla
const cache = { negocio: null, hora: 0, valor: null }

// Devuelve el estado actual del inventario:
//   abierto, numero, desde (cuando empezo el que se muestra), hasta (cuando cerro, o null),
//   ultimoCierre (fecha del ultimo cierre, o null), numeroUltimoCierre, hayCierreAnterior, sinTabla
export async function estadoInventario(negocio, forzar) {
  const neg = negocio.codigo_negocio
  if (!forzar && cache.negocio === neg && Date.now() - cache.hora < 5000) return cache.valor

  const { data, error } = await supabase.from('inventarios').select('*')
    .eq('negocio', neg).order('id', { ascending: false }).limit(50)

  let v
  if (error) {
    // La tabla todavia no existe: se trabaja como antes (siempre abierto) y se avisa
    v = { abierto: true, numero: 1, desde: INICIO_DE_LOS_TIEMPOS, hasta: null, ultimoCierre: null, numeroUltimoCierre: 0, hayCierreAnterior: false, sinTabla: true, error: error.message }
  } else if (!data || data.length === 0) {
    // Nunca se ha cerrado nada: el inventario de pruebas / el primero
    v = { abierto: true, numero: 1, desde: INICIO_DE_LOS_TIEMPOS, hasta: null, ultimoCierre: null, numeroUltimoCierre: 0, hayCierreAnterior: false, sinFilas: true }
  } else {
    const ultima = data[0]
    const cerradas = data.filter((f) => f.estado === 'cerrado')
    const ultimaCerrada = cerradas.length > 0 ? cerradas[0] : null
    if (ultima.estado === 'abierto') {
      v = {
        abierto: true, id: ultima.id, numero: ultima.numero,
        desde: ultima.abierto_en, hasta: null,
        ultimoCierre: ultimaCerrada ? ultimaCerrada.cerrado_en : null,
        numeroUltimoCierre: ultimaCerrada ? ultimaCerrada.numero : 0,
        hayCierreAnterior: !!ultimaCerrada
      }
    } else {
      v = {
        abierto: false, id: ultima.id, numero: ultima.numero,
        desde: ultima.abierto_en, hasta: ultima.cerrado_en,
        ultimoCierre: ultima.cerrado_en, numeroUltimoCierre: ultima.numero,
        hayCierreAnterior: true
      }
    }
  }
  cache.negocio = neg
  cache.hora = Date.now()
  cache.valor = v
  return v
}

// Lee TODAS las filas de una consulta (Supabase entrega maximo 1000 por vez)
async function leerTodo(armarConsulta) {
  const todo = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armarConsulta().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    todo.push(...data)
    if (data.length < 1000) break
  }
  return todo
}

// EMPEZAR un inventario nuevo (solo cuando esta cerrado)
export async function abrirInventario(negocio, usuario) {
  const inv = await estadoInventario(negocio, true)
  if (inv.sinTabla) throw new Error('Falta crear la tabla "inventarios" en Supabase (archivo 01_crear_tabla_inventarios.sql).')
  if (inv.abierto) throw new Error('Ya hay un inventario abierto.')
  const { error } = await supabase.from('inventarios').insert({
    negocio: negocio.codigo_negocio,
    numero: inv.numero + 1,
    estado: 'abierto',
    abierto_por: usuario
  })
  if (error) throw new Error(error.message)
  cache.hora = 0
}

// CERRAR el inventario: lo contado pasa a ser el stock inicial de Bodega y de Tienda.
// Devuelve { productos, bodega, tienda } para mostrarle un resumen.
export async function cerrarInventario(negocio, usuario, avisar) {
  const decir = avisar || function () {}
  const neg = negocio.codigo_negocio
  const inv = await estadoInventario(negocio, true)
  if (inv.sinTabla) throw new Error('Falta crear la tabla "inventarios" en Supabase (archivo 01_crear_tabla_inventarios.sql).')
  if (!inv.abierto) throw new Error('El inventario ya está cerrado.')

  const t0 = new Date().toISOString() // este es el momento del cierre: lo que pase despues cuenta como ingreso/salida nuevo
  const marca = 'CIERRE#' + inv.numero

  // 1) Suma lo contado en este inventario (solo conteos vigentes; las correcciones ya vienen por diferencia)
  decir('Sumando lo contado...')
  const movs = await leerTodo(() =>
    supabase.from('movimientos').select('codigo, nombre, seccion, cantidad')
      .eq('negocio', neg).eq('anulado', false).gte('creado_en', inv.desde).lte('creado_en', t0).order('id')
  )
  const suma = new Map() // 'codigo|seccion' -> { codigo, nombre, seccion, cantidad }
  movs.forEach((m) => {
    if (m.seccion !== 'Bodega' && m.seccion !== 'Tienda') return
    const k = m.codigo + '|' + m.seccion
    const f = suma.get(k) || { codigo: m.codigo, nombre: m.nombre, seccion: m.seccion, cantidad: 0 }
    f.cantidad += Number(m.cantidad) || 0
    suma.set(k, f)
  })

  // 2) Medida y precio de cada producto
  decir('Buscando medidas y precios...')
  const prods = await leerTodo(() =>
    supabase.from('productos').select('codigo, unidad_medida, precio_de_compra')
      .eq('establecimiento', neg).order('codigo')
  )
  const datos = new Map(prods.map((p) => [p.codigo, p]))

  // 3) Si un cierre anterior quedo a medias, se limpia antes de volver a escribir (asi no se duplica)
  decir('Guardando el stock inicial...')
  const limpio = await supabase.from('movimientos_mercancia').delete()
    .eq('negocio', neg).eq('tipo', 'inventario').eq('nota', marca)
  if (limpio.error) throw new Error(limpio.error.message)

  const filas = []
  let bodega = 0, tienda = 0
  const codigos = new Set()
  suma.forEach((f) => {
    if (!f.cantidad) return
    const p = datos.get(f.codigo) || {}
    filas.push({
      negocio: neg,
      tipo: 'inventario',
      usuario: usuario,
      codigo: f.codigo,
      nombre: f.nombre,
      cantidad: f.cantidad,
      unidad_medida: p.unidad_medida || null,
      costo: Number(p.precio_de_compra) || 0,
      destino: f.seccion,
      nota: marca
    })
    codigos.add(f.codigo)
    if (f.seccion === 'Bodega') bodega++; else tienda++
  })
  for (let i = 0; i < filas.length; i += 500) {
    const r = await supabase.from('movimientos_mercancia').insert(filas.slice(i, i + 500))
    if (r.error) throw new Error('Error guardando el stock inicial: ' + r.error.message)
    decir('Guardando el stock inicial... ' + Math.min(i + 500, filas.length) + ' de ' + filas.length)
  }

  // 4) Marca el inventario como cerrado
  decir('Cerrando el inventario...')
  let r
  if (inv.id) {
    r = await supabase.from('inventarios').update({ estado: 'cerrado', cerrado_en: t0, cerrado_por: usuario }).eq('id', inv.id)
  } else {
    // Primer cierre: todavia no habia ninguna fila
    r = await supabase.from('inventarios').insert({
      negocio: neg, numero: inv.numero, estado: 'cerrado',
      abierto_en: INICIO_DE_LOS_TIEMPOS, abierto_por: 'primer inventario',
      cerrado_en: t0, cerrado_por: usuario
    })
  }
  if (r.error) throw new Error('No se pudo cerrar: ' + r.error.message)
  cache.hora = 0
  return { productos: codigos.size, bodega, tienda }
}

// ---------------------------------------------------------------------
// SALDOS DE UN PRODUCTO (los usan el buscador de Inicio y "Sacar")
//   esperadoBodega = stock inicial + ingresos + reintegros - salidas - lo descontado por reportes
//   En el primer inventario (provisional) lo contado en Bodega se suma al saldo mientras se cuenta.
//   En los siguientes, lo contado solo se compara: diferenciaBodega = contado - esperado.
// ---------------------------------------------------------------------
export async function calcularSaldos(negocio, codigo, marcaReporte) {
  const neg = negocio.codigo_negocio
  const inv = await estadoInventario(negocio)
  const [conteos, mercancia] = await Promise.all([
    supabase.from('movimientos').select('seccion, cantidad, creado_en')
      .eq('negocio', neg).eq('codigo', codigo).eq('anulado', false),
    supabase.from('movimientos_mercancia').select('tipo, origen, destino, cantidad, nota, creado_en')
      .eq('negocio', neg).eq('codigo', codigo).eq('anulado', false)
  ])
  if (conteos.error) throw new Error(conteos.error.message)
  if (mercancia.error) throw new Error(mercancia.error.message)

  const r = {
    contadoBodega: 0, contadoTienda: 0, inicialBodega: 0, inicialTienda: 0,
    ingresos: 0, salidas: 0, reintegros: 0, descontado: 0, ingresoTienda: 0
  }

  // Lo contado solo cuenta mientras el inventario esta abierto, y solo el de este inventario
  if (inv.abierto) {
    conteos.data.forEach((m) => {
      if (new Date(m.creado_en) < new Date(inv.desde)) return
      const c = Number(m.cantidad) || 0
      if (m.seccion === 'Bodega') r.contadoBodega += c
      if (m.seccion === 'Tienda') r.contadoTienda += c
    })
  }

  // Movimientos que valen: si hubo un cierre, solo el stock inicial de ESE cierre y lo que paso despues
  mercancia.data.forEach((m) => {
    if (inv.ultimoCierre) {
      if (m.tipo === 'inventario') { if (m.nota !== 'CIERRE#' + inv.numeroUltimoCierre) return }
      else if (new Date(m.creado_en) <= new Date(inv.ultimoCierre)) return
    }
    const c = Number(m.cantidad) || 0
    const esReintegro = String(m.nota || '').startsWith(marcaReporte || 'REPORTE#')
    if (m.tipo === 'inventario' && m.destino === 'Bodega') r.inicialBodega += c
    if (m.tipo === 'inventario' && m.destino === 'Tienda') r.inicialTienda += c
    if (m.tipo === 'ingreso' && m.destino === 'Bodega') { if (esReintegro) r.reintegros += c; else r.ingresos += c }
    if (m.tipo === 'ingreso' && m.destino === 'Tienda' && !esReintegro) r.ingresoTienda += c
    if (m.tipo === 'salida' && m.origen === 'Bodega') { if (m.destino === 'Reporte') r.descontado += c; else r.salidas += c }
  })

  r.esperadoBodega = r.inicialBodega + r.ingresos + r.reintegros - r.salidas - r.descontado
  const provisional = inv.abierto && !inv.hayCierreAnterior
  r.bodega = provisional ? r.esperadoBodega + r.contadoBodega : r.esperadoBodega
  r.comparando = inv.abierto && inv.hayCierreAnterior       // hay inventario nuevo abierto: se compara
  r.diferenciaBodega = r.comparando ? r.contadoBodega - r.esperadoBodega : null
  r.inventarioAbierto = inv.abierto
  return r
}

// ---------------------------------------------------------------------
// SALDOS DE TODOS LOS PRODUCTOS (para regenerar el Google Sheets al empezar un inventario)
//   Bodega = stock inicial + ingresos + reintegros - salidas - lo descontado por reportes
//   Tienda = stock inicial de Tienda + lo que llego de Bodega + lo que entro directo - lo reportado en Tienda
//            (es lo MAXIMO que deberia haber en Tienda si no se hubiera vendido nada:
//             al contar, la diferencia es lo VENDIDO)
// Solo cuenta lo que paso desde el ultimo cierre (el stock inicial de ese cierre + movimientos posteriores).
// ---------------------------------------------------------------------
export async function saldosDeTodos(negocio) {
  const neg = negocio.codigo_negocio
  const inv = await estadoInventario(negocio, true)
  const movs = await leerTodo(() =>
    supabase.from('movimientos_mercancia').select('tipo, codigo, origen, destino, cantidad, nota, creado_en')
      .eq('negocio', neg).eq('anulado', false).order('id')
  )
  const saldos = new Map() // codigo -> { bodega, tienda }
  const sumar = (codigo, campo, c) => {
    const f = saldos.get(codigo) || { bodega: 0, tienda: 0 }
    f[campo] += c
    saldos.set(codigo, f)
  }
  movs.forEach((m) => {
    if (inv.ultimoCierre) {
      if (m.tipo === 'inventario') { if (m.nota !== 'CIERRE#' + inv.numeroUltimoCierre) return }
      else if (new Date(m.creado_en) <= new Date(inv.ultimoCierre)) return
    }
    const c = Number(m.cantidad) || 0
    if (m.tipo === 'inventario') {
      if (m.destino === 'Bodega') sumar(m.codigo, 'bodega', c)
      if (m.destino === 'Tienda') sumar(m.codigo, 'tienda', c)
    } else if (m.tipo === 'ingreso') {
      if (m.destino === 'Bodega') sumar(m.codigo, 'bodega', c)
      if (m.destino === 'Tienda') sumar(m.codigo, 'tienda', c)
    } else if (m.tipo === 'salida') {
      if (m.origen === 'Bodega') {
        sumar(m.codigo, 'bodega', -c)
        if (m.destino === 'Tienda') sumar(m.codigo, 'tienda', c)   // llego a la Tienda
      }
      if (m.origen === 'Tienda') sumar(m.codigo, 'tienda', -c)     // reporte hecho en Tienda
    }
  })
  return saldos
}

// Regenera el Google Sheets: copia con fecha de las hojas actuales y hojas nuevas con TODOS los productos,
// Existencia = saldo (Bodega en la hoja Bodega, "maximo en Tienda" en la hoja Tienda), Cantidad vacia, Log vacio.
export async function regenerarSheets(negocio, avisar) {
  const decir = avisar || function () {}
  const neg = negocio.codigo_negocio
  if (!negocio.apps_script_url) throw new Error('Este negocio no tiene la dirección del Google Sheets configurada.')

  decir('Calculando saldos...')
  const saldos = await saldosDeTodos(negocio)
  decir('Leyendo productos...')
  const productos = await leerTodo(() =>
    supabase.from('productos').select('codigo, nombre, precio_de_compra')
      .eq('establecimiento', neg).order('codigo')
  )
  const fecha = new Date().toLocaleDateString('en-CA') // yyyy-mm-dd en la hora del celular/computador
  const redondear = (n) => Math.round((Number(n) || 0) * 1000) / 1000

  const BLOQUE = 1000
  for (let i = 0; i < productos.length; i += BLOQUE) {
    decir('Actualizando Google Sheets: ' + Math.min(i + BLOQUE, productos.length) + ' de ' + productos.length + '...')
    const lote = productos.slice(i, i + BLOQUE).map((p) => {
      const sd = saldos.get(p.codigo) || { bodega: 0, tienda: 0 }
      return {
        codigo: p.codigo,
        nombre: p.nombre,
        precio: Number(p.precio_de_compra) || 0,
        existenciaBodega: redondear(sd.bodega),
        existenciaTienda: redondear(sd.tienda)
      }
    })
    const resp = await fetch(negocio.apps_script_url, {
      method: 'POST',
      body: JSON.stringify({ accion: 'prepararInventario', primerBloque: i === 0, fecha: fecha, productos: lote })
    })
    const datos = await resp.json()
    if (datos.error) throw new Error('Google Sheets: ' + datos.error)
  }
  return { productos: productos.length, fecha: fecha }
}
