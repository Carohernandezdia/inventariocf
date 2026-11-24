// =====================================================================
// Pantalla "Importar" (solo admin): sube el Excel de productos.
// Dos modos: AGREGAR Y ACTUALIZAR (no borra nada) o REEMPLAZAR (borra las cantidades del Sheets).
// Columnas del Excel (primera fila): codigo, nombre, precio_de_compra
// Opcionales: existencia, codigo_padre
// =====================================================================
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { generarRespaldo } from '../lib/respaldo'

function Importar({ negocio }) {
  const [filas, setFilas] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [respaldoHecho, setRespaldoHecho] = useState(false) // para borrar o reemplazar hay que bajar el respaldo primero
  const [modo, setModo] = useState('agregar') // 'agregar' (seguro) o 'reemplazar' (borra cantidades del Sheets)

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

  // Baja el respaldo en Excel. Sin esto no se deja borrar ni reemplazar (asi nadie pierde el historial por olvido).
  async function bajarRespaldo() {
    setOcupado(true)
    try {
      const r = await generarRespaldo(negocio, setMensaje)
      setRespaldoHecho(true)
      setMensaje('✓ Respaldo descargado: ' + r.archivo + '. Ahora sí puedes borrar o reemplazar.')
    } catch (e) {
      setMensaje('No se pudo generar el respaldo: ' + e.message)
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

    // En modo reemplazar el Sheets se limpia: exige el respaldo y pide escribir REEMPLAZAR para evitar accidentes
    if (modo === 'reemplazar') {
      if (!respaldoHecho) { setMensaje('⚠️ Primero toca "Descargar respaldo" (así no pierdes el historial).'); return }
      const ok = prompt('El modo REEMPLAZAR borra las cantidades que ya estén en Bodega y Tienda del Sheets.\n\nPara continuar escribe la palabra REEMPLAZAR:')
      if (ok === null || ok.trim().toUpperCase() !== 'REEMPLAZAR') { setMensaje('No se subió nada.'); return }
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
            // agregar = 'actualizarProductos' (no borra nada); reemplazar = 'importarProductos' (limpia y escribe)
            accion: modo === 'agregar' ? 'actualizarProductos' : 'importarProductos',
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

        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <input type="radio" checked={modo === 'agregar'} onChange={() => setModo('agregar')} />{' '}
            <b>Agregar y actualizar</b> (recomendado): agrega los productos nuevos y cambia el precio de los que ya existen. No borra nada.
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" checked={modo === 'reemplazar'} onChange={() => setModo('reemplazar')} />{' '}
            <b>Reemplazar</b>: deja el Sheets solo con este archivo y borra las cantidades. Solo antes de empezar a contar.
          </label>
        </div>

        <input type="file" accept=".xlsx,.xls,.csv" onChange={leerArchivo} style={{ marginBottom: 12 }} />
        {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}

        <button
          onClick={bajarRespaldo}
          disabled={ocupado}
          style={{ width: '100%', padding: 12, marginBottom: 8, background: 'white', border: '1px solid #FF6600', color: '#FF6600', borderRadius: 8, fontWeight: 'bold' }}
        >
          💾 Descargar respaldo (obligatorio antes de reemplazar)
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
