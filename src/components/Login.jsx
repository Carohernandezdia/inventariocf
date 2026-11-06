// =====================================================================
// Pantalla de entrada: nombre de la persona + codigo de acceso del negocio.
// El nombre queda guardado en cada escaneo para saber quien envio que.
// =====================================================================
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function Login({ onLogin }) {
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function entrar() {
    const nombreLimpio = nombre.trim()
    const codigoLimpio = codigo.trim()
    if (!nombreLimpio) {
      setError('Escribe tu nombre')
      return
    }
    if (!codigoLimpio) {
      setError('Escribe tu código')
      return
    }
    setCargando(true)
    setError('')

    // Busca el negocio al que pertenece el codigo
    const { data, error: errorConsulta } = await supabase.from('negocios').select('*')

    if (errorConsulta) {
      setError('Error de conexión: ' + errorConsulta.message)
      setCargando(false)
      return
    }

    let negocioEncontrado = null
    let rolEncontrado = null
    for (const negocio of data) {
      if (negocio.codigo_admin === codigoLimpio) {
        negocioEncontrado = negocio
        rolEncontrado = 'admin'
        break
      }
      if (negocio.codigo_empleado === codigoLimpio) {
        negocioEncontrado = negocio
        rolEncontrado = 'empleado'
        break
      }
    }

    setCargando(false)
    if (!negocioEncontrado) {
      setError('Código no válido')
      return
    }

    // La sesion guarda el negocio, el rol (admin o empleado) y el nombre de la persona
    const sesion = { negocio: negocioEncontrado, rol: rolEncontrado, nombreUsuario: nombreLimpio }
    localStorage.setItem('sesion-inventario', JSON.stringify(sesion))
    onLogin(sesion)
  }

  return (
    <div className="pantalla-login">
      <div className="logo-orcore">
        <span className="logo-or">Or</span>
        <span className="logo-core">Core</span>
      </div>
      <div className="tarjeta-login">
        <label className="etiqueta-login">Tu nombre</label>
        <input
          type="text"
          placeholder="Tu nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') entrar() }}
        />
        <label className="etiqueta-login">Código de acceso</label>
        <input
          type="text"
          placeholder="Código de acceso"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') entrar() }}
        />
        {error && <p style={{ color: '#DC2626', fontSize: 13, marginTop: 4 }}>{error}</p>}
        <button className="btn-comenzar" onClick={entrar} disabled={cargando}>
          {cargando ? 'Verificando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}

export default Login
