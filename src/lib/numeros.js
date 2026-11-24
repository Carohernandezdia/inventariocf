// =====================================================================
// Lee numeros escritos "a la colombiana".
//   15.000   -> 15000   (el punto separa los miles)
//   1.250.000-> 1250000
//   2,5      -> 2.5     (la coma es el decimal)
//   2.5      -> 2.5     (un punto con 1 o 2 decimales tambien es decimal)
//   0.125    -> 0.125   (si empieza por 0, el punto es decimal)
// Devuelve NaN si no es un numero.
// =====================================================================
export function leerNumero(texto) {
  let t = String(texto === undefined || texto === null ? '' : texto).trim().replace(/\s/g, '').replace('$', '')
  if (t === '') return NaN

  if (t.indexOf(',') >= 0) {
    // Con coma: la coma es el decimal y los puntos son miles
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t) && !/^0\./.test(t)) {
    // Solo puntos en grupos de 3 digitos (15.000 / 1.250.000): son miles
    t = t.replace(/\./g, '')
  }
  const n = Number(t)
  return isNaN(n) ? NaN : n
}
