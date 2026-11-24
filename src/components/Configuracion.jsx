// =====================================================================
// Pantalla "Configuracion" (solo admin, se abre con el engranaje de arriba):
//   - Respaldo del Google Sheets en Excel (Bodega, Tienda y Log)
//   - Empezar de cero (borra todo; pide el respaldo y la clave del administrador)
//   - Cambiar las claves del administrador y de los empleados
//   - Importar productos (escondido aqui para que nadie lo toque sin querer)
// =====================================================================
import { useState } from 'react'
import { Settings, Download, KeyRound, FolderUp, Trash2, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { descargarRespaldoSheets } from '../lib/respaldoSheets'
import { limpiarTodo } from '../lib/limpiarTodo'
import Importar from './importar'
import '../paneles.css'

const estiloCampo = { width: '100%', padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, marginBottom: 10, boxSizing: 'border-box' }
const estiloNaranja = { width: '100%', padding: 12, background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold' }

function Configuracion({ negocio, onVolver }) {
  const [abierto, setAbierto] = useState('') // cual seccion esta abierta: respaldo, claves, importar

  // --- Respaldo del Google Sheets (Bodega, Tienda y Log) ---
  const [respaldoMsg, setRespaldoMsg] = useState('')
  const [respaldando, setRespaldando] = useState(false)
  const [respaldoHecho, setRespaldoHecho] = useState(false) // para empezar de cero hay que bajar el respaldo primero

  async function bajarRespaldo() {
    setRespaldando(true)
    try {
      const r = await descargarRespaldoSheets(negocio, setRespaldoMsg)
      setRespaldoHecho(true)
      setRespaldoMsg('✓ Descargado ' + r.archivo + ' (' + r.filas + ' filas)')
    } catch (e) {
      setRespaldoMsg('No se pudo descargar el respaldo: ' + e.message)
    }
    setRespaldando(false)
  }

  // --- Empezar de cero (borrar todo) ---
  const [claveBorrar, setClaveBorrar] = useState('')
  const [borrarMsg, setBorrarMsg] = useState('')
  const [borrando, setBorrando] = useState(false)

  async function borrarTodo() {
    if (!respaldoHecho) { setBorrarMsg('⚠️ Primero descarga el respaldo (botón de arriba en "Descargar respaldo").'); return }
    // La clave que se pide es la del administrador
    if (claveBorrar.trim() !== String(negocio.codigo_admin).trim()) { setBorrarMsg('⚠️ La clave del administrador no es correcta.'); return }
    const aviso =
      'Esto borra TODO de ' + negocio.nombre_negocio + ' y lo deja completamente limpio:\n' +
      '- los productos\n- los conteos\n- los ingresos y salidas\n- los reportes\n- Bodega, Tienda y Log del Google Sheets\n\n' +
      'No se puede deshacer. ¿Seguro?'
    if (!confirm(aviso)) { setBorrarMsg('No se borró nada.'); return }

    setBorrando(true)
    try {
      await limpiarTodo(negocio, setBorrarMsg)
      setClaveBorrar('')
      setRespaldoHecho(false)
      setBorrarMsg('✓ Todo quedó limpio. Ahora sube el Excel de productos en "Importar productos".')
    } catch (e) {
      setBorrarMsg('No se pudo terminar: ' + e.message + '. Puedes volver a intentarlo.')
    }
    setBorrando(false)
  }

  // --- Claves ---
  const [quien, setQuien] = useState('empleado') // cual clave se cambia: empleado o admin
  const [clave1, setClave1] = useState('')
  const [clave2, setClave2] = useState('')
  const [clavesMsg, setClavesMsg] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cambiarClave() {
    const c1 = clave1.trim()
    if (c1.length < 4) { setClavesMsg('La clave debe tener mínimo 4 caracteres'); return }
    if (c1 !== clave2.trim()) { setClavesMsg('Las dos claves no son iguales'); return }

    // La clave del admin y la del empleado no pueden ser la misma, porque asi se sabe quien entra
    const otra = quien === 'admin' ? negocio.codigo_empleado : negocio.codigo_admin
    if (otra && c1 === String(otra)) { setClavesMsg('Esa clave ya la usa el otro perfil. Escribe una distinta.'); return }

    if (!confirm('¿Cambiar la clave de ' + (quien === 'admin' ? 'ADMINISTRADOR' : 'EMPLEADOS') + '? Desde ahora se entra con la clave nueva.')) return

    setGuardando(true)
    const campo = quien === 'admin' ? 'codigo_admin' : 'codigo_empleado'
    const { error } = await supabase.from('negocios').update({ [campo]: c1 }).eq('codigo_negocio', negocio.codigo_negocio)
    if (error) {
      setClavesMsg('No se pudo cambiar: ' + error.message)
    } else {
      setClavesMsg('✓ Clave de ' + (quien === 'admin' ? 'administrador' : 'empleados') + ' cambiada. Avísale a quien la usa.')
      negocio[campo] = c1 // para que la validacion de arriba use el valor nuevo
      setClave1('')
      setClave2('')
    }
    setGuardando(false)
  }

  // Titulo de cada seccion; al tocarlo se abre o se cierra
  function Seccion({ id, titulo, texto, Icono, rojo, children }) {
    const activo = abierto === id
    const color = rojo ? '#DC2626' : '#FF6600'
    return (
      <div className="caja-panel" style={{ marginBottom: 12 }}>
        <div onClick={() => setAbierto(activo ? '' : id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="tarjeta-icono" style={rojo ? { background: '#FEE2E2' } : undefined}>
            <Icono size={24} strokeWidth={activo ? 2.25 : 1.75} color={color} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 18, color: rojo ? '#DC2626' : '#111417' }}>{titulo}</div>
            <div style={{ fontSize: 14, color: '#5B6470' }}>{texto}</div>
          </div>
          {activo ? <ChevronDown size={20} strokeWidth={1.75} color="#A0A7B0" /> : <ChevronRight size={20} strokeWidth={1.75} color="#A0A7B0" />}
        </div>
        {activo && <div style={{ marginTop: 14 }}>{children}</div>}
      </div>
    )
  }


  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="pantalla-titulo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Settings size={28} strokeWidth={1.75} color="#FF6600" /> Configuración</div>
        <button className="boton-chico" onClick={onVolver}><ArrowLeft size={16} strokeWidth={1.75} color="#FF6600" /> Volver</button>
      </div>

      {Seccion({
        id: 'respaldo',
        Icono: Download, titulo: 'Descargar respaldo',
        texto: 'Excel del Google Sheets: Bodega, Tienda y el Log de lo que envió cada uno.',
        children: (
          <div>
            <p style={{ fontSize: 13, color: '#5B6470', marginTop: 0 }}>
              Baja un Excel con tres hojas: Bodega, Tienda y Log (quién envió qué). Es el mismo contenido del Google Sheets, sin tener que entrar a él.
            </p>
            <button onClick={bajarRespaldo} disabled={respaldando} style={{ ...estiloNaranja, opacity: respaldando ? 0.6 : 1 }}>
              {respaldando ? 'Preparando...' : 'Descargar respaldo en Excel'}
            </button>
            {respaldoMsg && <p style={{ fontSize: 13, color: respaldoMsg.startsWith('✓') ? '#16A34A' : '#5B6470' }}>{respaldoMsg}</p>}
          </div>
        )
      })}

      {Seccion({
        id: 'claves',
        Icono: KeyRound, titulo: 'Cambiar claves',
        texto: 'La clave de los empleados y la del administrador.',
        children: (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[['empleado', 'Empleados'], ['admin', 'Administrador']].map((par) => (
                <button
                  key={par[0]}
                  onClick={() => { setQuien(par[0]); setClavesMsg('') }}
                  style={{
                    flex: 1, padding: 10, borderRadius: 8, fontWeight: 'bold',
                    border: '1px solid ' + (quien === par[0] ? '#FF6600' : '#E4E7EB'),
                    background: quien === par[0] ? '#FF6600' : 'white',
                    color: quien === par[0] ? 'white' : '#111417'
                  }}
                >
                  {par[1]}
                </button>
              ))}
            </div>
            <input type="password" placeholder="Clave nueva" value={clave1} onChange={(e) => setClave1(e.target.value)} style={estiloCampo} />
            <input type="password" placeholder="Escribe la clave nueva otra vez" value={clave2} onChange={(e) => setClave2(e.target.value)} style={estiloCampo} />
            {clavesMsg && <p style={{ fontSize: 13, color: clavesMsg.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{clavesMsg}</p>}
            <button onClick={cambiarClave} disabled={guardando} style={{ ...estiloNaranja, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : 'Cambiar clave'}
            </button>
          </div>
        )
      })}

      {Seccion({
        id: 'importar',
        Icono: FolderUp, titulo: 'Importar productos',
        texto: 'Subir el Excel de productos. Cuidado: aquí también está "Borrar todo".',
        children: <Importar negocio={negocio} />
      })}

      {Seccion({
        id: 'limpiar',
        Icono: Trash2, rojo: true, titulo: 'Empezar de cero (borrar todo)',
        texto: 'Deja la aplicación y el Google Sheets completamente limpios.',
        children: (
          <div>
            <p style={{ fontSize: 13, color: '#5B6470', marginTop: 0 }}>
              Borra los productos, los conteos, los ingresos y salidas, los reportes, y deja vacíos Bodega, Tienda y Log del Google Sheets. No se puede deshacer.
            </p>
            <button onClick={bajarRespaldo} disabled={respaldando || borrando} style={{ width: '100%', padding: 12, marginBottom: 8, background: 'white', border: '1px solid #FF6600', color: '#FF6600', borderRadius: 8, fontWeight: 'bold' }}>
              1. Descargar respaldo (obligatorio)
            </button>
            {respaldoMsg && <p style={{ fontSize: 13, color: respaldoMsg.startsWith('✓') ? '#16A34A' : '#5B6470', marginTop: 0 }}>{respaldoMsg}</p>}
            <input type="password" placeholder="2. Clave del administrador" value={claveBorrar} onChange={(e) => setClaveBorrar(e.target.value)} style={estiloCampo} />
            <button
              onClick={borrarTodo}
              disabled={borrando || !respaldoHecho || !claveBorrar}
              style={{ width: '100%', padding: 12, background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: borrando || !respaldoHecho || !claveBorrar ? 0.5 : 1 }}
            >
              {borrando ? 'Borrando...' : '3. Borrar TODO y empezar de cero'}
            </button>
            {borrarMsg && <p style={{ fontSize: 13, color: borrarMsg.startsWith('✓') ? '#16A34A' : '#5B6470' }}>{borrarMsg}</p>}
          </div>
        )
      })}
    </div>
  )
}

export default Configuracion
