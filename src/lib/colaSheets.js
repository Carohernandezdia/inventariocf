// =====================================================================
// Cola de envios a Google Sheets.
// Cada escaneo se guarda primero en Supabase (rapido) y su envio a Sheets queda en esta
// cola dentro del celular. Se manda en segundo plano y, si falla, se reintenta solo.
// Asi la pantalla no se queda esperando a Google y no se pierde ningun escaneo.
// =====================================================================

const clave = (negocio) => 'cola-sheets-' + negocio

// Genera un identificador unico (con alternativa para celulares viejos)
export function nuevoUuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Avisa a la app que la cola cambio (para mostrar cuantos envios faltan)
function avisarCambio() {
  window.dispatchEvent(new Event('cola-sheets'))
}

function leerCola(negocio) {
  try {
    return JSON.parse(localStorage.getItem(clave(negocio)) || '[]')
  } catch (e) {
    return []
  }
}

function guardarCola(negocio, cola) {
  localStorage.setItem(clave(negocio), JSON.stringify(cola))
}

export function contarPendientes(negocio) {
  return leerCola(negocio).length
}

// Agrega un envio pendiente al final de la cola
export function encolar(negocio, payload) {
  const cola = leerCola(negocio)
  cola.push(payload)
  guardarCola(negocio, cola)
  avisarCambio()
}

// Borra todo lo pendiente (se usa al vaciar el inventario)
export function limpiarCola(negocio) {
  localStorage.removeItem(clave(negocio))
  avisarCambio()
}

let procesando = false // evita que dos envios corran al mismo tiempo en este celular

// Manda los pendientes de uno en uno. Si uno falla, se detiene y se reintenta mas tarde.
export async function procesarCola(negocio, url) {
  if (procesando) return
  procesando = true
  try {
    while (true) {
      const cola = leerCola(negocio)
      if (cola.length === 0) break

      let enviado = false
      try {
        const respuesta = await fetch(url, { method: 'POST', body: JSON.stringify(cola[0]) })
        const datos = await respuesta.json()
        enviado = !datos.error
        if (datos.error) console.warn('Sheets respondio con error:', datos.error)
      } catch (e) {
        enviado = false // sin internet o Google tardo: se reintenta despues
      }
      if (!enviado) break

      // Quita el que ya se envio (los nuevos que lleguen mientras tanto se conservan)
      guardarCola(negocio, leerCola(negocio).slice(1))
      avisarCambio()
    }
  } finally {
    procesando = false
  }
}
