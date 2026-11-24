// =====================================================================
// Pantalla de entrada: nombre de la persona + codigo de acceso del negocio.
// El nombre queda guardado en cada escaneo para saber quien envio que.
// Estilo OrCore: igual al login de las demas aplicaciones (banner blanco con logo grande + tarjeta centrada).
// Los estilos estan en login.css (se importa aqui abajo).
// =====================================================================
import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import '../login.css'

// Logo de OrCore (PNG transparente, en src/assets)
import logo from '../assets/logo-orcore.png'

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

  // Misma estructura que el login de las otras aplicaciones de OrCore:
  // fondo blanco, banner alto con el logo grande arriba, y la tarjeta centrada debajo.
  return (
    <div className="login-pagina">

      {/* Banner alto (blanco) con el logo pegado abajo */}
      <div className="login-banner">
        <img src={logo} alt="OrCore" />
      </div>

      {/* Este contenedor ocupa el resto de la pantalla y centra la tarjeta */}
      <div className="login-centro">
        <div className="login-ancho">
          <form
            className="login-tarjeta"
            onSubmit={(e) => { e.preventDefault(); entrar() }}
          >
            <div>
              <label className="login-etiqueta">Tu nombre</label>
              <input
                className="login-campo"
                type="text"
                placeholder="Tu nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div>
              <label className="login-etiqueta">Código de acceso</label>
              <input
                className="login-campo"
                type="text"
                placeholder="Código de acceso"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>

            {error && <p className="login-error">{error}</p>}

            <button type="submit" className="login-boton" disabled={cargando}>
              {cargando ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}

export default Login
