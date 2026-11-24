// =====================================================================
// Pantalla "Mercancia" del administrador: junta PRODUCTOS (crear, editar, eliminar)
// y MERCANCIA (ingresar, sacar, reportar) en un solo lugar.
// En celular los dos botones grandes van arriba; en computador van a la izquierda.
// =====================================================================
import { useState } from 'react'
import { Package, Tag } from 'lucide-react'
import Productos from './Productos'
import Mercancia from './Mercancia'
import '../paneles.css'

function Gestion({ negocio, nombreUsuario, codigoInicial, onListo }) {
  // Si venimos de "Crear este producto" (desde Contar), abre directo en Productos
  const [seccion, setSeccion] = useState(codigoInicial ? 'productos' : 'mercancia')

  return (
    <div className="gestion">
      {/* Dos botones grandes: icono Lucide arriba (blanco si esta activo, naranja si no) y la palabra grande */}
      <div className="gestion-menu">
        <button className={seccion === 'mercancia' ? 'activo' : ''} onClick={() => setSeccion('mercancia')}>
          <Package size={32} strokeWidth={seccion === 'mercancia' ? 2.25 : 1.75} color={seccion === 'mercancia' ? 'white' : '#FF6600'} />
          Mercancía
        </button>
        <button className={seccion === 'productos' ? 'activo' : ''} onClick={() => setSeccion('productos')}>
          <Tag size={32} strokeWidth={seccion === 'productos' ? 2.25 : 1.75} color={seccion === 'productos' ? 'white' : '#FF6600'} />
          Productos
        </button>
      </div>

      <div className="gestion-contenido">
        {seccion === 'mercancia' && <Mercancia negocio={negocio} nombreUsuario={nombreUsuario} />}
        {seccion === 'productos' && <Productos negocio={negocio} codigoInicial={codigoInicial} onListo={onListo} />}
      </div>
    </div>
  )
}

export default Gestion
