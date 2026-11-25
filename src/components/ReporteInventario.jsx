// =====================================================================
// Pestaña "Reporte" dentro de Contar (solo admin).
//   1) Tarjetas con lo CONTADO: Bodega, Tienda y Total (en plata), para ir revisando sin bajar el Excel.
//   2) Boton para descargar el reporte del inventario en Excel.
// Los totales salen del conteo (tabla movimientos): cantidad x precio de lo que NO esta anulado.
// =====================================================================
import { useState, useEffect } from 'react'
import { Warehouse, Store, Download, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { generarReporteInventario } from '../lib/reporteInventario'
import { estadoInventario } from '../lib/inventario'
import '../paneles.css'

const NARANJA = '#FF6600'

function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
}

// Lee TODAS las filas de una consulta (Supabase entrega maximo 1000 por vez)
async function leerTodo(armarConsulta) {
  const todo = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armarConsulta().range(desde, desde + 999)
    if (error) throw new Error(error.message)
    todo.push(...data)
    if (data.length < 1000) break
  }
  return todo
}

function ReporteInventario({ negocio }) {
  const [datos, setDatos] = useState(null)
  const [inv, setInv] = useState(null)             // inventario abierto o cerrado
  const [cargando, setCargando] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  // Suma lo contado por seccion (Bodega / Tienda)
  async function calcular() {
    setCargando(true)
    setMensaje('')
    try {
      // Solo lo contado en ESTE inventario (desde que empezo, y hasta que cerro si ya cerro)
      const estado = await estadoInventario(negocio, true)
      setInv(estado)
      const movs = await leerTodo(() => {
        let q = supabase.from('movimientos').select('seccion, codigo, cantidad')
          .eq('negocio', negocio.codigo_negocio).eq('anulado', false).gte('creado_en', estado.desde)
        if (estado.hasta) q = q.lte('creado_en', estado.hasta)
        return q.order('id')
      })
      const prods = await leerTodo(() =>
        supabase.from('productos').select('codigo, precio_de_compra')
          .eq('establecimiento', negocio.codigo_negocio).order('codigo')
      )
      const precios = new Map(prods.map((p) => [p.codigo, Number(p.precio_de_compra) || 0]))
      const sec = { Bodega: { plata: 0, unidades: 0, productos: new Set() }, Tienda: { plata: 0, unidades: 0, productos: new Set() } }
      let sinPrecio = 0
      movs.forEach((m) => {
        const s = sec[m.seccion]
        if (!s) return
        const cant = Number(m.cantidad) || 0
        const precio = precios.get(m.codigo)
        if (!precio) sinPrecio++
        s.plata += cant * (precio || 0)
        s.unidades += cant
        s.productos.add(m.codigo)
      })
      setDatos({
        Bodega: { plata: sec.Bodega.plata, unidades: sec.Bodega.unidades, productos: sec.Bodega.productos.size },
        Tienda: { plata: sec.Tienda.plata, unidades: sec.Tienda.unidades, productos: sec.Tienda.productos.size },
        sinPrecio
      })
    } catch (e) {
      setMensaje('No se pudo calcular: ' + e.message)
    }
    setCargando(false)
  }

  useEffect(() => { calcular() }, [])

  async function bajar() {
    setBajando(true)
    setMensaje('')
    try {
      const r = await generarReporteInventario(negocio, setMensaje)
      setMensaje('✓ Descargado ' + r.archivo + ' (' + r.productos + ' productos contados, ' + r.paraRevisar + ' para revisar)')
    } catch (e) {
      setMensaje('No se pudo generar el reporte: ' + e.message)
    }
    setBajando(false)
  }

  return (
    <div>
      <div className="pantalla-cabeza">
        <div className="pantalla-titulo" style={{ fontSize: 20 }}>
          Lo contado{inv && !inv.sinTabla ? ' · Inventario ' + inv.numero + (inv.abierto ? '' : ' (cerrado)') : ''}
        </div>
        <button className="boton-chico" onClick={calcular} disabled={cargando} style={{ opacity: cargando ? 0.6 : 1 }}>
          <RefreshCw size={16} strokeWidth={1.75} color={NARANJA} /> {cargando ? 'Calculando...' : 'Actualizar'}
        </button>
      </div>

      {datos && (
        <div>
          <div className="tarjetas2">
            {[['Bodega', Warehouse], ['Tienda', Store]].map((par) => {
              const Icono = par[1]
              const d = datos[par[0]]
              return (
                <div key={par[0]} className="tarjeta-alta">
                  <div className="tarjeta-cabeza">
                    <div className="tarjeta-icono"><Icono size={44} strokeWidth={1.75} color={NARANJA} /></div>
                    <div className="tarjeta-nombre">{par[0]}</div>
                  </div>
                  <div className="tarjeta-monto">{plata(d.plata)}</div>
                  <div className="tarjeta-detalle">
                    {d.productos.toLocaleString('es-CO')} productos · {d.unidades.toLocaleString('es-CO')} unidades
                  </div>
                </div>
              )
            })}
          </div>
          <div className="franja-total">
            <span style={{ fontSize: 14 }}>Total mercancía contada</span>
            <b style={{ fontSize: 20 }}>{plata(datos.Bodega.plata + datos.Tienda.plata)}</b>
          </div>
          {datos.sinPrecio > 0 && (
            <p style={{ fontSize: 12, color: '#D97706', textAlign: 'center', margin: '0 0 12px' }}>
              {datos.sinPrecio} envíos son de productos sin precio, así que no suman plata todavía.
            </p>
          )}
        </div>
      )}

      <div className="caja-panel" style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#5B6470', marginTop: 0, textAlign: 'left' }}>
          Un Excel con lo que se ha contado: el total en Bodega y Tienda, cada producto con su valor, los que hay que revisar,
          quién envió qué, los productos que nadie ha contado y lo que se ha corregido.
        </p>
        <button className="boton-reporte" onClick={bajar} disabled={bajando} style={{ background: NARANJA, color: 'white' }}>
          <Download size={16} strokeWidth={1.75} /> {bajando ? 'Preparando el reporte...' : 'Descargar reporte del inventario'}
        </button>
        {mensaje && <p style={{ fontSize: 14, color: mensaje.startsWith('✓') ? '#16A34A' : '#5B6470' }}>{mensaje}</p>}
      </div>
    </div>
  )
}

export default ReporteInventario