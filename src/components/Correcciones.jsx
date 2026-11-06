// =====================================================================
// Pantalla "Correcciones" (solo admin).
// Busca cualquier movimiento (por persona, producto o codigo) y corrige la cantidad.
// La correccion NO borra lo que mandaron los demas: calcula la diferencia y solo suma/resta eso.
// Ej: mandaron 100 y eran 10 -> se envia -90 al Sheets.
// =====================================================================
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { encolar, procesarCola, nuevoUuid } from '../lib/colaSheets'

function Correcciones({ negocio, nombreUsuario }) {
  const [busqueda, setBusqueda] = useState('')
  const [movimientos, setMovimientos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [cantidadNueva, setCantidadNueva] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    buscar()
  }, [])

  // Trae los ultimos 100 movimientos (que no esten ya corregidos), con filtro opcional
  async function buscar() {
    setCargando(true)
    setMensaje('')
    let consulta = supabase
      .from('movimientos')
      .select('id, usuario, seccion, codigo, nombre, cantidad, creado_en, corrige_id')
      .eq('negocio', negocio.codigo_negocio)
      .eq('anulado', false)
      .order('creado_en', { ascending: false })
      .limit(100)

    const texto = busqueda.trim().replace(/[%,()]/g, ' ') // quita simbolos que dañan el filtro
    if (texto) {
      consulta = consulta.or('usuario.ilike.%' + texto + '%,nombre.ilike.%' + texto + '%,codigo.ilike.%' + texto + '%')
    }

    const { data, error } = await consulta
    if (error) setMensaje('Error: ' + error.message)
    else {
      setMovimientos(data)
      if (data.length === 0) setMensaje('No se encontró nada.')
    }
    setCargando(false)
  }

  function abrirEdicion(mov) {
    setEditandoId(mov.id)
    setCantidadNueva(String(mov.cantidad))
    setMensaje('')
  }

  async function guardarCorreccion(mov) {
    const nueva = parseFloat(String(cantidadNueva).replace(',', '.'))
    if (isNaN(nueva) || nueva < 0) {
      setMensaje('Escribe una cantidad válida (0 o más)')
      return
    }
    const diferencia = nueva - Number(mov.cantidad)
    if (diferencia === 0) {
      setEditandoId(null)
      return
    }

    setGuardando(true)
    const idNuevo = nuevoUuid()

    // 1) Si la nueva cantidad es mayor que cero, crea el registro corregido (queda a nombre de la persona original)
    if (nueva > 0) {
      const r = await supabase.from('movimientos').insert({
        id: idNuevo,
        negocio: negocio.codigo_negocio,
        usuario: mov.usuario,
        seccion: mov.seccion,
        codigo: mov.codigo,
        nombre: mov.nombre,
        cantidad: nueva,
        corrige_id: mov.id,
        nota: 'Corregido por ' + nombreUsuario + ' (antes: ' + mov.cantidad + ')'
      })
      if (r.error) {
        setMensaje('No se pudo corregir: ' + r.error.message)
        setGuardando(false)
        return
      }
    }

    // 2) Marca el registro viejo como anulado
    const r2 = await supabase.from('movimientos').update({ anulado: true }).eq('id', mov.id)
    if (r2.error) {
      if (nueva > 0) await supabase.from('movimientos').delete().eq('id', idNuevo) // deshace el paso 1
      setMensaje('No se pudo corregir: ' + r2.error.message)
      setGuardando(false)
      return
    }

    // 3) Manda SOLO la diferencia al Google Sheets (en segundo plano, se reintenta solo)
    encolar(negocio.codigo_negocio, {
      idMov: nueva > 0 ? idNuevo : nuevoUuid(),
      codigo: mov.codigo,
      cantidad: diferencia,
      seccion: mov.seccion,
      nombre: mov.nombre,
      precio: 0,
      usuario: nombreUsuario,
      tipo: 'correccion'
    })
    procesarCola(negocio.codigo_negocio, negocio.apps_script_url)

    setEditandoId(null)
    setGuardando(false)
    setMensaje('✓ Corregido: ' + mov.nombre + ' de ' + mov.cantidad + ' a ' + nueva + ' (diferencia ' + diferencia + ')')
    buscar()
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Corregir envíos</div>
      <p style={{ fontSize: 12, color: '#5B6470', marginTop: 0 }}>
        Busca por nombre de la persona, producto o código. Se muestran los últimos 100.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Persona, producto o código"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
          style={{ flex: 1, padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16 }}
        />
        <button
          onClick={buscar}
          style={{ background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 'bold' }}
        >
          Buscar
        </button>
      </div>

      {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}
      {cargando && <p style={{ fontSize: 13, color: '#5B6470' }}>Cargando...</p>}

      {movimientos.map((mov) => (
        <div key={mov.id} style={{ border: '1px solid #E4E7EB', borderRadius: 8, padding: 10, marginBottom: 8, background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <b>{mov.nombre}</b>
              <div style={{ fontSize: 12, color: '#5B6470' }}>
                {mov.usuario} · {mov.seccion} · Código {mov.codigo}
              </div>
              <div style={{ fontSize: 11, color: '#9aa3ad' }}>{new Date(mov.creado_en).toLocaleString('es-CO')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold', fontSize: 18 }}>{mov.cantidad}</div>
              {editandoId !== mov.id && (
                <button
                  onClick={() => abrirEdicion(mov)}
                  style={{ fontSize: 12, padding: '4px 10px', background: 'white', border: '1px solid #E4E7EB', borderRadius: 6 }}
                >
                  Corregir
                </button>
              )}
            </div>
          </div>

          {editandoId === mov.id && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#5B6470' }}>Cantidad correcta:</span>
              <input
                type="text"
                inputMode="decimal"
                value={cantidadNueva}
                onChange={(e) => setCantidadNueva(e.target.value)}
                style={{ width: 90, padding: 8, border: '1px solid #E4E7EB', borderRadius: 8 }}
              />
              <button
                onClick={() => guardarCorreccion(mov)}
                disabled={guardando}
                style={{ background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 'bold' }}
              >
                {guardando ? '...' : 'Guardar'}
              </button>
              <button
                onClick={() => setEditandoId(null)}
                style={{ background: 'white', border: '1px solid #E4E7EB', borderRadius: 8, padding: '8px 12px' }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default Correcciones
