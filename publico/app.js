// Página pública: lista de rifas abiertas y cuadrícula para separar números.
// Solo habla con Supabase a través de tres funciones (rifas_abiertas, rifa_publica,
// separar_numeros); las tablas no se pueden leer directo desde aquí.

const SUPABASE_URL = 'https://tpynlhzpdgvtppqylofg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K7mZjyDu2zfus4JpwqjwWg_0d2DLm0r';
const REFRESCO_MS = 20000;

// Datos de pago de GanaHoy y WhatsApp donde llegan los comprobantes.
const PAGO = {
  nequi: '3117241764',
  llave: '3117241764',
  whatsapp: '573117241764',
};
const POR_CENTENA = 100;

const app = document.getElementById('app');
const carrito = document.getElementById('carrito');
const formulario = document.getElementById('formulario');
const formSeparar = document.getElementById('form-separar');
const formError = document.getElementById('form-error');
const listo = document.getElementById('listo');

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const fecha = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

const ERRORES = {
  rifa_no_existe: 'Esta rifa ya no existe.',
  rifa_cerrada: 'Esta rifa ya está cerrada.',
  nombre: 'Escribe tu nombre completo.',
  whatsapp: 'Escribe un número de WhatsApp válido.',
  ciudad: 'Escribe tu ciudad.',
  sin_numeros: 'Elige al menos un número.',
  demasiados: 'Puedes separar máximo 50 números a la vez.',
  numero_invalido: 'Hay un número que no es válido.',
};

async function rpc(nombre, datos = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
}

function el(tag, attrs = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') nodo.className = v;
    else if (k.startsWith('on')) nodo.addEventListener(k.slice(2), v);
    else nodo.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) nodo.append(h);
  return nodo;
}

let toastTimer;
function toast(texto) {
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status' }, texto);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4000);
}

// Enlaces fijos por tipo (/2cifras y /3cifras) para mandar al grupo:
// siempre llevan a la rifa abierta de ese tipo, sin importar cuál sea hoy.
function tipoActual() {
  const m = location.pathname.match(/^\/([23])cifras\/?$/);
  if (m) return Number(m[1]);
  const t = new URLSearchParams(location.search).get('tipo');
  return t === '2' || t === '3' ? Number(t) : null;
}

function slugActual() {
  const m = location.pathname.match(/^\/r\/([a-z0-9-]+)\/?$/);
  if (m) return m[1];
  return new URLSearchParams(location.search).get('rifa');
}

function enlaceRifa(slug) {
  // En local (sin Vercel) no hay reescritura de /r/..., así que se usa ?rifa=
  return location.hostname === 'localhost' || location.protocol === 'file:' ? `/?rifa=${slug}` : `/r/${slug}`;
}

function rango(cifras) {
  const total = cifras === 2 ? 100 : 1000;
  return Array.from({ length: total }, (_, i) => String(i).padStart(cifras, '0'));
}

/* ---------- Piezas compartidas ---------- */

function etiquetaTipo(cifras) {
  return el('span', { class: 'etiqueta' }, cifras === 2 ? 'Números del 00 al 99' : 'Números del 000 al 999');
}

// Premio, valor y disponibles en tres casillas, y la fecha del sorteo debajo.
function datosRifa(r, cuantosDisponibles, idConteo) {
  return [
    el('div', { class: 'cifras' },
      el('div', { class: 'cifra cifra-destacada' }, el('small', {}, 'Premio'), el('strong', { title: r.premio || '' }, r.premio || '—')),
      el('div', { class: 'cifra' }, el('small', {}, 'Valor'), el('strong', {}, pesos.format(r.precio))),
      el('div', { class: 'cifra' }, el('small', {}, 'Disponibles'), el('strong', { id: idConteo }, String(cuantosDisponibles))),
    ),
    r.fecha_sorteo && el('p', { class: 'fecha' }, `Juega el ${fecha.format(new Date(r.fecha_sorteo))}`),
  ];
}

/* ---------- Lista de rifas ---------- */

async function mostrarLista(tipo = null) {
  const nombreTipo = tipo ? `Rifa de ${tipo} cifras` : 'Rifas de hoy';
  document.title = tipo ? `${nombreTipo} · GanaHoy` : 'GanaHoy';
  carrito.hidden = true;
  let rifas;
  try {
    rifas = await rpc('rifas_abiertas');
  } catch {
    app.replaceChildren(el('p', { class: 'vacio' }, 'No pudimos cargar las rifas. Revisa tu conexión y vuelve a intentar.'));
    return;
  }
  if (tipo) {
    rifas = rifas.filter((r) => r.cifras === tipo);
    // Con una sola rifa abierta de ese tipo, se entra directo a ella.
    if (rifas.length === 1) { mostrarRifa(rifas[0].slug); return; }
  }
  if (!rifas.length) {
    app.replaceChildren(el('h1', { class: 'titulo-lista' }, nombreTipo), el('p', { class: 'vacio' },
      tipo ? `No hay una rifa de ${tipo} cifras abierta en este momento.` : 'No hay rifas abiertas en este momento.'));
    return;
  }
  app.replaceChildren(
    el('h1', { class: 'titulo-lista' }, nombreTipo),
    el('div', { class: 'tarjetas' }, rifas.map((r) =>
      el('a', { class: 'tarjeta', href: enlaceRifa(r.slug) },
        etiquetaTipo(r.cifras),
        el('h2', {}, r.titulo),
        r.loteria && el('p', { class: 'loteria' }, `Lotería ${r.loteria}`),
        datosRifa(r, r.disponibles),
      ))),
  );
}

/* ---------- Una rifa ---------- */

const estado = {
  rifa: null,
  ocupados: new Set(),
  elegidos: new Set(),
  centena: 0,
  soloDisponibles: false,
  busqueda: '',
};
let refresco;

async function cargarRifa(slug) {
  const rifa = await rpc('rifa_publica', { p_slug: slug });
  if (!rifa) return null;
  // Pasada la hora del sorteo ya no se separa (el servidor también lo rechaza).
  rifa.yaJugo = Boolean(rifa.fecha_sorteo && new Date(rifa.fecha_sorteo) <= new Date());
  if (rifa.yaJugo) rifa.estado = 'cerrada';
  estado.rifa = rifa;
  estado.ocupados = new Set(rifa.ocupados.map((o) => o.n));
  // Si alguien más separó un número que yo tenía elegido, lo quito y aviso.
  const perdidos = [...estado.elegidos].filter((n) => estado.ocupados.has(n));
  if (perdidos.length) {
    perdidos.forEach((n) => estado.elegidos.delete(n));
    toast(`Alguien acaba de separar: ${perdidos.join(', ')}`);
  }
  return rifa;
}

async function mostrarRifa(slug) {
  estado.elegidos.clear();
  let rifa;
  try {
    rifa = await cargarRifa(slug);
  } catch {
    app.replaceChildren(el('p', { class: 'vacio' }, 'No pudimos cargar la rifa. Revisa tu conexión y vuelve a intentar.'));
    return;
  }
  if (!rifa) {
    app.replaceChildren(el('p', { class: 'vacio' }, 'Esta rifa no existe. ', el('a', { href: '/' }, 'Ver rifas abiertas')));
    return;
  }
  document.title = `${rifa.titulo} · GanaHoy`;
  dibujarRifa();
  clearInterval(refresco);
  refresco = setInterval(async () => {
    if (document.hidden || formulario.open) return;
    try {
      const antes = estado.rifa.estado;
      await cargarRifa(slug);
      if (estado.rifa.estado !== antes) { estado.elegidos.clear(); dibujarRifa(); return; }
      dibujarCuadricula(); dibujarCabeceraConteo(); actualizarCarrito();
    } catch { /* reintenta en el siguiente ciclo */ }
  }, REFRESCO_MS);
}

function disponibles() {
  const total = estado.rifa.cifras === 2 ? 100 : 1000;
  return total - estado.ocupados.size;
}

function dibujarCabeceraConteo() {
  const n = document.getElementById('conteo');
  if (n) n.textContent = String(disponibles());
}

function dibujarRifa() {
  const r = estado.rifa;
  const yaJugo = r.yaJugo;
  const abierta = r.estado === 'abierta';
  const tresCifras = r.cifras === 3;

  const cabecera = el('section', { class: 'rifa-cabecera' },
    etiquetaTipo(r.cifras),
    el('h1', {}, r.titulo),
    r.loteria && el('p', { class: 'loteria' }, `Lotería ${r.loteria}`),
    datosRifa(r, disponibles(), 'conteo'),
  );

  const buscar = el('input', {
    class: 'buscar', type: 'search', inputmode: 'numeric', maxlength: String(r.cifras),
    placeholder: 'Buscar número', 'aria-label': 'Buscar número',
    oninput: (e) => { estado.busqueda = e.target.value.replace(/\D/g, ''); dibujarCuadricula(); },
  });
  const solo = el('button', {
    class: 'chip', type: 'button', 'aria-pressed': String(estado.soloDisponibles),
    onclick: (e) => {
      estado.soloDisponibles = !estado.soloDisponibles;
      e.currentTarget.setAttribute('aria-pressed', String(estado.soloDisponibles));
      dibujarCuadricula();
    },
  }, 'Libres');
  const azar = abierta && el('button', { class: 'chip', type: 'button', onclick: elegirAlAzar }, 'Al azar');

  const centenas = tresCifras && el('div', { class: 'centenas', role: 'group', 'aria-label': 'Rango de números' },
    Array.from({ length: 10 }, (_, i) => el('button', {
      class: 'centena', type: 'button', 'aria-pressed': String(i === estado.centena), 'data-c': String(i),
      onclick: () => { estado.centena = i; estado.busqueda = ''; buscar.value = ''; dibujarCentenas(); dibujarCuadricula(); },
    }, `${i}00 – ${i}99`)));

  app.replaceChildren(...[
    cabecera,
    el('p', { class: 'aviso' }, abierta
      ? 'Toca los números que quieras y luego presiona «Separar».'
      : yaJugo
        ? 'Ya es la hora del sorteo: no se pueden separar más números. Pronto abre la siguiente rifa.'
        : 'Esta rifa está cerrada. Ya no se pueden separar números.'),
    el('div', { class: 'herramientas' }, buscar, solo, azar),
    centenas,
    el('div', { class: 'leyenda' },
      el('span', {}, 'Disponible'), el('span', { class: 'l-elegido' }, 'Elegido'), el('span', { class: 'l-ocupado' }, 'Ocupado')),
    el('div', { class: 'cuadricula', id: 'cuadricula' }),
  ].filter(Boolean));
  dibujarCuadricula();
  actualizarCarrito();
}

function dibujarCentenas() {
  document.querySelectorAll('.centena').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.c) === estado.centena)));
}

function numerosVisibles() {
  const r = estado.rifa;
  let lista = rango(r.cifras);
  if (estado.busqueda) {
    lista = lista.filter((n) => n.includes(estado.busqueda));
  } else if (r.cifras === 3) {
    lista = lista.slice(estado.centena * POR_CENTENA, (estado.centena + 1) * POR_CENTENA);
  }
  if (estado.soloDisponibles) lista = lista.filter((n) => !estado.ocupados.has(n));
  return lista;
}

function dibujarCuadricula() {
  const cont = document.getElementById('cuadricula');
  if (!cont) return;
  const abierta = estado.rifa.estado === 'abierta';
  const lista = numerosVisibles();
  if (!lista.length) {
    cont.replaceChildren(el('p', { class: 'vacio', style: 'grid-column:1/-1' }, 'No hay números que coincidan.'));
    return;
  }
  cont.replaceChildren(...lista.map((n) => {
    const ocupado = estado.ocupados.has(n);
    return el('button', {
      class: 'num', type: 'button',
      disabled: ocupado || !abierta,
      'aria-pressed': String(estado.elegidos.has(n)),
      'aria-label': ocupado ? `${n}, ocupado` : n,
      onclick: (e) => alternar(n, e.currentTarget),
    }, n);
  }));
}

function alternar(n, boton) {
  if (estado.elegidos.has(n)) estado.elegidos.delete(n);
  else if (estado.elegidos.size >= 50) { toast('Máximo 50 números a la vez.'); return; }
  else estado.elegidos.add(n);
  boton.setAttribute('aria-pressed', String(estado.elegidos.has(n)));
  actualizarCarrito();
}

function elegirAlAzar() {
  const libres = rango(estado.rifa.cifras).filter((n) => !estado.ocupados.has(n) && !estado.elegidos.has(n));
  if (!libres.length) { toast('No quedan números disponibles.'); return; }
  const n = libres[Math.floor(Math.random() * libres.length)];
  estado.elegidos.add(n);
  if (estado.rifa.cifras === 3) { estado.centena = Math.floor(Number(n) / POR_CENTENA); dibujarCentenas(); }
  dibujarCuadricula();
  actualizarCarrito();
  toast(`Te salió el ${n}`);
}

function ordenados() {
  return [...estado.elegidos].sort();
}

function actualizarCarrito() {
  const cuantos = estado.elegidos.size;
  carrito.hidden = cuantos === 0;
  document.getElementById('carrito-cuenta').textContent = cuantos === 1 ? '1 número' : `${cuantos} números`;
  document.getElementById('carrito-total').textContent = `${pesos.format(cuantos * estado.rifa.precio)} · ${ordenados().join(', ')}`;
}

/* ---------- Formulario ---------- */

document.getElementById('carrito-limpiar').addEventListener('click', () => {
  estado.elegidos.clear();
  dibujarCuadricula();
  actualizarCarrito();
});

function resumenFormulario() {
  document.getElementById('form-elegidos').replaceChildren(
    el('strong', {}, ordenados().join(', ')),
    ` · Total ${pesos.format(estado.elegidos.size * estado.rifa.precio)}`);
}

document.getElementById('carrito-separar').addEventListener('click', () => {
  formError.hidden = true;
  resumenFormulario();
  // Recordar los datos de la última vez en este teléfono.
  try {
    const previo = JSON.parse(localStorage.getItem('rifa-datos') || '{}');
    for (const k of ['nombre', 'whatsapp', 'ciudad']) if (previo[k] && !formSeparar[k].value) formSeparar[k].value = previo[k];
  } catch { /* sin almacenamiento, no pasa nada */ }
  formulario.showModal();
});

document.getElementById('form-cancelar').addEventListener('click', () => formulario.close());

formSeparar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    nombre: formSeparar.nombre.value.trim(),
    whatsapp: formSeparar.whatsapp.value.trim(),
    ciudad: formSeparar.ciudad.value.trim(),
  };
  const error = datos.nombre.length < 2 ? 'nombre'
    : datos.whatsapp.replace(/\D/g, '').length < 7 ? 'whatsapp'
    : datos.ciudad.length < 2 ? 'ciudad' : null;
  if (error) { mostrarError(ERRORES[error]); formSeparar[error].focus(); return; }

  const boton = document.getElementById('form-enviar');
  boton.disabled = true;
  boton.textContent = 'Separando…';
  try {
    const r = await rpc('separar_numeros', {
      p_slug: estado.rifa.slug, p_numeros: ordenados(),
      p_nombre: datos.nombre, p_whatsapp: datos.whatsapp, p_ciudad: datos.ciudad,
    });
    if (!r.ok) {
      if (r.error === 'tomados') {
        r.tomados.forEach((n) => { estado.elegidos.delete(n); estado.ocupados.add(n); });
        dibujarCuadricula();
        actualizarCarrito();
        resumenFormulario();
        mostrarError(`Alguien ya separó: ${r.tomados.join(', ')}. Los quitamos de tu lista; revisa y vuelve a intentar.`);
        if (!estado.elegidos.size) formulario.close();
      } else {
        mostrarError(ERRORES[r.error] || 'No se pudo separar. Intenta de nuevo.');
      }
      return;
    }
    try { localStorage.setItem('rifa-datos', JSON.stringify(datos)); } catch { /* opcional */ }
    formulario.close();
    mostrarListo(r, datos);
    estado.elegidos.clear();
    await cargarRifa(estado.rifa.slug);
    dibujarCuadricula();
    dibujarCabeceraConteo();
    actualizarCarrito();
  } catch {
    mostrarError('No hay conexión. Revisa tu internet y vuelve a intentar.');
  } finally {
    boton.disabled = false;
    boton.textContent = 'Separar';
  }
});

function mostrarError(texto) {
  formError.textContent = texto;
  formError.hidden = false;
}

function mostrarListo(r, datos) {
  const rifa = estado.rifa;
  document.getElementById('listo-detalle').textContent = `${datos.nombre}, estos números quedaron a tu nombre en «${rifa.titulo}»:`;
  document.getElementById('listo-numeros').replaceChildren(...r.numeros.map((n) => el('span', {}, n)));
  document.getElementById('listo-total').textContent = `Total a pagar: ${pesos.format(r.total)}`;

  // Mensaje que la persona le manda a GanaHoy por WhatsApp junto con su comprobante.
  const mensaje = [
    '¡Perfecto! Mis números quedaron separados ✅',
    '',
    `*${rifa.titulo}*${rifa.loteria ? ` · Lotería ${rifa.loteria}` : ''}`,
    `Números: *${r.numeros.join(', ')}*`,
    `Nombre: ${datos.nombre}`,
    `Total: ${pesos.format(r.total)}`,
    '',
    'Te comparto mi comprobante de pago 👇',
  ].join('\n');
  document.getElementById('listo-whatsapp').href = `https://wa.me/${PAGO.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  listo.showModal();
}

document.querySelectorAll('[data-pago]').forEach((n) => { n.textContent = PAGO[n.dataset.pago]; });
document.querySelectorAll('[data-copiar]').forEach((b) => b.addEventListener('click', async () => {
  const valor = PAGO[b.dataset.copiar];
  try { await navigator.clipboard.writeText(valor); } catch { /* sin portapapeles: el número igual está a la vista */ }
  b.textContent = 'Copiado';
  setTimeout(() => { b.textContent = 'Copiar'; }, 2000);
}));

document.getElementById('listo-cerrar').addEventListener('click', () => listo.close());

/* ---------- Arranque ---------- */

const tipo = tipoActual();
const slug = slugActual();
if (tipo) {
  // Que el logo lleve de vuelta a este mismo tipo, no a la lista general.
  document.querySelector('.marca').href = location.pathname + location.search;
  mostrarLista(tipo);
} else if (slug) mostrarRifa(slug);
else mostrarLista();
