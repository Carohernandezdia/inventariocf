// =====================================================================
// Pantalla "Mercancia" del administrador: junta MERCANCIA (ingresar, sacar, reportar)
// y PRODUCTOS (crear, editar, eliminar) en un solo lugar.
// Arriba van dos pestañas tipo carpeta: la abierta va en naranja y pegada al contenido.
// =====================================================================
import { useState } from 'react'
import { Package, Tag } from 'lucide-react'
import Productos from './Productos'
import Mercancia from './Mercancia'
import '../paneles.css'

function Gestion({ negocio, nombreUsuario, codigoInicial, onListo }) {
  // Si venimos de "Crear este producto" (desde Contar), abre directo en Productos
  const [seccion, setSeccion] = useState(codigoInicial ? 'productos' : 'mercancia')

  // Cada pestaña: icono Lucide + palabra (el icono va blanco si esta abierta, naranja si no)
  const pestana = (id, texto, Icono) => {
    const activa = seccion === id
    return (
      <button className={'carpeta-tab' + (activa ? ' activa' : '')} onClick={() => setSeccion(id)}>
        <Icono size={20} strokeWidth={activa ? 2.25 : 1.75} color={activa ? 'white' : '#FF6600'} />
        {texto}
      </button>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="carpeta-tabs">
        {pestana('mercancia', 'Mercancía', Package)}
        {pestana('productos', 'Productos', Tag)}
      </div>

      <div className="carpeta-cuerpo">
        {seccion === 'mercancia' && <Mercancia negocio={negocio} nombreUsuario={nombreUsuario} />}
        {seccion === 'productos' && <Productos negocio={negocio} codigoInicial={codigoInicial} onListo={onListo} />}
      </div>
    </div>
  )
}

export default Gestion
