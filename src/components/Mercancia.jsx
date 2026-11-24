// =====================================================================
// Pantalla "Mercancia" (solo admin): Ingresar, Sacar y Reportar mercancia.
// El Google Sheets NO se toca desde aqui: solo se pone al dia al preparar un inventario nuevo.
// REGLA: todo entra y sale en la MEDIDA del producto (unidad, libra, caja...). Una sola medida por producto.
// =====================================================================
import { useState, useEffect, useRef } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MEDIDAS } from '../lib/medidas'
import { leerNumero } from '../lib/numeros'

const estiloCampo = { width: '100%', padding: 12, border: '1px solid #E4E7EB', borderRadius: 8, fontSize: 16, marginBottom: 10, boxSizing: 'border-box' }
const estiloCaja = { background: 'white', border: '1px solid #E4E7EB', borderRadius: 10, padding: 16 }
const estiloNaranja = { width: '100%', padding: 12, background: '#FF6600', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold' }

function plata(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
}

// ---------------------------------------------------------------------
// INGRESAR: entra mercancia a Bodega
// ---------------------------------------------------------------------
function Ingresar({ negocio, nombreUsuario }) {
  const [codigo, setCodigo] = useState('')
  const [producto, setProducto] = useState(null)      // producto encontrado
  const [medida, setMedida] = useState('')            // medida elegida (si el producto no tenia)
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [nota, setNota] = useState('')
  const [ayuda, setAyuda] = useState(false)           // abre/cierra la ayuda de conversion
  const [aPaquetes, setAPaquetes] = useState('')      // ayuda: cuantos paquetes/cajas llegaron
  const [aPorPaquete, setAPorPaquete] = useState('')  // ayuda: cuantas unidades trae cada uno
  const [aPrecioPaquete, setAPrecioPaquete] = useState('') // ayuda: precio de cada paquete
  const [aIva, setAIva] = useState('')              // ayuda: % de IVA (ej. 19)
  const [aImpo, setAImpo] = useState('')            // ayuda: % de impoconsumo (ej. 8)
  const [aOtros, setAOtros] = useState('')          // ayuda: otro % (opcional)
  const [aMensaje, setAMensaje] = useState('')       // resultado o error de la ayuda
  const [confirmarCosto, setConfirmarCosto] = useState(false) // alerta de costo muy distinto
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [recientes, setRecientes] = useState([])
  const refCodigo = useRef(null)
  const refCantidad = useRef(null)

  // Carga los ultimos ingresos al abrir la pantalla
  async function cargarRecientes() {
    const { data } = await supabase
      .from('movimientos_mercancia')
      .select('id, nombre, cantidad, unidad_medida, costo, usuario, creado_en')
      .eq('negocio', negocio.codigo_negocio)
      .eq('tipo', 'ingreso')
      .eq('anulado', false)
      .order('creado_en', { ascending: false })
      .limit(10)
    setRecientes(data || [])
  }
  useEffect(() => { cargarRecientes() }, [])

  // Busca el producto por codigo exacto (la pistola escribe el codigo y manda Enter)
  async function buscar() {
    const cod = codigo.trim()
    if (!cod) return
    setMensaje('')
    const { data, error } = await supabase
      .from('productos')
      .select('codigo, nombre, precio_de_compra, unidad_medida')
      .eq('establecimiento', negocio.codigo_negocio)
      .eq('codigo', cod)
      .maybeSingle()
    if (error) { setMensaje('Error buscando: ' + error.message); return }
    if (!data) {
      setProducto(null)
      setMensaje('⚠️ Ese código no existe en la lista. Créalo primero en la pantalla Productos.')
      return
    }
    setProducto(data)
    setMedida(data.unidad_medida || '')
    setCosto(String(data.precio_de_compra || ''))
    setCantidad('')
    setNota('')
    setConfirmarCosto(false)
    setAyuda(false)
    setTimeout(() => refCantidad.current && refCantidad.current.focus(), 50)
  }

  // Ayuda de conversion:
  //   cantidad = cajas x unidades por caja
  //   costo por unidad = (precio de la caja / unidades por caja) + impuestos (IVA + impoconsumo + otros, en %)
  // Los porcentajes se SUMAN al precio de la factura (se asume que el precio de la factura viene sin impuestos).
  function aplicarAyuda() {
    const n = leerNumero(aPaquetes)
    const m = leerNumero(aPorPaquete)
    const p = leerNumero(aPrecioPaquete)
    const iva = aIva.trim() === '' ? 0 : leerNumero(aIva)
    const impo = aImpo.trim() === '' ? 0 : leerNumero(aImpo)
    const otros = aOtros.trim() === '' ? 0 : leerNumero(aOtros)

    if (!(m > 0)) { setAMensaje('⚠️ Escribe cuántas unidades trae cada caja o paquete'); return }
    if (isNaN(iva) || isNaN(impo) || isNaN(otros)) { setAMensaje('⚠️ Los porcentajes deben ser números (ej. 19)'); return }

    const partes = []
    if (n > 0) {
      setCantidad(String(Math.round(n * m * 1000) / 1000))
      partes.push('Cantidad: ' + (n * m).toLocaleString('es-CO') + ' unidades')
    }
    if (p > 0) {
      const base = p / m
      const conImpuestos = base * (1 + (iva + impo + otros) / 100)
      const redondeado = Math.round(conImpuestos * 100) / 100
      setCosto(String(redondeado))
      partes.push('Costo por unidad: ' + plata(redondeado) + (iva + impo + otros > 0 ? ' (con ' + (iva + impo + otros) + '% de impuestos)' : ''))
    }
    if (partes.length === 0) { setAMensaje('⚠️ Escribe cuántas cajas llegaron y/o el precio de cada caja'); return }

    setConfirmarCosto(false)
    setMensaje('')
    setAMensaje('✓ ' + partes.join(' · ') + '. Ya quedó en los campos de arriba.')
  }

  function limpiar() {
    setCodigo('')
    setProducto(null)
    setMedida('')
    setCantidad('')
    setCosto('')
    setNota('')
    setConfirmarCosto(false)
    setAMensaje('')
    setTimeout(() => refCodigo.current && refCodigo.current.focus(), 50)
  }

  async function guardar() {
    const cant = leerNumero(cantidad)
    const cos = leerNumero(costo)
    if (!medida) { setMensaje('Elige por cuál medida ingresa este producto'); return }
    if (!(cant > 0)) { setMensaje('Escribe la cantidad (mayor que cero)'); return }
    if (isNaN(cos) || cos < 0) { setMensaje('Escribe el costo por ' + medida); return }

    // Alerta: si el costo cambia muchisimo, casi seguro pusieron el precio de la caja en vez del de la unidad
    const anterior = Number(producto.precio_de_compra) || 0
    if (anterior > 0 && !confirmarCosto) {
      const razon = cos / anterior
      if (razon > 1.5 || razon < 0.5) {
        setMensaje('⚠️ El costo anterior era ' + plata(anterior) + ' y ahora pusiste ' + plata(cos) + ' por ' + medida + '. ¿Es el precio de UNA ' + medida + '? Si es correcto, toca "Sí, guardar".')
        setConfirmarCosto(true)
        return
      }
    }

    setGuardando(true)
    setMensaje('')

    // 1) Registra el ingreso
    const r = await supabase.from('movimientos_mercancia').insert({
      negocio: negocio.codigo_negocio,
      tipo: 'ingreso',
      usuario: nombreUsuario,
      codigo: producto.codigo,
      nombre: producto.nombre,
      cantidad: cant,
      unidad_medida: medida,
      costo: cos,
      destino: 'Bodega',
      nota: nota.trim() || null
    })
    if (r.error) { setMensaje('No se pudo guardar: ' + r.error.message); setGuardando(false); return }

    // 2) El producto queda con su medida y con el costo nuevo.
    //    OJO: aqui NO se escribe nada en Google Sheets. El Sheets solo se actualiza cuando se use "Preparar nuevo inventario".
    const r2 = await supabase
      .from('productos')
      .update({ unidad_medida: medida, precio_de_compra: cos })
      .eq('codigo', producto.codigo)
      .eq('establecimiento', negocio.codigo_negocio)
    let aviso = ''
    if (r2.error) aviso = ' (No se pudo actualizar el costo del producto: ' + r2.error.message + ')'

    setMensaje('✓ Ingresaron ' + cant + ' ' + medida + ' de ' + producto.nombre + ' a Bodega.' + aviso)
    cargarRecientes()
    limpiar()
    setGuardando(false)
  }

  // Anula un ingreso (no lo borra, queda marcado como anulado)
  async function anular(id) {
    if (!confirm('¿Anular este ingreso? (No cambia el costo del producto.)')) return
    const r = await supabase.from('movimientos_mercancia').update({ anulado: true }).eq('id', id)
    if (r.error) { setMensaje('No se pudo anular: ' + r.error.message); return }
    cargarRecientes()
  }

  return (
    <div>
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Ingresar mercancía a Bodega</div>

        <input
          ref={refCodigo}
          autoFocus
          type="text"
          inputMode="numeric"
          placeholder="Código de barras (lee con la pistola y Enter)"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
          style={estiloCampo}
        />
        {!producto && (
          <button onClick={buscar} style={{ ...estiloNaranja, marginBottom: 8 }}>Buscar</button>
        )}

        {producto && (
          <div>
            <div style={{ padding: 10, background: '#F7F8FA', borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 'bold' }}>{producto.nombre}</div>
              <div style={{ fontSize: 12, color: '#5B6470' }}>
                {producto.codigo} · costo actual {plata(producto.precio_de_compra)}
                {producto.unidad_medida ? ' por ' + producto.unidad_medida : ' (todavía sin medida definida)'}
              </div>
            </div>

            {/* Medida: si el producto no la tiene, se elige ahora y queda guardada */}
            {!producto.unidad_medida && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>¿Este producto ingresa por?</div>
                <select value={medida} onChange={(e) => setMedida(e.target.value)} style={estiloCampo}>
                  <option value="">Elige una medida...</option>
                  {MEDIDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            <input
              ref={refCantidad}
              type="text"
              inputMode="decimal"
              placeholder={'Cantidad' + (medida ? ' (en ' + medida + ')' : '')}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              style={estiloCampo}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder={'Costo por ' + (medida || 'medida')}
              value={costo}
              onChange={(e) => { setCosto(e.target.value); setConfirmarCosto(false) }}
              style={estiloCampo}
            />
            <input type="text" placeholder="Nota (opcional, ej. número de factura)" value={nota} onChange={(e) => setNota(e.target.value)} style={estiloCampo} />

            {/* Ayuda para convertir cajas/paquetes a la medida del producto */}
            <div style={{ marginBottom: 10 }}>
              <span onClick={() => setAyuda(!ayuda)} style={{ fontSize: 13, color: '#FF6600', cursor: 'pointer' }}>
                {ayuda ? '▼' : '▶'} Ayuda: llegó en cajas o paquetes
              </span>
              {ayuda && (
                <div style={{ marginTop: 8, padding: 10, border: '1px dashed #E4E7EB', borderRadius: 8 }}>
                  <input type="text" inputMode="decimal" placeholder="¿Cuántas cajas/paquetes llegaron?" value={aPaquetes} onChange={(e) => setAPaquetes(e.target.value)} style={estiloCampo} />
                  <input type="text" inputMode="decimal" placeholder="¿Cuántas unidades (o libras...) trae cada una?" value={aPorPaquete} onChange={(e) => setAPorPaquete(e.target.value)} style={estiloCampo} />
                  <input type="text" inputMode="decimal" placeholder="Precio de cada caja/paquete (de la factura)" value={aPrecioPaquete} onChange={(e) => setAPrecioPaquete(e.target.value)} style={estiloCampo} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" inputMode="decimal" placeholder="IVA %" value={aIva} onChange={(e) => setAIva(e.target.value)} style={{ ...estiloCampo, flex: 1 }} />
                    <input type="text" inputMode="decimal" placeholder="Impoconsumo %" value={aImpo} onChange={(e) => setAImpo(e.target.value)} style={{ ...estiloCampo, flex: 1 }} />
                    <input type="text" inputMode="decimal" placeholder="Otros %" value={aOtros} onChange={(e) => setAOtros(e.target.value)} style={{ ...estiloCampo, flex: 1 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#5B6470', marginBottom: 8 }}>
                    Los porcentajes son opcionales y se suman al precio de la factura (ej. IVA 19). "Otros" sirve para flete, transporte u otro costo extra. Déjalos vacíos si el precio ya los incluye.
                  </div>
                  <button onClick={aplicarAyuda} style={{ width: '100%', padding: 10, background: 'white', border: '1px solid #FF6600', color: '#FF6600', borderRadius: 8 }}>
                    Calcular cantidad y costo por unidad
                  </button>
                  {aMensaje && (
                    <p style={{ fontSize: 13, marginBottom: 0, color: aMensaje.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{aMensaje}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {mensaje && <p style={{ fontSize: 13, color: mensaje.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{mensaje}</p>}

        {producto && (
          <div>
            <button onClick={guardar} disabled={guardando} style={{ ...estiloNaranja, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : confirmarCosto ? 'Sí, guardar' : 'Guardar ingreso'}
            </button>
            <button onClick={limpiar} style={{ width: '100%', padding: 12, marginTop: 8, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {recientes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Últimos ingresos</div>
          {recientes.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '6px 0' }}>
              <span>
                <b>{m.nombre}</b> · {m.cantidad} {m.unidad_medida} · {plata(m.costo)} · {m.usuario} · {new Date(m.creado_en).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span onClick={() => anular(m.id)} style={{ color: '#DC2626', cursor: 'pointer' }}>Anular</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// SACAR: sale mercancia de Bodega (por defecto va a Tienda)
// ---------------------------------------------------------------------
const DESTINOS = ['Tienda', 'Préstamo', 'Daño o vencido', 'Devolución al proveedor', 'Otro']

// Saldo de Bodega de un producto = inventario inicial + ingresos - salidas (solo lo que esta registrado en el sistema)
async function saldoBodega(negocio, codigo) {
  const { data, error } = await supabase
    .from('movimientos_mercancia')
    .select('tipo, origen, destino, cantidad')
    .eq('negocio', negocio.codigo_negocio)
    .eq('codigo', codigo)
    .eq('anulado', false)
  if (error) return null
  let saldo = 0
  data.forEach((m) => {
    const c = Number(m.cantidad) || 0
    if (m.destino === 'Bodega') saldo += c
    if (m.origen === 'Bodega') saldo -= c
  })
  return saldo
}

function Sacar({ negocio, nombreUsuario }) {
  const [codigo, setCodigo] = useState('')
  const [producto, setProducto] = useState(null)
  const [saldo, setSaldo] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [destino, setDestino] = useState('Tienda')
  const [nota, setNota] = useState('')
  const [ayuda, setAyuda] = useState(false)
  const [aPaquetes, setAPaquetes] = useState('')
  const [aPorPaquete, setAPorPaquete] = useState('')
  const [aMensaje, setAMensaje] = useState('')
  const [confirmarSaldo, setConfirmarSaldo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [recientes, setRecientes] = useState([])
  const refCodigo = useRef(null)
  const refCantidad = useRef(null)

  async function cargarRecientes() {
    const { data } = await supabase
      .from('movimientos_mercancia')
      .select('id, nombre, cantidad, unidad_medida, destino, usuario, creado_en')
      .eq('negocio', negocio.codigo_negocio)
      .eq('tipo', 'salida')
      .eq('anulado', false)
      .order('creado_en', { ascending: false })
      .limit(10)
    setRecientes(data || [])
  }
  useEffect(() => { cargarRecientes() }, [])

  async function buscar() {
    const cod = codigo.trim()
    if (!cod) return
    setMensaje('')
    const { data, error } = await supabase
      .from('productos')
      .select('codigo, nombre, precio_de_compra, unidad_medida')
      .eq('establecimiento', negocio.codigo_negocio)
      .eq('codigo', cod)
      .maybeSingle()
    if (error) { setMensaje('Error buscando: ' + error.message); return }
    if (!data) { setProducto(null); setMensaje('⚠️ Ese código no existe en la lista. Créalo primero en Productos.'); return }
    setProducto(data)
    setSaldo(await saldoBodega(negocio, data.codigo))
    setCantidad('')
    setNota('')
    setDestino('Tienda')
    setConfirmarSaldo(false)
    setAyuda(false)
    setAMensaje('')
    setTimeout(() => refCantidad.current && refCantidad.current.focus(), 50)
  }

  // Ayuda: cajas (o arrobas...) x lo que trae cada una = cantidad en la medida del producto
  function aplicarAyuda() {
    const n = leerNumero(aPaquetes)
    const m = leerNumero(aPorPaquete)
    if (!(n > 0) || !(m > 0)) { setAMensaje('⚠️ Escribe cuántas cajas salen y cuánto trae cada una'); return }
    setCantidad(String(Math.round(n * m * 1000) / 1000))
    setConfirmarSaldo(false)
    setAMensaje('✓ ' + n + ' x ' + m + ' = ' + (n * m).toLocaleString('es-CO') + '. Ya quedó en la cantidad de arriba.')
  }

  function limpiar() {
    setCodigo('')
    setProducto(null)
    setSaldo(null)
    setCantidad('')
    setNota('')
    setDestino('Tienda')
    setConfirmarSaldo(false)
    setAMensaje('')
    setTimeout(() => refCodigo.current && refCodigo.current.focus(), 50)
  }

  async function guardar() {
    const cant = leerNumero(cantidad)
    if (!(cant > 0)) { setMensaje('Escribe la cantidad (mayor que cero)'); return }
    if (destino === 'Otro' && !nota.trim()) { setMensaje('Cuando el destino es "Otro", escribe una nota explicando a dónde va'); return }

    // Aviso: sale mas de lo que el sistema tiene registrado en bodega
    if (saldo !== null && cant > saldo && !confirmarSaldo) {
      setMensaje('⚠️ En Bodega hay registrados ' + saldo + ' ' + (producto.unidad_medida || '') + ' y vas a sacar ' + cant + '. Puede que falte registrar un ingreso. Si estás seguro, toca "Sí, sacar".')
      setConfirmarSaldo(true)
      return
    }

    setGuardando(true)
    setMensaje('')
    const r = await supabase.from('movimientos_mercancia').insert({
      negocio: negocio.codigo_negocio,
      tipo: 'salida',
      usuario: nombreUsuario,
      codigo: producto.codigo,
      nombre: producto.nombre,
      cantidad: cant,
      unidad_medida: producto.unidad_medida,
      origen: 'Bodega',
      destino: destino,
      nota: nota.trim() || null
    })
    if (r.error) { setMensaje('No se pudo guardar: ' + r.error.message); setGuardando(false); return }

    setMensaje('✓ Salieron ' + cant + ' ' + (producto.unidad_medida || '') + ' de ' + producto.nombre + ' de Bodega hacia ' + destino + '.')
    cargarRecientes()
    limpiar()
    setGuardando(false)
  }

  async function anular(id) {
    if (!confirm('¿Anular esta salida?')) return
    const r = await supabase.from('movimientos_mercancia').update({ anulado: true }).eq('id', id)
    if (r.error) { setMensaje('No se pudo anular: ' + r.error.message); return }
    cargarRecientes()
  }

  const medida = producto && producto.unidad_medida ? producto.unidad_medida : ''

  return (
    <div>
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Sacar mercancía de Bodega</div>

        <input
          ref={refCodigo}
          autoFocus
          type="text"
          inputMode="numeric"
          placeholder="Código de barras (lee con la pistola y Enter)"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
          style={estiloCampo}
        />
        {!producto && <button onClick={buscar} style={{ ...estiloNaranja, marginBottom: 8 }}>Buscar</button>}

        {producto && (
          <div>
            <div style={{ padding: 10, background: '#F7F8FA', borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 'bold' }}>{producto.nombre}</div>
              <div style={{ fontSize: 12, color: '#5B6470' }}>
                {producto.codigo} · se saca por {medida ? medida.toUpperCase() : 'medida sin definir'}
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                En Bodega hay registrados: <b>{saldo === null ? '?' : saldo}</b> {medida}
              </div>
              <div style={{ fontSize: 11, color: '#5B6470' }}>(según los ingresos y salidas anotados en el sistema)</div>
            </div>

            <input
              ref={refCantidad}
              type="text"
              inputMode="decimal"
              placeholder={'Cantidad que sale' + (medida ? ' (en ' + medida + ')' : '')}
              value={cantidad}
              onChange={(e) => { setCantidad(e.target.value); setConfirmarSaldo(false) }}
              style={estiloCampo}
            />

            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>¿Para dónde va?</div>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} style={estiloCampo}>
              {DESTINOS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <input type="text" placeholder={destino === 'Otro' ? 'Nota (obligatoria): a dónde va' : 'Nota (opcional)'} value={nota} onChange={(e) => setNota(e.target.value)} style={estiloCampo} />

            <div style={{ marginBottom: 10 }}>
              <span onClick={() => setAyuda(!ayuda)} style={{ fontSize: 13, color: '#FF6600', cursor: 'pointer' }}>
                {ayuda ? '▼' : '▶'} Ayuda: bajan cajas, arrobas o paquetes
              </span>
              {ayuda && (
                <div style={{ marginTop: 8, padding: 10, border: '1px dashed #E4E7EB', borderRadius: 8 }}>
                  <input type="text" inputMode="decimal" placeholder="¿Cuántas cajas/arrobas/paquetes bajan?" value={aPaquetes} onChange={(e) => setAPaquetes(e.target.value)} style={estiloCampo} />
                  <input type="text" inputMode="decimal" placeholder={'¿Cuánto trae cada una' + (medida ? ' (en ' + medida + ')' : '') + '?'} value={aPorPaquete} onChange={(e) => setAPorPaquete(e.target.value)} style={estiloCampo} />
                  <button onClick={aplicarAyuda} style={{ width: '100%', padding: 10, background: 'white', border: '1px solid #FF6600', color: '#FF6600', borderRadius: 8 }}>
                    Calcular cantidad
                  </button>
                  {aMensaje && <p style={{ fontSize: 13, marginBottom: 0, color: aMensaje.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{aMensaje}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {mensaje && <p style={{ fontSize: 13, color: mensaje.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{mensaje}</p>}

        {producto && (
          <div>
            <button onClick={guardar} disabled={guardando} style={{ ...estiloNaranja, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : confirmarSaldo ? 'Sí, sacar' : 'Guardar salida'}
            </button>
            <button onClick={limpiar} style={{ width: '100%', padding: 12, marginTop: 8, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {recientes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Últimas salidas</div>
          {recientes.map((m) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '6px 0' }}>
              <span>
                <b>{m.nombre}</b> · {m.cantidad} {m.unidad_medida} → {m.destino} · {m.usuario} · {new Date(m.creado_en).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span onClick={() => anular(m.id)} style={{ color: '#DC2626', cursor: 'pointer' }}>Anular</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// REPORTAR: avisar de mercancia vencida, por vencerse, para devolver, danada u otro.
// Un reporte NO cambia el saldo: es un aviso. Si la mercancia sale de bodega, se registra aparte en Sacar.
// ---------------------------------------------------------------------
const TIPOS_REPORTE = {
  vencida: 'Vencida',
  por_vencerse: 'Por vencerse',
  devolver: 'Para devolver al proveedor',
  danada: 'Dañada o en mal estado',
  otro: 'Otro'
}

function Reportar({ negocio, nombreUsuario }) {
  const [codigo, setCodigo] = useState('')
  const [producto, setProducto] = useState(null)
  const [tipo, setTipo] = useState('por_vencerse')
  const [ubicacion, setUbicacion] = useState('Bodega')
  const [cantidad, setCantidad] = useState('')
  const [fecha, setFecha] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [pendientes, setPendientes] = useState([])
  const refCodigo = useRef(null)

  async function cargarPendientes() {
    const { data } = await supabase
      .from('reportes_mercancia')
      .select('id, nombre, cantidad, unidad_medida, tipo, ubicacion, fecha_vencimiento, nota, usuario, creado_en')
      .eq('negocio', negocio.codigo_negocio)
      .eq('anulado', false)
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: false })
      .limit(30)
    setPendientes(data || [])
  }
  useEffect(() => { cargarPendientes() }, [])

  async function buscar() {
    const cod = codigo.trim()
    if (!cod) return
    setMensaje('')
    const { data, error } = await supabase
      .from('productos')
      .select('codigo, nombre, unidad_medida')
      .eq('establecimiento', negocio.codigo_negocio)
      .eq('codigo', cod)
      .maybeSingle()
    if (error) { setMensaje('Error buscando: ' + error.message); return }
    if (!data) { setProducto(null); setMensaje('⚠️ Ese código no existe en la lista.'); return }
    setProducto(data)
  }

  function limpiar() {
    setCodigo('')
    setProducto(null)
    setCantidad('')
    setFecha('')
    setNota('')
    setTimeout(() => refCodigo.current && refCodigo.current.focus(), 50)
  }

  async function guardar() {
    const cant = leerNumero(cantidad)
    if (!(cant > 0)) { setMensaje('Escribe cuánta mercancía es (mayor que cero)'); return }
    if (tipo === 'otro' && !nota.trim()) { setMensaje('Cuando el tipo es "Otro", escribe una nota explicando el reporte'); return }

    setGuardando(true)
    setMensaje('')
    const r = await supabase.from('reportes_mercancia').insert({
      negocio: negocio.codigo_negocio,
      usuario: nombreUsuario,
      codigo: producto.codigo,
      nombre: producto.nombre,
      cantidad: cant,
      unidad_medida: producto.unidad_medida,
      tipo: tipo,
      ubicacion: ubicacion,
      fecha_vencimiento: fecha || null,
      nota: nota.trim() || null
    })
    if (r.error) { setMensaje('No se pudo guardar: ' + r.error.message); setGuardando(false); return }

    setMensaje('✓ Reporte guardado: ' + TIPOS_REPORTE[tipo] + ' · ' + producto.nombre)
    cargarPendientes()
    limpiar()
    setGuardando(false)
  }

  // Marca un reporte como resuelto (ya se devolvio, ya se saco, etc.)
  async function resolver(id) {
    const r = await supabase.from('reportes_mercancia').update({ estado: 'resuelto', resuelto_en: new Date().toISOString() }).eq('id', id)
    if (r.error) { setMensaje('No se pudo marcar: ' + r.error.message); return }
    cargarPendientes()
  }

  async function anular(id) {
    if (!confirm('¿Anular este reporte? (se hizo por error)')) return
    const r = await supabase.from('reportes_mercancia').update({ anulado: true }).eq('id', id)
    if (r.error) { setMensaje('No se pudo anular: ' + r.error.message); return }
    cargarPendientes()
  }

  const medida = producto && producto.unidad_medida ? producto.unidad_medida : ''
  const pideFecha = tipo === 'por_vencerse' || tipo === 'vencida'

  return (
    <div>
      <div style={estiloCaja}>
        <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Reportar mercancía</div>

        <input
          ref={refCodigo}
          type="text"
          inputMode="numeric"
          placeholder="Código de barras (lee con la pistola y Enter)"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}
          style={estiloCampo}
        />
        {!producto && <button onClick={buscar} style={{ ...estiloNaranja, marginBottom: 8 }}>Buscar</button>}

        {producto && (
          <div>
            <div style={{ padding: 10, background: '#F7F8FA', borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontWeight: 'bold' }}>{producto.nombre}</div>
              <div style={{ fontSize: 12, color: '#5B6470' }}>{producto.codigo}{medida ? ' · medida: ' + medida : ''}</div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>¿Qué quieres reportar?</div>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={estiloCampo}>
              {Object.keys(TIPOS_REPORTE).map((k) => <option key={k} value={k}>{TIPOS_REPORTE[k]}</option>)}
            </select>

            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>¿Dónde está?</div>
            <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} style={estiloCampo}>
              <option value="Bodega">Bodega</option>
              <option value="Tienda">Tienda</option>
            </select>

            <input
              type="text"
              inputMode="decimal"
              placeholder={'Cuánta mercancía es' + (medida ? ' (en ' + medida + ')' : '')}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              style={estiloCampo}
            />

            {pideFecha && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Fecha de vencimiento (opcional)</div>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={estiloCampo} />
              </div>
            )}

            <input type="text" placeholder={tipo === 'otro' ? 'Nota (obligatoria)' : 'Nota (opcional)'} value={nota} onChange={(e) => setNota(e.target.value)} style={estiloCampo} />
          </div>
        )}

        {mensaje && <p style={{ fontSize: 13, color: mensaje.startsWith('✓') ? '#16A34A' : '#DC2626' }}>{mensaje}</p>}

        {producto && (
          <div>
            <button onClick={guardar} disabled={guardando} style={{ ...estiloNaranja, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando...' : 'Guardar reporte'}
            </button>
            <button onClick={limpiar} style={{ width: '100%', padding: 12, marginTop: 8, background: 'white', border: '1px solid #E4E7EB', borderRadius: 8 }}>
              Cancelar
            </button>
          </div>
        )}
      </div>

      {pendientes.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>Reportes pendientes ({pendientes.length})</div>
          {pendientes.map((m) => (
            <div key={m.id} style={{ fontSize: 12, color: '#5B6470', borderBottom: '1px dashed #E4E7EB', padding: '6px 0' }}>
              <div>
                <b>{m.nombre}</b> · {TIPOS_REPORTE[m.tipo] || m.tipo} · {m.cantidad} {m.unidad_medida} · {m.ubicacion}
                {m.fecha_vencimiento ? ' · vence ' + m.fecha_vencimiento : ''}
              </div>
              {m.nota && <div>Nota: {m.nota}</div>}
              <div>
                {m.usuario} · {new Date(m.creado_en).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · '}
                <span onClick={() => resolver(m.id)} style={{ color: '#16A34A', cursor: 'pointer' }}>Marcar resuelto</span>
                {' · '}
                <span onClick={() => anular(m.id)} style={{ color: '#DC2626', cursor: 'pointer' }}>Anular</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Pantalla principal: dos botones grandes, Ingresar y Sacar
// ---------------------------------------------------------------------
function Mercancia({ negocio, nombreUsuario }) {
  const [modo, setModo] = useState('ingresar')

  const botones = [
    { id: 'ingresar', texto: 'Ingresar', Icono: ArrowDownToLine },
    { id: 'sacar', texto: 'Sacar', Icono: ArrowUpFromLine },
    { id: 'reportar', texto: 'Reportar', Icono: AlertTriangle }
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

      {modo === 'ingresar' && <Ingresar negocio={negocio} nombreUsuario={nombreUsuario} />}
      {modo === 'sacar' && <Sacar negocio={negocio} nombreUsuario={nombreUsuario} />}
      {modo === 'reportar' && <Reportar negocio={negocio} nombreUsuario={nombreUsuario} />}
    </div>
  )
}

export default Mercancia
