// =====================================================================
// Respaldo del Google Sheets: baja a un Excel las hojas Bodega, Tienda y Log
// (lo que contaron los muchachos y lo que hay en cada seccion), sin tener que ir al Sheets.
// Le pide los datos al Apps Script (accion exportarTodo).
// =====================================================================
import * as XLSX from 'xlsx'

export async function descargarRespaldoSheets(negocio, avisar) {
  const decir = avisar || function () {}
  decir('Pidiendo los datos al Google Sheets...')

  const respuesta = await fetch(negocio.apps_script_url, {
    method: 'POST',
    body: JSON.stringify({ accion: 'exportarTodo' })
  })
  const datos = await respuesta.json()
  if (datos.error) throw new Error(datos.error)
  if (!datos.hojas) throw new Error('El Apps Script no entendió la petición (falta publicar la versión nueva)')

  decir('Armando el Excel...')
  const libro = XLSX.utils.book_new()
  const nombres = ['Bodega', 'Tienda', 'Log']
  let filas = 0
  nombres.forEach((n) => {
    const valores = datos.hojas[n] && datos.hojas[n].length > 0 ? datos.hojas[n] : [['(vacía)']]
    filas += Math.max(0, valores.length - 1)
    const ws = XLSX.utils.aoa_to_sheet(valores)
    ws['!cols'] = [{ wch: 20 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(libro, ws, n)
  })

  const hoy = new Date()
  const archivo = 'respaldo-sheets-' + negocio.codigo_negocio + '-' + hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0') + '.xlsx'
  XLSX.writeFile(libro, archivo)
  return { archivo, filas }
}
