// =====================================================================
// Pantalla "Importar" (solo admin): sube el Excel de productos y vacia todo para empezar de cero.
// Columnas del Excel (primera fila): codigo, nombre, precio_de_compra
// Opcionales: existencia, codigo_padre
// =====================================================================
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { limpiarCola } from '../lib/colaSheets'

function Importar({ negocio }) {
  const [filas, setFilas] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // Lee el archivo Excel/CSV y revisa que tenga las columnas correctas
  function leerArchivo(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    const lector = new FileReader()
    lector.onload = (evento) => {
      const datos = new Uint8Array(evento.target.result)
      const libro = XLSX.read(datos, { type: 'array' })
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const filasLeidas = XLSX.utils.sheet_to_json(hoja)

      const columnasOk =
        filasLeidas.length > 0 &&
        'codigo' in filasLeidas[0] &&
        'nombre' in filasLeidas[0] &&
        'precio_de_compra' in filasLeidas[0]

      if (!columnasOk) {
        setMensaje('⚠️ El archivo debe tener columnas llamadas exactamente: codigo, nombre, precio_de_compra')
        setFilas(null)
        return
      }
      setFilas(filasLeidas)
      setMensaje('✓ Listo: ' + filasLeidas.length + ' productos leídos. Ejemplo: ' + filasLeidas[0].nombre)
    }
    lector.readAsArrayBuffer(archivo)
  }

  // Borra TODO para empezar un inventario nuevo: productos, historial de todos y cantidades del Sheets
  async function vaciarTodo() {
    const aviso =
      '¿Seguro? Esto borra TODO de ' + negocio.nombre_negocio + ':\n' +
      '- los productos\n- el historial de todas las personas\n- las cantidades de Bodega y Tienda en Google Sheets\n\n' +
      'No se puede deshacer.'
    if (!confirm(aviso)) return

    setOcupado(true)
    try {
      setMensaje('Borrando productos...')
      let r = await supabase.from('productos').delete().eq('establecimiento', negocio.codigo_negocio)
      if (r.error) throw new Error('productos: ' + r.error.message)

      setMensaje('Borrando historial...')
      r = await supabase.from('movimientos').delete().eq('negocio', negocio.codigo_negocio)
      if (r.error) throw new Error('historial: ' + r.error.message)

      setMensaje('Limpiando Google Sheets...')
      limpiarCola(negocio.codigo_negocio) // descarta envios pendientes de este celular
      const respuesta = await fetch(negocio.apps_script_url, {
        method: 'POST',
        body: JSON.stringify({ accion: 'vaciarTodo' })
      })
      const datos = await respuesta.json()
      if (datos.error) throw new Error('Sheets: ' + datos.error)

      setMensaje('✓ Todo quedó en ceros. Ahora sube el archivo nuevo.')
    } catch (e) {
      setMensaje('Error al vaciar: ' + e.message)
    }
    setOcupado(false)
  }

  async function subirProductos() {
    if (!filas) return

    // Revisa celdas vacias: sin codigo o sin nombre no se puede subir
    const vacias = []
    filas.forEach((f, i) => {
      if (!String(f.codigo === undefined ? '' : f.codigo).trim() || !String(f.nombre === undefined ? '' : f.nombre).trim()) {
        vacias.push(i + 2) // +2 porque la fila 1 del Excel es el encabezado
      }
    })
    if (vacias.length > 0) {
      setMensaje('⚠️ Hay ' + vacias.length + ' fila(s) con código o nombre vacío (por ejemplo la fila ' + vacias[0] + ' del Excel). Corrígelas y vuelve a subir.')
      return
    }

    setOcupado(true)
    const filasParaSubir = filas.map((f) => ({
      codigo: String(f.codigo).trim(),
      nombre: String(f.nombre).trim(),
      precio_de_compra: parseFloat(f.precio_de_compra) || 0,
      establecimiento: negocio.codigo_negocio,
      codigo_padre: f.codigo_padre ? String(f.codigo_padre).trim() : null,
      existencia: f.existencia !== undefined ? parseFloat(f.existencia) || 0 : null
    }))

    // Revisa codigos repetidos antes de subir nada
    const conteo = new Map()
    filasParaSubir.forEach((f) => conteo.set(f.codigo, (conteo.get(f.codigo) || 0) + 1))
    const repetidos = Array.from(conteo.entries()).filter((par) => par[1] > 1).map((par) => par[0])
    if (repetidos.length > 0) {
      setMensaje('⚠️ Hay ' + repetidos.length + ' código(s) repetido(s), revísalos antes de subir: ' + repetidos.slice(0, 15).join(', ') + (repetidos.length > 15 ? '...' : ''))
      setOcupado(false)
      return
    }

    // Sube a Supabase en bloques de 500
    const BLOQUE = 500
    let subidos = 0
    for (let i = 0; i < filasParaSubir.length; i += BLOQUE) {
      const bloque = filasParaSubir.slice(i, i + BLOQUE)
      const { error } = await supabase.from('productos').upsert(bloque, { onConflict: 'codigo' })
      if (error) {
        setMensaje('Error subiendo bloque: ' + error.message)
        setOcupado(false)
        return
      }
      subidos += bloque.length
      setMensaje('Subidos ' + subidos + ' de ' + filasParaSubir.length + '...')
    }

    // Manda el listado a Google Sheets en bloques de 1000
    try {
      const BLOQUE_SHEETS = 1000
      for (let i = 0; i < filasParaSubir.length; i += BLOQUE_SHEETS) {
        const bloqueSheets = filasParaSubir.slice(i, i + BLOQUE_SHEETS)
        setMensaje('Actualizando Sheets: ' + Math.min(i + BLOQUE_SHEETS, filasParaSubir.length) + ' de ' + filasParaSubir.length + '...')
        const respuesta = await fetch(negocio.apps_script_url, {
          method: 'POST',
          body: JSON.stringify({
            accion: 'importarProductos',
            primerBloque: i === 0,
            productos: bloqueSheets.map((f) => ({
              codigo: f.codigo,
              nombre: f.nombre,
              precio: f.precio_de_compra,
              existencia: f.existencia || ''
            }))
          })
        })
        const resultado = await respuesta.json()
        if (resultado.error) {
          setMensaje('Error en Sheets: ' + resultado.error)
          setOcupado(false)
          return
        }
      }
    } catch (e) {
      setMensaje('Productos subidos, pero no se pudo actualizar el Sheets: ' + e.message)
      setOcupado(false)
      return
    }

    setMensaje('✓ Listo: ' + subidos + ' productos actualizados (Supabase + Sheets).')
    setOcupado(false)
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16 }}>
      <div style={{ background: 'white', border: '1px solid #E4E7EB', borderRadius: 10, padding: 16 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Actualizar productos de {negocio.nombre_negocio}</div>
        <p style={{ fontSize: 13, color: '#5B6470' }}>
          Sube un Excel (.xlsx) o CSV con estas columnas exactas en la primera fila:
          <br /><b>codigo</b>, <b>nombre</b>, <b>precio_de_compra</b>
          <br />(opcionales: <b>existencia</b> = cantidad que debería haber, <b>codigo_padre</b> = productos amarrados)
          <br />Sin códigos repetidos y sin celdas vacías.
        </p>

        <input type="file" accept=".xlsx,.xls,.csv" onChange={leerArchivo} style={{ marginBottom: 12 }} />
        {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}

        <button
          onClick={vaciarTodo}
          disabled={ocupado}
          style={{ width: '100%', padding: 12, marginBottom: 8, background: 'white', border: '1px solid #DC2626', color: '#DC2626', borderRadius: 8 }}
        >
          🗑️ Borrar TODO (productos, historial y Sheets) para empezar de cero
        </button>

        <button
          onClick={subirProductos}
          disabled={!filas || ocupado}
          style={{ width: '100%', padding: 12, background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: !filas || ocupado ? 0.6 : 1 }}
        >
          {ocupado ? 'Trabajando...' : 'Subir productos'}
        </button>
      </div>
    </div>
  )
}

export default Importar
