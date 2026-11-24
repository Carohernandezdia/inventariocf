// =====================================================================
// Pantalla "Productos" (solo admin): Crear, Editar y Eliminar productos.
// Todo se guarda en Supabase Y se refleja tambien en Google Sheets (hojas Bodega y Tienda).
// =====================================================================
import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MEDIDAS } from '../lib/medidas'
import { leerNumero } from '../lib/numeros'

// ---------- Ayudas ----------

// Manda una instruccion al Apps Script y devuelve la respuesta. Si hay error, lanza una excepcion.
async function llamarSheets(negocio, cuerpo) {
  const respuesta = await fetch(negocio.apps_script_url, {
    method: 'POST',
    body: JSON.stringify(cuerpo)
  })
  const datos = await respuesta.json()
  if (datos.error) throw new Error(datos.error)
  return datos
}

// Quita caracteres que danan la busqueda de Supabase (comas, parentesis, % y *)
function limpiarTexto(t) {
  return t.replace(/[,()%*]/g, ' ').trim()
}

const estiloCampo = { width: '100%', padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, marginBottom: 10, boxSizing: 'border-box' }
const estiloCaja = { background: 'white', border: '1px solid #E4E7EB', borderRadius: 10, padding: 16 }
const estiloBotonNaranja = { width: '100%', padding: 12, background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold' }

// ---------- Buscador de productos (lo usan Editar y Eliminar) ----------
// Busca por codigo o por nombre mientras se escribe, y avisa cual producto se eligio.
function Buscador({ negocio, onElegir }) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    const t = limpiarTexto(texto)
    if (t.length < 2) { setResultados([]); return }

    // Espera un momento a que la persona termine de escribir antes de buscar
    const reloj = setTimeout(async () => {
      setBuscando(true)
      const patron = '%' + t.split(/\s+/).join('%') + '%'
      const { data } = await supabase
        .from('productos')
        .select('codigo, nombre, precio_de_compra, unidad_medida, stock_minimo, stock_maximo')
        .eq('establecimiento', negocio.codigo_negocio)
        .or('codigo.ilike.' + patron + ',nombre.ilike.' + patron)
        .limit(15)
      setResultados(data || [])
      setBuscando(false)
    }, 350)

    return () => clearTimeout(reloj)
  }, [texto, negocio.codigo_negocio])

  return (
    <div>
      <input
        type="text"
        placeholder="Buscar por código o por nombre"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={estiloCampo}
      />
      {buscando && <p style={{ fontSize: 12, color: '#5B6470' }}>Buscando...</p>}
      {resultados.map((p) => (
        <div
          key={p.codigo}
          onClick={() => onElegir(p)}
          style={{ padding: 10, border: '1px solid #E4E7EB', borderRadius: 8, marginBottom: 6, cursor: 'pointer', background: 'white' }}
        >
          <div style={{ fontWeight: 'bold', fontSize: 14 }}>{p.nombre}</div>
          <div style={{ fontSize: 12, color: '#5B6470' }}>{p.codigo} · ${p.precio_de_compra}</div>
        </div>
      ))}
      {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
        <p style={{ fontSize: 12, color: '#5B6470' }}>No se encontró ningún producto.</p>
      )}
    </div>
  )
}

// ---------- CREAR ----------
function Crear({ negocio, codigoInicial, onListo }) {
  const [codigo, setCodigo] = useState(codigoInicial || '')
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [creados, setCreados] = useState([]) // los que se han creado en esta sesion

  async function crear() {
    const cod = codigo.trim()
    const nom = nombre.trim()
    const pre = leerNumero(precio)

    if (!cod) { setMensaje('Escribe el código de barras'); return }
    if (!nom) { setMensaje('Escribe el nombre del producto'); return }
    if (isNaN(pre) || pre < 0) { setMensaje('Escribe el precio de compra (0 si todavía no lo sabes)'); return }

    setGuardando(true)
    setMensaje('')

    // 1) Base de datos
    const { error } = await supabase.from('productos').insert({
      codigo: cod,
      nombre: nom,
      precio_de_compra: pre,
      establecimiento: negocio.codigo_negocio,
      codigo_padre: null
    })

    if (error) {
      // 23505 = ya existe un producto con ese codigo
      if (error.code === '23505') setMensaje('⚠️ Ese código ya existe en la lista. Búscalo en Editar.')
      else setMensaje('No se pudo crear: ' + error.message)
      setGuardando(false)
      return
    }

    // 2) Google Sheets (aparece en Bodega y Tienda)
    let aviso = ''
    try {
      await llamarSheets(negocio, { accion: 'actualizarProductos', productos: [{ codigo: cod, nombre: nom, precio: pre }] })
    } catch (e) {
      aviso = ' (Ojo: no se pudo escribir en Sheets: ' + e.message + '. Aparecerá allá cuando alguien lo cuente.)'
    }

    setCreados([{ codigo: cod, nombre: nom, precio: pre }, ...creados])
    setMensaje('✓ Creado: ' + nom + '. En los demás celulares, tocar "Actualizar lista" en Contar.' + aviso)
    setCodigo('')
    setNombre('')
    setPrecio('')
    setGuardando(false)
    if (onListo) onListo()
  }

  return (
    <div>
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Crear un producto nuevo</div>
        <input type="text" inputMode="numeric" placeholder="Código de barras" value={codigo} onChange={(e) => setCodigo(e.target.value)} style={estiloCampo} />
        <input type="text" placeholder="Nombre del producto" value={nombre} onChange={(e) => setNombre(e.target.value)} style={estiloCampo} />
        <input
          type="text"
          inputMode="decimal"
          placeholder="Precio de compra"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') crear() }}
          style={estiloCampo}
        />
        {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}
        <button onClick={crear} disabled={guardando} style={{ ...estiloBotonNaranja, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? 'Guardando...' : 'Crear producto'}
        </button>
      </div>

      {creados.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Creados en esta sesión</div>
          {creados.map((p) => (
            <div key={p.codigo} style={{ fontSize: 12, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '6px 0' }}>
              <b>{p.nombre}</b> · {p.codigo} · ${p.precio}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- EDITAR ----------
// Cambia nombre, precio, medida y stock minimo/maximo (el stock es solo para Bodega).
function Editar({ negocio }) {
  const [producto, setProducto] = useState(null) // el producto elegido
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [medida, setMedida] = useState('')
  const [stockMin, setStockMin] = useState('')
  const [stockMax, setStockMax] = useState('')
  const [tieneMov, setTieneMov] = useState(false)   // si el producto ya tiene conteos o ingresos
  const [confirmaMedida, setConfirmaMedida] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  // Al elegir un producto, llena el formulario y revisa si ya tiene movimientos
  async function elegir(p) {
    setProducto(p)
    setNombre(p.nombre)
    setPrecio(String(p.precio_de_compra))
    setMedida(p.unidad_medida || '')
    setStockMin(p.stock_minimo === null || p.stock_minimo === undefined ? '' : String(p.stock_minimo))
    setStockMax(p.stock_maximo === null || p.stock_maximo === undefined ? '' : String(p.stock_maximo))
    setConfirmaMedida(false)
    setMensaje('')

    const r1 = await supabase.from('movimientos').select('id', { count: 'exact', head: true })
      .eq('negocio', negocio.codigo_negocio).eq('codigo', p.codigo).eq('anulado', false)
    const r2 = await supabase.from('movimientos_mercancia').select('id', { count: 'exact', head: true })
      .eq('negocio', negocio.codigo_negocio).eq('codigo', p.codigo).eq('anulado', false)
    setTieneMov((r1.count || 0) + (r2.count || 0) > 0)
  }

  // Convierte el texto de un campo en numero (vacio = sin valor)
  function numeroOVacio(t) {
    const x = String(t).trim()
    if (x === '') return null
    return leerNumero(x)
  }

  async function guardar() {
    const nom = nombre.trim()
    const pre = leerNumero(precio)
    const smin = numeroOVacio(stockMin)
    const smax = numeroOVacio(stockMax)
    if (!nom) { setMensaje('El nombre no puede quedar vacío'); return }
    if (isNaN(pre) || pre < 0) { setMensaje('Escribe un precio válido'); return }
    if (Number.isNaN(smin) || Number.isNaN(smax)) { setMensaje('El stock mínimo y máximo deben ser números'); return }
    if (smin !== null && smax !== null && smin > smax) { setMensaje('El stock mínimo no puede ser mayor que el máximo'); return }

    // Aviso: cambiar la medida de un producto que ya tiene movimientos cambia el significado de sus cantidades
    const medidaCambio = (producto.unidad_medida || '') !== medida && (producto.unidad_medida || '') !== ''
    if (medidaCambio && tieneMov && !confirmaMedida) {
      setMensaje('⚠️ Este producto ya tiene conteos o ingresos en ' + producto.unidad_medida + '. Si cambias la medida a ' + (medida || 'vacía') + ', esas cantidades cambian de significado. Si estás seguro, toca "Guardar cambios" otra vez.')
      setConfirmaMedida(true)
      return
    }

    setGuardando(true)
    setMensaje('')

    // 1) Base de datos
    const { error } = await supabase
      .from('productos')
      .update({ nombre: nom, precio_de_compra: pre, unidad_medida: medida || null, stock_minimo: smin, stock_maximo: smax })
      .eq('codigo', producto.codigo)
      .eq('establecimiento', negocio.codigo_negocio)
    if (error) {
      setMensaje('No se pudo guardar: ' + error.message)
      setGuardando(false)
      return
    }

    // 2) Google Sheets (cambia nombre y costo en Bodega y Tienda)
    try {
      await llamarSheets(negocio, { accion: 'actualizarProductos', productos: [{ codigo: producto.codigo, nombre: nom, precio: pre }] })
      setMensaje('✓ Guardado en la base y en Sheets. En los demás celulares, tocar "Actualizar lista" en Contar.')
    } catch (e) {
      setMensaje('⚠️ Se guardó en la base, pero NO en Sheets (' + e.message + '). Toca Guardar otra vez para reintentar.')
    }
    setProducto({ ...producto, nombre: nom, precio_de_compra: pre, unidad_medida: medida || null, stock_minimo: smin, stock_maximo: smax })
    setConfirmaMedida(false)
    setGuardando(false)
  }

  if (!producto) {
    return (
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Editar un producto</div>
        <Buscador negocio={negocio} onElegir={elegir} />
      </div>
    )
  }

  const etiqueta = { fontSize: 12, color: '#5B6470', marginBottom: 2 }

  return (
    <div style={estiloCaja}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Editar producto</div>
      <p style={{ fontSize: 12, color: '#5B6470', marginTop: 0 }}>Código: <b>{producto.codigo}</b> (el código no se cambia)</p>

      <div style={etiqueta}>Nombre</div>
      <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} style={estiloCampo} />

      <div style={etiqueta}>Precio de compra{medida ? ' (por ' + medida + ')' : ''}</div>
      <input type="text" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} style={estiloCampo} />

      <div style={etiqueta}>Medida en la que entra y sale de bodega</div>
      <select value={medida} onChange={(e) => { setMedida(e.target.value); setConfirmaMedida(false) }} style={estiloCampo}>
        <option value="">Sin definir</option>
        {MEDIDAS.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={etiqueta}>Stock mínimo (bodega)</div>
          <input type="text" inputMode="decimal" placeholder="ej. 700" value={stockMin} onChange={(e) => setStockMin(e.target.value)} style={estiloCampo} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={etiqueta}>Stock máximo (bodega)</div>
          <input type="text" inputMode="decimal" placeholder="ej. 2000" value={stockMax} onChange={(e) => setStockMax(e.target.value)} style={estiloCampo} />
        </div>
      </div>

      {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}
      <button onClick={guardar} disabled={guardando} style={{ ...estiloBotonNaranja, opacity: guardando ? 0.6 : 1 }}>
        {guardando ? 'Guardando...' : 'Guardar cambios'}
      </button>
      <button
        onClick={() => setProducto(null)}
        style={{ width: '100%', padding: 12, marginTop: 8, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}
      >
        Buscar otro producto
      </button>
    </div>
  )
}

// ---------- ELIMINAR ----------
function Eliminar({ negocio }) {
  const [producto, setProducto] = useState(null)
  const [info, setInfo] = useState(null) // { contados: numero de envios, hijos: numero de productos amarrados }
  const [confirmando, setConfirmando] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  // Al elegir un producto, revisa si ya tiene cantidades contadas o productos amarrados
  async function elegir(p) {
    setProducto(p)
    setInfo(null)
    setConfirmando(false)
    setMensaje('')

    const r1 = await supabase
      .from('movimientos')
      .select('id', { count: 'exact', head: true })
      .eq('negocio', negocio.codigo_negocio)
      .eq('codigo', p.codigo)
      .eq('anulado', false)
    const r2 = await supabase
      .from('productos')
      .select('codigo', { count: 'exact', head: true })
      .eq('establecimiento', negocio.codigo_negocio)
      .eq('codigo_padre', p.codigo)
    setInfo({ contados: r1.count || 0, hijos: r2.count || 0 })
  }

  async function eliminar() {
    setTrabajando(true)
    setMensaje('')

    // 1) Base de datos
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('codigo', producto.codigo)
      .eq('establecimiento', negocio.codigo_negocio)
    if (error) {
      setMensaje('No se pudo eliminar: ' + error.message)
      setTrabajando(false)
      return
    }

    // 2) Google Sheets (quita la fila de Bodega y Tienda)
    let aviso = ''
    try {
      await llamarSheets(negocio, { accion: 'eliminarProducto', codigo: producto.codigo })
    } catch (e) {
      aviso = ' (Ojo: NO se pudo quitar de Sheets: ' + e.message + '. Hay que borrar esa fila a mano.)'
    }

    setMensaje('✓ Eliminado: ' + producto.nombre + '.' + aviso)
    setProducto(null)
    setInfo(null)
    setConfirmando(false)
    setTrabajando(false)
  }

  if (!producto) {
    return (
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Eliminar un producto</div>
        {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}
        <Buscador negocio={negocio} onElegir={elegir} />
      </div>
    )
  }

  return (
    <div style={estiloCaja}>
      <div style={{ fontWeight: 'bold' }}>{producto.nombre}</div>
      <div style={{ fontSize: 12, color: '#5B6470', marginBottom: 10 }}>{producto.codigo} · ${producto.precio_de_compra}</div>

      {info === null && <p style={{ fontSize: 13, color: '#5B6470' }}>Revisando...</p>}

      {info && info.contados > 0 && (
        <p style={{ fontSize: 13, color: '#DC2626' }}>
          ⚠️ Este producto ya tiene {info.contados} envío(s) contados. Si lo eliminas, también se quita su fila de Bodega y Tienda en Sheets con esas cantidades.
        </p>
      )}
      {info && info.hijos > 0 && (
        <p style={{ fontSize: 13, color: '#DC2626' }}>
          ⚠️ Tiene {info.hijos} producto(s) amarrado(s) (hijitos) que quedarían sin padre.
        </p>
      )}

      {info && !confirmando && (
        <button
          onClick={() => setConfirmando(true)}
          style={{ width: '100%', padding: 12, background: 'white', border: '1px solid #DC2626', color: '#DC2626', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Trash2 size={16} strokeWidth={1.75} /> Eliminar este producto
        </button>
      )}

      {info && confirmando && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 'bold' }}>¿Seguro? No se puede deshacer.</p>
          <button
            onClick={eliminar}
            disabled={trabajando}
            style={{ width: '100%', padding: 12, background: '#DC2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', opacity: trabajando ? 0.6 : 1 }}
          >
            {trabajando ? 'Eliminando...' : 'Sí, eliminar'}
          </button>
        </div>
      )}

      {mensaje && <p style={{ fontSize: 13, color: '#5B6470' }}>{mensaje}</p>}

      <button
        onClick={() => { setProducto(null); setInfo(null); setConfirmando(false) }}
        style={{ width: '100%', padding: 12, marginTop: 8, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}
      >
        Cancelar
      </button>
    </div>
  )
}

// ---------- Pantalla principal: los 3 botones ----------
function Productos({ negocio, codigoInicial, onListo }) {
  // Si venimos desde "Crear este producto" en Contar, abre directo en Crear
  const [modo, setModo] = useState('crear')

  const botones = [
    { id: 'crear', texto: 'Crear', Icono: Plus },
    { id: 'editar', texto: 'Editar', Icono: Pencil },
    { id: 'eliminar', texto: 'Eliminar', Icono: Trash2 }
  ]

  return (
    <div style={{ maxWidth: 500, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {botones.map((b) => (
          <button
            key={b.id}
            onClick={() => setModo(b.id)}
            style={{
              flex: 1, padding: '16px 6px', borderRadius: 12, fontWeight: 600, fontSize: 18,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              border: '1px solid ' + (modo === b.id ? '#FF6600' : '#E4E7EB'),
              background: modo === b.id ? '#FF6600' : 'white',
              color: modo === b.id ? 'white' : '#111417'
            }}
          >
            <b.Icono size={20} strokeWidth={modo === b.id ? 2.25 : 1.75} color={modo === b.id ? 'white' : '#FF6600'} />
            {b.texto}
          </button>
        ))}
      </div>

      {modo === 'crear' && <Crear negocio={negocio} codigoInicial={codigoInicial} onListo={onListo} />}
      {modo === 'editar' && <Editar negocio={negocio} />}
      {modo === 'eliminar' && <Eliminar negocio={negocio} />}
    </div>
  )
}

export default Productos
