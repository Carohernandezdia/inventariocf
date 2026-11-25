// =====================================================================
// Buscador de mercancia (Inicio). Se escribe el CODIGO DE BARRAS o el NOMBRE, sale una lista,
// se escoge el producto y muestra: cuanto hay en Bodega, el precio y lo que vale ese saldo.
//
// Saldo de Bodega = lo contado en Bodega (si el conteo sigue abierto)
//                 + el punto de partida guardado al cerrar el inventario
//                 + ingresos (y reintegros de reportes) - salidas - lo descontado por reportes.
// Los ingresos directos a Tienda NO suman a Bodega. Los reportes pendientes se ven y se cierran desde aqui.
// Asi funciona igual durante el conteo y despues de cerrarlo.
// =====================================================================
import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, Warehouse, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MARCA, TIPOS_PLURAL, cargarReportes, unidadesDescontadas, descuenta } from './ReporteItem'
import { calcularSaldos } from '../lib/inventario'
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

function BuscadorMercancia({ negocio, nombreUsuario }) {
  const neg = negocio.codigo_negocio
  const [productos, setProductos] = useState([])
  const [estado, setEstado] = useState('Cargando productos...')
  const [texto, setTexto] = useState('')
  const [coincidencias, setCoincidencias] = useState([])
  const [elegido, setElegido] = useState(null)   // producto que se esta viendo
  const [saldo, setSaldo] = useState(null)       // cuentas de ese producto
  const [consultando, setConsultando] = useState(false)
  const [reportes, setReportes] = useState([])    // reportes pendientes de ese producto
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
    await calcularCuentas(p)
    setConsultando(false)
  }

  // Trae conteos, movimientos y reportes pendientes de ese producto
  async function calcularCuentas(p) {
    try {
      // Primero los reportes: si hay que reparar algun descuento, queda hecho antes de sumar los movimientos
      const reps = await cargarReportes({ codigo_negocio: neg }, p.codigo, 100)
      // Las cuentas (stock inicial, ingresos, salidas, lo contado...) las hace lib/inventario.js,
      // que sabe si el inventario esta abierto o cerrado
      const r = await calcularSaldos({ codigo_negocio: neg }, p.codigo, MARCA)
      setSaldo(r)
      setReportes(reps || [])
    } catch (e) {
      setSaldo({ error: e.message })
    }
  }

  function limpiar() {
    setTexto('')
    setElegido(null)
    setSaldo(null)
    setReportes([])
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

              {/* Todo en un solo cuadro: como se llega a ese numero + lo reportado (en rojo) */}
              <div className="ficha-detalle">
                {saldo.inicialBodega !== 0 && <div>Stock inicial: {num(saldo.inicialBodega)}</div>}
                {!saldo.comparando && saldo.contadoBodega !== 0 && <div>Contado en Bodega (provisional): {num(saldo.contadoBodega)}</div>}
                <div>Ingresos: {num(saldo.ingresos + saldo.reintegros)}</div>
                <div>Salidas: {num(saldo.salidas)}</div>
                {saldo.ingresoTienda > 0 && <div>Entró directo a Tienda: {num(saldo.ingresoTienda)}</div>}

                {/* Reportes en rojo: "6 unidades vencidas (descontadas)". El detalle vive en Mercancia > Reportar */}
                {Object.keys(TIPOS_PLURAL).map((k) => {
                  const lista = reportes.filter((r) => r.tipo === k)
                  if (lista.length === 0) return null
                  const unidades = lista.reduce((t, r) => t + (descuenta(k) ? unidadesDescontadas(r) : Number(r.cantidad)), 0)
                  const pend = lista.filter((r) => r.estado === 'pendiente').length
                  if (unidades <= 0 && pend === 0) return null
                  return (
                    <div key={k} style={{ color: '#DC2626' }}>
                      {num(unidades)} {medida} {TIPOS_PLURAL[k]}{descuenta(k) ? ' (descontadas)' : ''}
                      {pend > 0 ? ' · ' + pend + ' pendiente' + (pend > 1 ? 's' : '') : ''}
                    </div>
                  )
                })}
              </div>

              {/* Inventario nuevo abierto: lo contado se compara con lo que deberia haber */}
              {saldo.comparando && (
                <div className="ficha-detalle" style={{ marginTop: 4 }}>
                  <div>Contado en este inventario (Bodega): <b>{num(saldo.contadoBodega)}</b></div>
                  <div>Debería haber: <b>{num(saldo.esperadoBodega)}</b></div>
                  <div style={{ color: saldo.diferenciaBodega === 0 ? '#16A34A' : '#DC2626' }}>
                    Diferencia: <b>{saldo.diferenciaBodega > 0 ? '+' : ''}{num(saldo.diferenciaBodega)}</b>
                    {saldo.diferenciaBodega < 0 ? ' (faltan)' : saldo.diferenciaBodega > 0 ? ' (sobran)' : ''}
                  </div>
                </div>
              )}

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