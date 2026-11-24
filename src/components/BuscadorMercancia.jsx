// =====================================================================
// Buscador de mercancia (Inicio). Se escribe el CODIGO DE BARRAS o el NOMBRE, sale una lista,
// se escoge el producto y muestra: cuanto hay en Bodega, el precio y lo que vale ese saldo.
//
// Saldo de Bodega = lo contado en Bodega (si el conteo sigue abierto)
//                 + el punto de partida guardado al cerrar el inventario
//                 + ingresos - salidas.
// Asi funciona igual durante el conteo y despues de cerrarlo.
// =====================================================================
import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, Warehouse, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import '../paneles.css'

const NARANJA = '#FF6600'

// Quita tildes y mayusculas para buscar sin importar como este escrito el nombre
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Formato de plata colombiana: $1.234.567
function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
}

// Numero sin decimales de mas (3 en vez de 3.0000)
function num(n) {
  return (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString('es-CO')
}

function BuscadorMercancia({ negocio }) {
  const neg = negocio.codigo_negocio
  const [productos, setProductos] = useState([])
  const [estado, setEstado] = useState('Cargando productos...')
  const [texto, setTexto] = useState('')
  const [coincidencias, setCoincidencias] = useState([])
  const [elegido, setElegido] = useState(null)   // producto que se esta viendo
  const [saldo, setSaldo] = useState(null)       // cuentas de ese producto
  const [consultando, setConsultando] = useState(false)
  const inputRef = useRef(null)

  // Al abrir: trae los productos de 1000 en 1000 (Supabase entrega maximo 1000 por consulta)
  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        let todos = []
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await supabase
            .from('productos')
            .select('codigo, codigo_padre, nombre, precio_de_compra, unidad_medida, existencia')
            .eq('establecimiento', neg).order('codigo').range(desde, desde + 999)
          if (error) throw new Error(error.message)
          todos = todos.concat(data)
          if (data.length < 1000) break
        }
        if (!vivo) return
        setProductos(todos)
        setEstado('')
      } catch (e) {
        if (vivo) setEstado('No se pudo cargar la lista: ' + e.message)
      }
    }
    cargar()
    return () => { vivo = false }
  }, [neg])

  // Lista con el nombre ya normalizado, para que la busqueda sea rapida
  const indice = useMemo(() => productos.map((p) => ({ ...p, _n: normalizar(p.nombre) })), [productos])

  // Busqueda en vivo, igual que en Contar
  useEffect(() => {
    const t = texto.trim()
    if (!t) { setCoincidencias([]); return }

    // 1) Codigo exacto (pistola de codigo de barras)
    const exacto = indice.find((p) => p.codigo === t)
    if (exacto) {
      const variantes = indice.filter((p) => p.codigo_padre === exacto.codigo)
      if (variantes.length > 0) setCoincidencias(variantes) // codigo amarrado: elegir cual es
      else elegir(exacto)
      return
    }
    // 2) Por nombre: todas las palabras escritas deben estar en el nombre
    const palabras = normalizar(t).split(' ').filter(Boolean)
    setCoincidencias(indice.filter((p) => palabras.every((w) => p._n.includes(w))).slice(0, 10))
  }, [texto, indice])

  // Escoge un producto y calcula sus cuentas
  async function elegir(p) {
    setElegido(p)
    setCoincidencias([])
    setTexto(p.codigo)
    setSaldo(null)
    setConsultando(true)
    try {
      const [conteos, mercancia] = await Promise.all([
        supabase.from('movimientos').select('seccion, cantidad')
          .eq('negocio', neg).eq('codigo', p.codigo).eq('anulado', false),
        supabase.from('movimientos_mercancia').select('tipo, destino, cantidad')
          .eq('negocio', neg).eq('codigo', p.codigo).eq('anulado', false)
      ])
      if (conteos.error) throw new Error(conteos.error.message)
      if (mercancia.error) throw new Error(mercancia.error.message)

      const r = { contadoBodega: 0, contadoTienda: 0, inicialBodega: 0, ingresos: 0, salidas: 0 }
      conteos.data.forEach((m) => {
        const c = Number(m.cantidad) || 0
        if (m.seccion === 'Bodega') r.contadoBodega += c
        if (m.seccion === 'Tienda') r.contadoTienda += c
      })
      mercancia.data.forEach((m) => {
        const c = Number(m.cantidad) || 0
        if (m.tipo === 'inventario' && m.destino === 'Bodega') r.inicialBodega += c
        if (m.tipo === 'ingreso') r.ingresos += c
        if (m.tipo === 'salida') r.salidas += c
      })
      r.bodega = r.contadoBodega + r.inicialBodega + r.ingresos - r.salidas
      setSaldo(r)
    } catch (e) {
      setSaldo({ error: e.message })
    }
    setConsultando(false)
  }

  function limpiar() {
    setTexto('')
    setElegido(null)
    setSaldo(null)
    setCoincidencias([])
    if (inputRef.current) inputRef.current.focus()
  }

  const medida = elegido && elegido.unidad_medida ? elegido.unidad_medida : 'unidades'
  const precio = elegido ? Number(elegido.precio_de_compra) || 0 : 0

  return (
    <div className="buscador-caja">
      <div className="buscador-titulo">¿Cuánta mercancía hay?</div>

      {/* Campo grande: codigo de barras o nombre */}
      <div className="buscador-campo">
        <Search size={24} strokeWidth={1.75} color={NARANJA} className="buscador-lupa" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Código de barras o nombre"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setElegido(null); setSaldo(null) }}
        />
        {texto && (
          <button className="buscador-borrar" onClick={limpiar} aria-label="Borrar">
            <X size={20} strokeWidth={1.75} color="#5B6470" />
          </button>
        )}
      </div>

      {estado && <p className="buscador-aviso">{estado}</p>}

      {/* Listica de coincidencias */}
      {coincidencias.length > 0 && (
        <div className="buscador-lista">
          {coincidencias.map((p) => (
            <div key={p.codigo} className="buscador-item" onClick={() => elegir(p)}>
              <div style={{ fontWeight: 600 }}>{p.nombre}</div>
              <div style={{ fontSize: 14, color: '#5B6470' }}>
                {p.codigo} · {plata(p.precio_de_compra)}
              </div>
            </div>
          ))}
        </div>
      )}

      {texto.trim().length >= 3 && !estado && coincidencias.length === 0 && !elegido && (
        <p className="buscador-aviso">No encontré ese producto en la lista.</p>
      )}

      {/* Ficha del producto escogido */}
      {elegido && (
        <div className="ficha-producto">
          <div style={{ fontSize: 20, fontWeight: 600, color: '#111417' }}>{elegido.nombre}</div>
          <div style={{ fontSize: 14, color: '#5B6470', marginBottom: 12 }}>Código {elegido.codigo}</div>

          {consultando && <p className="buscador-aviso">Consultando...</p>}
          {saldo && saldo.error && <p style={{ color: '#DC2626', fontSize: 14 }}>No se pudo consultar: {saldo.error}</p>}

          {saldo && !saldo.error && (
            <div>
              <div className="ficha-fila-grande">
                <div className="ficha-icono"><Warehouse size={24} strokeWidth={1.75} color={NARANJA} /></div>
                <div>
                  <div style={{ fontSize: 14, color: '#5B6470' }}>Hay en Bodega</div>
                  <div className="ficha-numero" style={{ color: saldo.bodega < 0 ? '#DC2626' : '#111417' }}>
                    {num(saldo.bodega)} <span style={{ fontSize: 16, fontWeight: 400, color: '#5B6470' }}>{medida}</span>
                  </div>
                </div>
              </div>

              <div className="ficha-datos">
                <div><span>Precio de compra</span><b>{plata(precio)}</b></div>
                <div><span>Valor de lo que hay en Bodega</span><b>{plata(saldo.bodega * precio)}</b></div>
              </div>

              {/* Como se llega a ese numero */}
              <div className="ficha-detalle">
                {saldo.contadoBodega !== 0 && <div>Contado en Bodega: {num(saldo.contadoBodega)}</div>}
                {saldo.inicialBodega !== 0 && <div>Punto de partida: {num(saldo.inicialBodega)}</div>}
                <div>Ingresos: {num(saldo.ingresos)}</div>
                <div>Salidas: {num(saldo.salidas)}</div>
              </div>

              <div className="ficha-otro">
                <Store size={16} strokeWidth={1.75} color="#A0A7B0" />
                <span>Contado en Tienda: <b>{num(saldo.contadoTienda)}</b></span>
              </div>
              {elegido.existencia !== null && elegido.existencia !== undefined && Number(elegido.existencia) !== 0 && (
                <div className="ficha-otro">
                  <span style={{ width: 16 }} />
                  <span>Existencia del sistema (Bodega + Tienda): <b>{num(elegido.existencia)}</b></span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default BuscadorMercancia
