// =====================================================================
// Pantalla "Contar": escaneo con pistola o camara, busqueda por codigo o por nombre,
// y guardado de cada movimiento.
//   - Supabase (tabla movimientos) = historial central de todos los celulares
//   - Google Sheets = el cardex; se actualiza en segundo plano con la cola de envios
// =====================================================================
import { useState, useEffect, useRef, useMemo } from 'react'
import { Camera, X, RefreshCw } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { supabase } from '../lib/supabaseClient'
import { encolar, procesarCola, nuevoUuid } from '../lib/colaSheets'

// Formatos de codigo de barras de un supermercado. Limitar los formatos hace que la camara lea mas rapido.
const FORMATOS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39
]

// Quita tildes y mayusculas para buscar sin importar como este escrito el nombre
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function Contar({ negocio, nombreUsuario, rol, onCrearProducto }) {
  // Los empleados solo cuentan en Tienda. La Bodega es solo para el admin (celulares del area administrativa).
  const secciones = rol === 'admin' ? ['Bodega', 'Tienda'] : ['Tienda']
  const [productos, setProductos] = useState([])
  const [estado, setEstado] = useState('Cargando productos...')
  const [seccion, setSeccion] = useState(rol === 'admin' ? 'Bodega' : 'Tienda')
  const [texto, setTexto] = useState('')
  const [coincidencias, setCoincidencias] = useState([])
  const [productoActual, setProductoActual] = useState(null)
  const [precio, setPrecio] = useState(0)
  const [cantidad, setCantidad] = useState('1')
  const [guardando, setGuardando] = useState(false)
  const [camaraAbierta, setCamaraAbierta] = useState(false)
  const [historial, setHistorial] = useState([])
  const html5QrRef = useRef(null)
  const inputRef = useRef(null)
  const cantidadRef = useRef(null)
  const enviandoRef = useRef(false) // candado: evita guardar dos veces si tocan "Agregar" dos veces

  // Al abrir la pantalla: carga los productos y el historial de esta persona
  useEffect(() => {
    cargarProductos()
    cargarHistorial()
    // Al salir de la pantalla se apaga la camara si quedo prendida
    return () => {
      if (html5QrRef.current) html5QrRef.current.stop().catch(() => {})
    }
  }, [])

  // Trae los productos de Supabase de 1000 en 1000 (Supabase entrega maximo 1000 por consulta)
  async function cargarProductos() {
    setEstado('Actualizando lista...')
    let todos = []
    let desde = 0
    const TAMANO = 1000
    while (true) {
      const { data, error } = await supabase
        .from('productos')
        .select('codigo, nombre, precio_de_compra, codigo_padre, unidad_medida')
        .eq('establecimiento', negocio.codigo_negocio)
        .range(desde, desde + TAMANO - 1)
      if (error) {
        setEstado('Error cargando productos: ' + error.message)
        return
      }
      todos = todos.concat(data)
      if (data.length < TAMANO) break
      desde += TAMANO
    }
    setProductos(todos)
    setEstado('Productos cargados (' + todos.length + ')')
  }

  // Ultimos 20 movimientos de esta persona (viene de Supabase, asi desaparece al vaciar el inventario)
  async function cargarHistorial() {
    const { data, error } = await supabase
      .from('movimientos')
      .select('id, codigo, nombre, cantidad, seccion, anulado, corrige_id, creado_en')
      .eq('negocio', negocio.codigo_negocio)
      .eq('usuario', nombreUsuario)
      .order('creado_en', { ascending: false })
      .limit(20)
    if (!error) setHistorial(data)
  }

  function reproducirBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 1000
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.start()
      osc.stop(ctx.currentTime + 0.15)
    } catch (e) {}
  }

  // Lista con el nombre ya normalizado, para que la busqueda por nombre sea rapida
  const indice = useMemo(
    () => productos.map((p) => ({ ...p, _n: normalizar(p.nombre) })),
    [productos]
  )

  // Busqueda en vivo: se ejecuta cada vez que cambia lo escrito (o lo que llega de la pistola)
  useEffect(() => {
    const t = texto.trim()
    if (!t) {
      setCoincidencias([])
      return
    }

    // 1) Codigo exacto (pistola o camara)
    const exacto = indice.find((p) => p.codigo === t)
    if (exacto) {
      const variantes = indice.filter((p) => p.codigo_padre === exacto.codigo)
      if (variantes.length > 0) setCoincidencias(variantes) // codigo amarrado: elegir cual es
      else seleccionarProducto(exacto)
      return
    }

    // 2) Por nombre: todas las palabras escritas deben estar en el nombre (en cualquier orden)
    const palabras = normalizar(t).split(' ').filter(Boolean)
    setCoincidencias(indice.filter((p) => palabras.every((w) => p._n.includes(w))).slice(0, 10))
  }, [texto, indice])

  // Cuando hay un producto en pantalla, el cursor salta a la cantidad
  useEffect(() => {
    if (productoActual && cantidadRef.current) {
      cantidadRef.current.focus()
      cantidadRef.current.select()
    }
  }, [productoActual])

  function seleccionarProducto(p) {
    reproducirBeep()
    setProductoActual(p)
    setPrecio(p.precio_de_compra)
    setCantidad('1')
    setCoincidencias([])
    setTexto(p.codigo)
  }

  function cancelar() {
    setProductoActual(null)
    setTexto('')
    if (inputRef.current) inputRef.current.focus()
  }

  async function confirmar() {
    if (enviandoRef.current) return // ya se esta guardando: se ignora el segundo toque
    if (!productoActual) return

    const cant = parseFloat(String(cantidad).replace(',', '.'))
    if (!cant || cant <= 0) {
      setEstado('Escribe una cantidad mayor que cero')
      return
    }

    enviandoRef.current = true
    setGuardando(true)
    const nombreFinal = productoActual.nombre || productoActual.codigo
    const idMov = nuevoUuid()

    // 1) Guarda el movimiento en Supabase (rapido). Queda en el historial de todos.
    const { error } = await supabase.from('movimientos').insert({
      id: idMov,
      negocio: negocio.codigo_negocio,
      usuario: nombreUsuario,
      seccion,
      codigo: productoActual.codigo,
      nombre: nombreFinal,
      cantidad: cant
    })
    if (error) {
      setEstado('No se pudo guardar: ' + error.message)
      enviandoRef.current = false
      setGuardando(false)
      return
    }

    // 2) El envio a Google Sheets queda en la cola y se manda en segundo plano (se reintenta solo)
    encolar(negocio.codigo_negocio, {
      idMov,
      codigo: productoActual.codigo,
      cantidad: cant,
      seccion,
      nombre: nombreFinal,
      precio: Number(String(precio).replace(',', '.')) || 0,
      usuario: nombreUsuario,
      tipo: 'entrada'
    })
    procesarCola(negocio.codigo_negocio, negocio.apps_script_url)

    setEstado('Guardado ✓')
    cancelar()
    cargarHistorial()
    enviandoRef.current = false
    setGuardando(false)
  }

  // ----- Camara: ventana angosta, con el boton de cerrar siempre arriba y visible -----
  function abrirCamara() {
    setCamaraAbierta(true)
    setTimeout(() => {
      const instancia = new Html5Qrcode('lector-camara', {
        formatsToSupport: FORMATOS,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }, // usa el lector nativo si el celular lo tiene (mas rapido)
        verbose: false
      })
      html5QrRef.current = instancia
      instancia
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 100 }, aspectRatio: 1.5 },
          (textoLeido) => {
            setTexto(textoLeido)
            cerrarCamara()
          },
          () => {}
        )
        .catch(() => {
          setEstado('No se pudo abrir la cámara')
          setCamaraAbierta(false)
        })
    }, 100)
  }

  function cerrarCamara() {
    if (html5QrRef.current) html5QrRef.current.stop().catch(() => {})
    setCamaraAbierta(false)
  }

  const estiloCaja = { padding: 10, border: '1px solid #E4E7EB', borderRadius: 8 }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#5B6470' }}>{estado}</span>
        <button
          onClick={cargarProductos}
          style={{ fontSize: 14, padding: '6px 10px', background: 'white', border: '1px solid #E4E7EB', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={16} strokeWidth={1.75} color="#FF6600" /> Actualizar lista
        </button>
      </div>

      {/* Bodega / Tienda (el empleado solo ve Tienda) */}
      <div className="pestanas">
        {secciones.map((s) => (
          <button key={s} className={'pestana' + (seccion === s ? ' activa' : '')} onClick={() => setSeccion(s)}>
            {s}
          </button>
        ))}
      </div>

      {/* Codigo de barras o nombre */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Código de barras o nombre del producto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="campo-grande" style={{ flex: 1 }}
        />
        <button
          onClick={abrirCamara}
          aria-label="Abrir cámara"
          style={{ background: 'white', border: '1px solid #E4E7EB', borderRadius: 8, padding: '0 16px', display: 'flex', alignItems: 'center' }}
        >
          <Camera size={24} strokeWidth={1.75} color="#FF6600" />
        </button>
      </div>

      {camaraAbierta && (
        <div style={{ maxWidth: 280, margin: '0 auto 12px auto' }}>
          <button
            onClick={cerrarCamara}
            style={{ width: '100%', marginBottom: 6, padding: 10, background: '#111417', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <X size={16} strokeWidth={1.75} /> Cerrar cámara
          </button>
          <div id="lector-camara" style={{ width: '100%' }}></div>
        </div>
      )}

      {/* Resultados de la busqueda por nombre (o variantes de un codigo amarrado) */}
      {coincidencias.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {coincidencias.map((p) => (
            <div key={p.codigo} onClick={() => seleccionarProducto(p)} style={{ ...estiloCaja, marginBottom: 6, cursor: 'pointer' }}>
              <b>{p.nombre}</b>
              <br />
              <span style={{ fontSize: 12, color: '#5B6470' }}>Código {p.codigo}</span>
            </div>
          ))}
        </div>
      )}

      {/* Codigo que no esta en la lista: no se puede enviar. El admin lo crea en la pestaña Productos. */}
      {texto.trim().length >= 8 && coincidencias.length === 0 && !productoActual && /^[0-9]+$/.test(texto.trim()) && (
        <div style={{ marginBottom: 12, padding: 10, border: '1px solid #DC2626', borderRadius: 8, color: '#DC2626', fontSize: 13 }}>
          Este código no está en la lista, así que no se puede enviar. Avísale al administrador para que lo cree.
          <br />
          <b>Código: {texto.trim()}</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={cargarProductos}
              style={{ padding: '6px 10px', background: 'white', border: '1px solid #DC2626', color: '#DC2626', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={16} strokeWidth={1.75} /> Actualizar lista
            </button>
            {rol === 'admin' && onCrearProducto && (
              <button
                onClick={() => onCrearProducto(texto.trim())}
                style={{ padding: '6px 10px', background: '#FF6600', border: 'none', color: 'white', borderRadius: 6, fontWeight: 'bold' }}
              >
                Crear este producto
              </button>
            )}
          </div>
        </div>
      )}

      {/* Producto seleccionado: precio, cantidad y boton Agregar */}
      {productoActual && (
        <div style={{ background: 'white', border: '1px solid #E4E7EB', borderRadius: 10, padding: 14 }}>
          <div style={{ fontWeight: 'bold' }}>{productoActual.nombre || 'Código: ' + productoActual.codigo}</div>

          {/* El precio ya NO se edita aqui (solo en Productos > Editar). Se muestra con su medida. */}
          <div style={{ marginTop: 10, marginBottom: 10, padding: 10, background: '#FFF3EB', borderRadius: 8, fontSize: 13 }}>
            <div>
              Precio: <b>${Math.round(Number(precio) || 0).toLocaleString('es-CO')}</b>
              {productoActual.unidad_medida ? ' por ' + productoActual.unidad_medida : ''}
            </div>
            <div style={{ color: '#FF6600', fontWeight: 'bold', marginTop: 2 }}>
              {productoActual.unidad_medida
                ? 'Este producto se cuenta por ' + productoActual.unidad_medida.toUpperCase()
                : 'Medida sin definir (se cuenta por unidad)'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={cantidadRef}
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              placeholder={productoActual.unidad_medida ? 'Cantidad (en ' + productoActual.unidad_medida + ')' : 'Cantidad'}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmar() }}
              style={{ ...estiloCaja, flex: 1 }}
            />
            <button
              onClick={confirmar}
              disabled={guardando}
              style={{ background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, padding: '0 16px', fontWeight: 'bold', opacity: guardando ? 0.6 : 1 }}
            >
              {guardando ? 'Guardando...' : 'Agregar'}
            </button>
          </div>

          <button onClick={cancelar} style={{ width: '100%', marginTop: 8, padding: 10, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}>
            Cancelar / solo consultar
          </button>
        </div>
      )}

      {/* Historial de esta persona (ultimos 20) */}
      <div style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Lo que has enviado tú (últimos 20)</div>
        {historial.length === 0 && <p style={{ color: '#5B6470', fontSize: 13 }}>Aún no has escaneado nada</p>}
        {historial.map((item) => (
          <div
            key={item.id}
            style={{
              fontSize: 12,
              color: item.anulado ? '#DC2626' : '#5B6470',
              borderBottom: '1px dashed #E4E7EB',
              padding: '6px 0',
              textDecoration: item.anulado ? 'line-through' : 'none',
              opacity: item.anulado ? 0.7 : 1
            }}
          >
            <b>{item.corrige_id ? '=' : '+'}{item.cantidad}</b> {item.nombre} · {item.seccion}
            {item.anulado && <span> (corregido por el admin)</span>}
            {item.corrige_id && <span> (cantidad corregida)</span>}
            <br />
            <span style={{ fontSize: 10 }}>{new Date(item.creado_en).toLocaleString('es-CO')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Contar
