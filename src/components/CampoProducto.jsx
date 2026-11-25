// =====================================================================
// CampoProducto: campo para encontrar un producto por CODIGO DE BARRAS o por NOMBRE.
// Se usa en Ingresar, Sacar y Reportar.
//   - Con la pistola: lee el codigo y manda Enter -> se escoge solo.
//   - Sin pistola: escribe parte del nombre -> sale una lista -> se toca el producto.
// Cuando se escoge un producto se llama onElegir(producto) con:
//   { codigo, nombre, precio_de_compra, unidad_medida }
// =====================================================================
import { useState, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Lista de productos guardada en memoria para no pedirla a Supabase en cada pantalla.
// Se vuelve a pedir si tiene mas de 60 segundos (por si crearon un producto nuevo).
const cache = { negocio: null, hora: 0, productos: [] }

// Quita tildes y mayusculas para buscar sin importar como este escrito el nombre
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
}

function CampoProducto({ negocio, onElegir, placeholder }) {
  const neg = negocio.codigo_negocio
  const [productos, setProductos] = useState(cache.negocio === neg ? cache.productos : [])
  const [estado, setEstado] = useState('')
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')

  // Al abrir: trae los productos de 1000 en 1000 (Supabase entrega maximo 1000 por consulta)
  useEffect(() => {
    let vivo = true
    async function cargar() {
      if (cache.negocio === neg && Date.now() - cache.hora < 60000) return
      if (cache.negocio !== neg) setEstado('Cargando productos...')
      try {
        let todos = []
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await supabase
            .from('productos')
            .select('codigo, nombre, precio_de_compra, unidad_medida')
            .eq('establecimiento', neg).order('codigo').range(desde, desde + 999)
          if (error) throw new Error(error.message)
          todos = todos.concat(data)
          if (data.length < 1000) break
        }
        cache.negocio = neg
        cache.hora = Date.now()
        cache.productos = todos
        if (vivo) { setProductos(todos); setEstado('') }
      } catch (e) {
        if (vivo) setEstado('No se pudo cargar la lista: ' + e.message)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [neg])

  // Lista con el nombre ya normalizado, para que la busqueda sea rapida
  const indice = useMemo(() => productos.map((p) => ({ ...p, _n: normalizar(p.nombre) })), [productos])

  // Coincidencias mientras se escribe (maximo 10)
  const coincidencias = useMemo(() => {
    const t = texto.trim()
    if (t.length < 2) return []
    const palabras = normalizar(t).split(' ').filter(Boolean)
    const porNombre = indice.filter((p) => palabras.every((w) => p._n.includes(w)))
    // Si lo escrito son solo numeros, tambien busca codigos que empiecen igual
    if (/^\d+$/.test(t) && t.length >= 4) {
      const porCodigo = indice.filter((p) => p.codigo.startsWith(t))
      return [...porCodigo, ...porNombre.filter((p) => !p.codigo.startsWith(t))].slice(0, 10)
    }
    return porNombre.slice(0, 10)
  }, [texto, indice])

  function escoger(p) {
    setTexto('')
    setAviso('')
    onElegir({ codigo: p.codigo, nombre: p.nombre, precio_de_compra: p.precio_de_compra, unidad_medida: p.unidad_medida })
  }

  // Enter (la pistola lo manda al terminar de leer): codigo exacto, o la unica coincidencia
  function alEnter() {
    const t = texto.trim()
    if (!t) return
    const exacto = indice.find((p) => p.codigo === t)
    if (exacto) return escoger(exacto)
    if (coincidencias.length === 1) return escoger(coincidencias[0])
    if (coincidencias.length === 0) setAviso('No encontré ese producto en la lista. Si es nuevo, créalo primero en Productos.')
    else setAviso('Toca el producto correcto de la lista.')
  }

  return (
    <div>
      <div className="buscador-campo" style={{ marginBottom: 10 }}>
        <Search size={22} strokeWidth={1.75} color="#FF6600" className="buscador-lupa" style={{ top: 16 }} />
        <input
          autoFocus
          type="text"
          placeholder={placeholder || 'Código de barras o nombre'}
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setAviso('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') alEnter() }}
        />
        {texto && (
          <button className="buscador-borrar" onClick={() => { setTexto(''); setAviso('') }} aria-label="Borrar">
            <X size={20} strokeWidth={1.75} color="#5B6470" />
          </button>
        )}
      </div>

      {estado && <p className="buscador-aviso">{estado}</p>}
      {aviso && <p style={{ fontSize: 13, color: '#DC2626', margin: '0 0 8px' }}>{aviso}</p>}

      {/* Lista de coincidencias: muestra el CODIGO para no confundir productos parecidos */}
      {coincidencias.length > 0 && (
        <div className="buscador-lista" style={{ marginBottom: 10 }}>
          {coincidencias.map((p) => (
            <div key={p.codigo} className="buscador-item" onClick={() => escoger(p)}>
              <div style={{ fontWeight: 600 }}>{p.nombre}</div>
              <div style={{ fontSize: 14, color: '#5B6470' }}>{p.codigo} · {plata(p.precio_de_compra)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CampoProducto
