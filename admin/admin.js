// Panel de administración de Winday.
// Entra con correo y contraseña (Supabase Auth); solo los correos de la tabla
// `admins` ven datos: las políticas de la base bloquean a cualquier otro.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://tpynlhzpdgvtppqylofg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_K7mZjyDu2zfus4JpwqjwWg_0d2DLm0r';
const SITIO_PUBLICO = 'https://rifa-diaria.vercel.app';
const REFRESCO_MS = 30000;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = document.getElementById('app');
const dlg = document.getElementById('dlg');
const botonSalir = document.getElementById('salir');

const pesos = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const zona = 'America/Bogota';
const fechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: zona });
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: zona });
const fechaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: zona });

const ERRORES = {
  rifa_no_existe: 'Esa rifa ya no existe.',
  rifa_cerrada: 'Esa rifa ya está cerrada.',
  nombre: 'Escribe el nombre del cliente.',
  whatsapp: 'Escribe un WhatsApp válido.',
  sin_numeros: 'Escribe al menos un número.',
  numero_invalido: 'Hay un número que no corresponde a esta rifa.',
};

/* ---------- Utilidades ---------- */

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
  toastTimer = setTimeout(() => t.remove(), 3500);
}

function soloDigitos(v) { return String(v ?? '').replace(/\D/g, ''); }

// Enlace de WhatsApp: los celulares colombianos (10 dígitos que empiezan por 3) llevan el 57.
function enlaceWhatsapp(numero, texto) {
  let n = soloDigitos(numero);
  if (n.length === 10 && n.startsWith('3')) n = `57${n}`;
  return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

function telefonoBonito(numero) {
  const n = soloDigitos(numero);
  return n.length === 10 ? `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : n;
}

// datetime-local trabaja en la hora del navegador (Colombia para Juan).
function aInputFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nombreRifa(r) {
  return r.titulo || (r.cifras === 2 ? 'Rifa de dos cifras' : 'Rifa de tres cifras');
}

function enlacePublico(r) {
  return `${SITIO_PUBLICO}/${r.cifras}cifras`;
}

function parsearNumeros(texto, cifras) {
  const encontrados = String(texto).match(/\d+/g) || [];
  return [...new Set(encontrados.map((n) => n.padStart(cifras, '0')))];
}

async function ok(promesa) {
  const { data, error } = await promesa;
  if (error) throw error;
  return data;
}

function abrirVentana(...contenido) {
  dlg.replaceChildren(...contenido.flat().filter(Boolean));
  if (!dlg.open) dlg.showModal();
}
function cerrarVentana() { if (dlg.open) dlg.close(); }
function cabeceraVentana(titulo, sub) {
  return el('div', { class: 'ventana-cab' },
    el('div', {}, el('h2', {}, titulo), sub && el('p', {}, sub)),
    el('button', { class: 'cerrar', type: 'button', 'aria-label': 'Cerrar', onclick: cerrarVentana }, '×'));
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) cerrarVentana(); });

/* ---------- Estado ---------- */

const estado = {
  rifas: [],
  rifaId: null,
  verHistorial: false,
  vista: 'clientes',
  filtro: 'todos',
  busqueda: '',
  centena: 0,
  clientes: [],
  boletas: [],
};
let refresco;

function rifaActual() { return estado.rifas.find((r) => r.id === estado.rifaId); }

/* ---------- Ingreso ---------- */

function mostrarIngreso(modo = 'entrar', mensaje = '') {
  botonSalir.hidden = true;
  const crear = modo === 'crear';
  const error = el('p', { class: 'error', hidden: !mensaje }, mensaje);
  const form = el('form', { class: 'ingreso', novalidate: true },
    el('h1', {}, crear ? 'Crear cuenta' : 'Entrar al panel'),
    el('p', { class: 'ayuda' }, crear ? 'Solo una vez. Después alguien con acceso debe activarla.' : 'Solo para administradores de Winday.'),
    el('label', { class: 'campo' }, 'Correo', el('input', { name: 'correo', type: 'email', autocomplete: 'email', required: true })),
    el('label', { class: 'campo' }, 'Contraseña',
      el('input', { name: 'clave', type: 'password', autocomplete: crear ? 'new-password' : 'current-password', required: true, minlength: '8' })),
    error,
    el('button', { class: 'boton', type: 'submit' }, crear ? 'Crear cuenta' : 'Entrar'),
    el('button', { class: 'enlace', type: 'button', onclick: () => mostrarIngreso(crear ? 'entrar' : 'crear') },
      crear ? 'Ya tengo cuenta' : 'Crear cuenta nueva'),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = form.correo.value.trim().toLowerCase();
    const clave = form.clave.value;
    if (!correo || clave.length < 8) {
      error.textContent = 'Escribe tu correo y una contraseña de al menos 8 caracteres.';
      error.hidden = false;
      return;
    }
    const boton = form.querySelector('.boton');
    boton.disabled = true;
    try {
      if (crear) {
        const { data, error: err } = await sb.auth.signUp({ email: correo, password: clave });
        if (err) throw err;
        if (!data.session) {
          mostrarIngreso('entrar', 'Cuenta creada. Pide que la activen y luego entra con tu correo y contraseña.');
          return;
        }
      } else {
        const { error: err } = await sb.auth.signInWithPassword({ email: correo, password: clave });
        if (err) throw err;
      }
      await arrancar();
    } catch (err) {
      const msg = String(err?.message || '');
      error.textContent = /invalid login/i.test(msg) ? 'Correo o contraseña incorrectos.'
        : /not confirmed/i.test(msg) ? 'Tu cuenta todavía no está activada.'
        : /already registered/i.test(msg) ? 'Ese correo ya tiene cuenta. Entra con él.'
        : 'No se pudo. Revisa los datos e intenta de nuevo.';
      error.hidden = false;
    } finally {
      boton.disabled = false;
    }
  });
  app.replaceChildren(form);
}

botonSalir.addEventListener('click', async () => {
  clearInterval(refresco);
  await sb.auth.signOut();
  mostrarIngreso();
});

async function arrancar() {
  const { data } = await sb.auth.getSession();
  if (!data.session) { mostrarIngreso(); return; }
  botonSalir.hidden = false;
  const esAdmin = await ok(sb.rpc('es_admin')).catch(() => false);
  if (!esAdmin) {
    app.replaceChildren(el('div', { class: 'ingreso' },
      el('h1', {}, 'Sin acceso todavía'),
      el('p', { class: 'ayuda' }, `La cuenta ${data.session.user.email} aún no tiene permiso para ver el panel.`)));
    return;
  }
  await cargarRifas();
  clearInterval(refresco);
  refresco = setInterval(() => {
    if (document.hidden || dlg.open) return;
    recargar().catch(() => {});
  }, REFRESCO_MS);
}

/* ---------- Datos ---------- */

async function cargarRifas() {
  estado.rifas = await ok(sb.from('rifas_admin').select('*')
    .order('estado', { ascending: true })
    .order('fecha_sorteo', { ascending: false, nullsFirst: false }));
  const abiertas = estado.rifas.filter((r) => r.estado === 'abierta');
  if (!estado.verHistorial && !rifaActual()) estado.rifaId = abiertas[0]?.id ?? null;
  await mostrarPanel();
}

async function cargarRifa() {
  const id = estado.rifaId;
  if (!id) { estado.clientes = []; estado.boletas = []; return; }
  const [clientes, boletas] = await Promise.all([
    ok(sb.from('clientes_rifa').select('*').eq('rifa_id', id)),
    ok(sb.from('boletas').select('id, numero, whatsapp, nombre').eq('rifa_id', id).order('numero').limit(1000)),
  ]);
  estado.clientes = clientes;
  estado.boletas = boletas;
}

async function recargar() {
  estado.rifas = await ok(sb.from('rifas_admin').select('*')
    .order('estado', { ascending: true })
    .order('fecha_sorteo', { ascending: false, nullsFirst: false }));
  await mostrarPanel();
}

/* ---------- Panel ---------- */

async function mostrarPanel() {
  const abiertas = estado.rifas.filter((r) => r.estado === 'abierta')
    .sort((a, b) => a.cifras - b.cifras || new Date(a.fecha_sorteo) - new Date(b.fecha_sorteo));

  const nav = el('nav', { class: 'rifas-nav', 'aria-label': 'Rifas' },
    abiertas.map((r) => el('button', {
      class: 'pestana', type: 'button', 'aria-pressed': String(!estado.verHistorial && r.id === estado.rifaId),
      onclick: () => { estado.verHistorial = false; estado.rifaId = r.id; estado.centena = 0; mostrarPanel(); },
    }, el('strong', {}, `${r.cifras} cifras`), el('small', {}, r.fecha_sorteo ? fechaCorta.format(new Date(r.fecha_sorteo)) : 'Sin fecha'))),
    el('button', {
      class: 'pestana', type: 'button', 'aria-pressed': String(estado.verHistorial),
      onclick: () => { estado.verHistorial = true; mostrarPanel(); },
    }, el('strong', {}, 'Historial'), el('small', {}, 'Cerradas')),
  );

  if (estado.verHistorial) {
    app.replaceChildren(nav, vistaHistorial());
    return;
  }
  const r = rifaActual();
  if (!r) {
    app.replaceChildren(nav, el('p', { class: 'vacio' }, 'No hay rifas abiertas.'),
      el('button', { class: 'boton boton-lima boton-ancho', type: 'button', onclick: () => ventanaRifa(null) }, '+ Nueva rifa'));
    return;
  }
  await cargarRifa();
  app.replaceChildren(nav, vistaRifa(r));
}

function totalesRifa(r) {
  const clientes = estado.clientes;
  const recaudado = clientes.reduce((s, c) => s + c.abonado, 0);
  const porCobrar = clientes.reduce((s, c) => s + Math.max(c.saldo, 0), 0);
  const deben = clientes.filter((c) => c.saldo > 0).length;
  const capacidad = r.cifras === 2 ? 100 : 1000;
  const vendidos = estado.boletas.length;
  const numerosPagos = clientes.filter((c) => c.cantidad > 0 && c.saldo <= 0).reduce((s, c) => s + c.cantidad, 0);
  return { recaudado, porCobrar, deben, capacidad, vendidos, numerosPagos, clientes: clientes.filter((c) => c.cantidad > 0).length };
}

function vistaRifa(r) {
  const abierta = r.estado === 'abierta';
  const t = totalesRifa(r);
  const porcentaje = Math.round((t.vendidos / t.capacidad) * 100);

  const cab = el('section', { class: 'rifa-cab' },
    el('span', { class: `insignia ${abierta ? 'insignia-abierta' : ''}` }, abierta ? 'Abierta' : 'Cerrada'),
    el('h1', {}, nombreRifa(r)),
    r.loteria && el('p', { class: 'loteria' }, `Lotería ${r.loteria}`),
    el('p', {}, r.fecha_sorteo ? `Juega el ${fechaLarga.format(new Date(r.fecha_sorteo))}` : 'Sin fecha de sorteo'),
    el('p', {}, `Valor ${pesos.format(r.precio)}`, r.premio && ` · Premio ${r.premio}`),
    r.numero_ganador && el('p', { class: 'ganador-linea' },
      `Ganó el ${r.numero_ganador} · ${r.ganador_nombre || 'nadie lo tenía'}`),
  );

  const acciones = el('section', { class: 'acciones' },
    abierta && el('button', { class: 'boton boton-lima boton-ancho', type: 'button', onclick: () => ventanaRegistrar() }, '+ Registrar boleta'),
    el('div', { class: 'acciones-sec' },
      abierta && el('button', {
        class: 'enlace', type: 'button',
        onclick: async () => {
          try { await navigator.clipboard.writeText(enlacePublico(r)); toast('Enlace copiado'); } catch { toast(enlacePublico(r)); }
        },
      }, 'Copiar enlace'),
      el('button', { class: 'enlace', type: 'button', onclick: () => ventanaRifa(r) }, 'Editar'),
      el('button', { class: 'enlace', type: 'button', onclick: () => ventanaRifa(null) }, 'Nueva rifa'),
      abierta && el('button', { class: 'enlace enlace-fuerte', type: 'button', onclick: () => ventanaReiniciar(r) }, 'Cerrar y reiniciar'),
    ),
  );

  const totales = el('section', { class: 'totales' },
    el('div', { class: 'total' }, el('small', {}, 'Recaudado'), el('strong', {}, pesos.format(t.recaudado))),
    el('div', { class: 'total total-debe' }, el('small', {}, 'Por cobrar'), el('strong', {}, pesos.format(t.porCobrar))),
    el('div', { class: 'ocupacion' },
      el('div', { class: 'barra-progreso' }, el('i', { style: `width:${porcentaje}%` })),
      el('p', {}, `${t.vendidos} de ${t.capacidad} números ocupados · ${t.capacidad - t.vendidos} libres`)),
  );

  const vistas = el('div', { class: 'vistas', role: 'group' },
    ['clientes', 'numeros'].map((v) => el('button', {
      class: 'vista', type: 'button', 'aria-pressed': String(estado.vista === v),
      onclick: () => { estado.vista = v; mostrarPanel(); },
    }, v === 'clientes' ? 'Clientes' : 'Números')));

  return el('div', {}, cab, acciones, totales, el('div', { class: 'centro' }, vistas),
    estado.vista === 'clientes' ? vistaClientes(r) : vistaNumeros(r));
}

/* ---------- Clientes ---------- */

function estadoCliente(c) {
  if (c.cantidad === 0 && c.abonado > 0) return { clase: 'insignia-favor', texto: `Devolver ${pesos.format(c.abonado)}` };
  if (c.saldo > 0) return { clase: 'insignia-debe', texto: `Debe ${pesos.format(c.saldo)}` };
  if (c.saldo < 0) return { clase: 'insignia-favor', texto: `A favor ${pesos.format(-c.saldo)}` };
  return { clase: 'insignia-pago', texto: 'Pagado' };
}

function vistaClientes(r) {
  const lista = el('div', { class: 'clientes' });
  const buscar = el('input', {
    class: 'buscar', type: 'search', placeholder: 'Buscar nombre, número o teléfono', value: estado.busqueda,
    oninput: (e) => { estado.busqueda = e.target.value; pintar(); },
  });
  const filtros = el('div', { class: 'filtros' }, buscar,
    [['todos', 'Todos'], ['deben', 'Por pagar'], ['pagados', 'Pagados']].map(([k, texto]) => el('button', {
      class: 'chip', type: 'button', 'aria-pressed': String(estado.filtro === k),
      onclick: (e) => {
        estado.filtro = k;
        filtros.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        pintar();
      },
    }, texto)));

  function pintar() {
    const q = estado.busqueda.trim().toLowerCase();
    const qDig = soloDigitos(q);
    let clientes = [...estado.clientes];
    if (estado.filtro === 'deben') clientes = clientes.filter((c) => c.saldo > 0);
    if (estado.filtro === 'pagados') clientes = clientes.filter((c) => c.cantidad > 0 && c.saldo <= 0);
    if (q) {
      clientes = clientes.filter((c) => (c.nombre || '').toLowerCase().includes(q)
        || (qDig && (c.whatsapp.includes(qDig) || c.numeros.some((n) => n === qDig.padStart(r.cifras, '0')))));
    }
    // Primero los que deben (más saldo arriba), luego los pagados por nombre.
    clientes.sort((a, b) => (b.saldo > 0) - (a.saldo > 0) || b.saldo - a.saldo || (a.nombre || '').localeCompare(b.nombre || ''));
    if (!clientes.length) {
      lista.replaceChildren(el('p', { class: 'vacio' }, estado.clientes.length ? 'Nadie coincide con la búsqueda.' : 'Todavía nadie ha separado números.'));
      return;
    }
    lista.replaceChildren(...clientes.map((c) => {
      const est = estadoCliente(c);
      return el('button', { class: 'cliente', type: 'button', onclick: () => ventanaCliente(c.whatsapp) },
        el('h3', {}, c.nombre || 'Sin números'),
        el('p', { class: 'cliente-sub' }, [c.ciudad, telefonoBonito(c.whatsapp)].filter(Boolean).join(' · ')),
        c.numeros.length > 0 && el('div', { class: 'numeros' },
          c.numeros.map((n) => el('span', { class: n === r.numero_ganador ? 'ganador' : '' }, n))),
        el('span', { class: `insignia ${est.clase}` }, est.texto),
      );
    }));
  }
  pintar();
  return el('div', {}, filtros, lista);
}

/* ---------- Números ---------- */

function vistaNumeros(r) {
  const porNumero = new Map(estado.boletas.map((b) => [b.numero, b]));
  const saldoPorCliente = new Map(estado.clientes.map((c) => [c.whatsapp, c.saldo]));
  const todos = Array.from({ length: r.cifras === 2 ? 100 : 1000 }, (_, i) => String(i).padStart(r.cifras, '0'));
  const visibles = r.cifras === 3 ? todos.slice(estado.centena * 100, estado.centena * 100 + 100) : todos;
  const abierta = r.estado === 'abierta';

  const centenas = r.cifras === 3 && el('div', { class: 'centenas' },
    Array.from({ length: 10 }, (_, i) => {
      const ocupados = todos.slice(i * 100, i * 100 + 100).filter((n) => porNumero.has(n)).length;
      return el('button', {
        class: 'centena', type: 'button', 'aria-pressed': String(i === estado.centena),
        onclick: () => { estado.centena = i; mostrarPanel(); },
      }, `${i}00 · ${ocupados}`);
    }));

  return el('div', {},
    el('div', { class: 'leyenda' },
      el('span', {}, 'Libre'), el('span', { class: 'l-separado' }, 'Separado (debe)'), el('span', { class: 'l-pagado' }, 'Pagado')),
    centenas,
    el('div', { class: 'cuadricula' }, visibles.map((n) => {
      const b = porNumero.get(n);
      const pagado = b && (saldoPorCliente.get(b.whatsapp) ?? 1) <= 0;
      const clase = ['num', b && (pagado ? 'num-pagado' : 'num-separado'), n === r.numero_ganador && 'num-ganador'].filter(Boolean).join(' ');
      return el('button', {
        class: clase, type: 'button', title: b ? `${b.nombre}` : 'Libre',
        onclick: () => { if (b) ventanaCliente(b.whatsapp); else if (abierta) ventanaRegistrar({ numeros: [n] }); },
      }, n);
    })),
  );
}

/* ---------- Ventana de un cliente: números, abonos y saldo ---------- */

async function ventanaCliente(whatsapp) {
  const r = rifaActual();
  const c = estado.clientes.find((x) => x.whatsapp === whatsapp);
  if (!r || !c) return;
  const abierta = r.estado === 'abierta';
  let abonos = [];
  try {
    abonos = await ok(sb.from('abonos').select('*').eq('rifa_id', r.id).eq('whatsapp', whatsapp).order('created_at'));
  } catch { toast('No se pudieron cargar los abonos.'); }

  const saldo = Math.max(c.saldo, 0);
  const monto = el('input', { name: 'monto', inputmode: 'numeric', placeholder: '0', value: saldo ? String(saldo) : '' });
  const nota = el('input', { name: 'nota', maxlength: '200', placeholder: 'Ej: Nequi, Bancolombia…' });
  const error = el('p', { class: 'error', hidden: true });

  async function abonar(valor) {
    const v = Number(soloDigitos(valor));
    if (!v) { error.textContent = 'Escribe el valor del abono.'; error.hidden = false; return; }
    try {
      await ok(sb.from('abonos').insert({ rifa_id: r.id, whatsapp, monto: v, nota: nota.value.trim() || null }));
      toast(`Abono de ${pesos.format(v)} registrado`);
      await refrescarYReabrir(whatsapp);
    } catch { error.textContent = 'No se pudo guardar el abono.'; error.hidden = false; }
  }

  const mensaje = `Hola ${c.nombre || ''}, tus números en ${nombreRifa(r)} son: ${c.numeros.join(', ')}. `
    + (c.saldo > 0 ? `Total ${pesos.format(c.total)}, abonado ${pesos.format(c.abonado)}, te falta ${pesos.format(c.saldo)}.` : '¡Ya están pagos! Mucha suerte.');

  abrirVentana(
    cabeceraVentana(c.nombre || 'Cliente', [c.ciudad, telefonoBonito(whatsapp)].filter(Boolean).join(' · ')),
    el('div', { class: 'saldo-grande' },
      el('div', {}, el('small', {}, 'Total'), el('strong', {}, pesos.format(c.total))),
      el('div', {}, el('small', {}, 'Abonado'), el('strong', {}, pesos.format(c.abonado))),
      el('div', { class: c.saldo > 0 ? 'debe' : '' }, el('small', {}, c.saldo < 0 ? 'A favor' : 'Falta'), el('strong', {}, pesos.format(Math.abs(c.saldo))))),

    el('div', { class: 'seccion' },
      el('h3', {}, 'Registrar abono'),
      el('div', { class: 'abonar' },
        el('label', { class: 'campo' }, 'Valor', monto),
        c.saldo > 0 && el('button', { class: 'boton boton-suave', type: 'button', onclick: () => abonar(c.saldo) }, 'Pagó todo')),
      el('label', { class: 'campo' }, 'Nota (opcional)', nota),
      error,
      el('div', { class: 'pie' }, el('button', { class: 'boton boton-lima', type: 'button', onclick: () => abonar(monto.value) }, 'Guardar abono')),
    ),

    el('div', { class: 'seccion' },
      el('h3', {}, `Números (${c.numeros.length})`),
      c.numeros.length
        ? el('div', { class: 'numeros' }, c.numeros.map((n) => abierta
          ? el('button', { class: 'liberar', type: 'button', title: `Liberar ${n}`, onclick: () => liberar(n, whatsapp) }, n)
          : el('span', { class: n === r.numero_ganador ? 'ganador' : '' }, n)))
        : el('p', { class: 'ayuda' }, 'No tiene números.'),
      abierta && el('p', { class: 'ayuda' }, 'Toca un número para liberarlo.'),
      abierta && el('div', { class: 'pie' },
        el('button', {
          class: 'boton boton-suave', type: 'button',
          onclick: () => ventanaRegistrar({ nombre: c.nombre, whatsapp, ciudad: c.ciudad }),
        }, '+ Agregar números')),
    ),

    el('div', { class: 'seccion' },
      el('h3', {}, 'Abonos'),
      abonos.length
        ? el('ul', { class: 'abonos' }, abonos.map((a) => el('li', {},
          el('div', {}, el('strong', {}, pesos.format(a.monto)),
            el('small', {}, [fechaHora.format(new Date(a.created_at)), a.nota].filter(Boolean).join(' · '))),
          el('button', { class: 'quitar', type: 'button', 'aria-label': 'Borrar abono', title: 'Borrar abono', onclick: () => borrarAbono(a, whatsapp) }, '×'))))
        : el('p', { class: 'ayuda' }, 'Todavía no ha abonado.'),
    ),

    el('div', { class: 'pie' },
      el('a', { class: 'boton boton-suave', href: enlaceWhatsapp(whatsapp, mensaje), target: '_blank', rel: 'noopener' }, 'Escribir por WhatsApp')),
  );
}

async function refrescarYReabrir(whatsapp) {
  await recargar();
  if (estado.clientes.some((c) => c.whatsapp === whatsapp)) await ventanaCliente(whatsapp);
  else cerrarVentana();
}

async function liberar(numero, whatsapp) {
  if (!confirm(`¿Liberar el número ${numero}? Vuelve a quedar disponible para cualquiera.`)) return;
  try {
    await ok(sb.from('boletas').delete().eq('rifa_id', estado.rifaId).eq('numero', numero));
    toast(`Número ${numero} liberado`);
    await refrescarYReabrir(whatsapp);
  } catch { toast('No se pudo liberar el número.'); }
}

async function borrarAbono(abono, whatsapp) {
  if (!confirm(`¿Borrar el abono de ${pesos.format(abono.monto)}?`)) return;
  try {
    await ok(sb.from('abonos').delete().eq('id', abono.id));
    toast('Abono borrado');
    await refrescarYReabrir(whatsapp);
  } catch { toast('No se pudo borrar el abono.'); }
}

/* ---------- Registrar boleta desde el panel ---------- */

function ventanaRegistrar(previo = {}) {
  const r = rifaActual();
  if (!r) return;
  const form = el('form', { novalidate: true },
    cabeceraVentana('Registrar boleta', `${nombreRifa(r)} · ${pesos.format(r.precio)} cada número`),
    el('label', { class: 'campo' }, 'Números',
      el('input', { name: 'numeros', inputmode: 'numeric', placeholder: r.cifras === 2 ? 'Ej: 07, 21, 45' : 'Ej: 007, 150, 999', value: (previo.numeros || []).join(', ') })),
    el('p', { class: 'ayuda' }, 'Sepáralos con coma o espacio.'),
    el('label', { class: 'campo' }, 'Nombre', el('input', { name: 'nombre', autocomplete: 'off', value: previo.nombre || '' })),
    el('div', { class: 'fila' },
      el('label', { class: 'campo' }, 'WhatsApp', el('input', { name: 'whatsapp', type: 'tel', inputmode: 'tel', value: previo.whatsapp || '' })),
      el('label', { class: 'campo' }, 'Ciudad', el('input', { name: 'ciudad', value: previo.ciudad || '' }))),
    el('label', { class: 'check' }, el('input', { name: 'pagado', type: 'checkbox' }), 'Ya pagó todo'),
    el('p', { class: 'error', hidden: true }),
    el('div', { class: 'pie' },
      el('button', { class: 'boton boton-suave', type: 'button', onclick: cerrarVentana }, 'Cancelar'),
      el('button', { class: 'boton boton-lima', type: 'submit' }, 'Registrar')),
  );
  const error = form.querySelector('.error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const numeros = parsearNumeros(form.numeros.value, r.cifras);
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      const res = await ok(sb.rpc('admin_registrar_boletas', {
        p_rifa_id: r.id, p_numeros: numeros, p_nombre: form.nombre.value, p_whatsapp: form.whatsapp.value,
        p_ciudad: form.ciudad.value, p_pagado: form.pagado.checked,
      }));
      if (!res.ok) {
        error.textContent = res.error === 'tomados' ? `Ya están ocupados: ${res.tomados.join(', ')}.` : (ERRORES[res.error] || 'No se pudo registrar.');
        error.hidden = false;
        return;
      }
      toast(`Registrados: ${res.numeros.join(', ')}`);
      cerrarVentana();
      await recargar();
    } catch { error.textContent = 'No se pudo registrar. Revisa la conexión.'; error.hidden = false; }
    finally { boton.disabled = false; }
  });
  abrirVentana(form);
  form.numeros.focus();
}

/* ---------- Crear o editar una rifa ---------- */

function ventanaRifa(r) {
  const nueva = !r;
  const form = el('form', { novalidate: true },
    cabeceraVentana(nueva ? 'Nueva rifa' : 'Editar rifa', nueva ? 'Queda abierta apenas la guardes.' : nombreRifa(r)),
    nueva && el('label', { class: 'campo' }, 'Tipo',
      el('select', { name: 'cifras' },
        el('option', { value: '2' }, 'Dos cifras (00 al 99)'),
        el('option', { value: '3' }, 'Tres cifras (000 al 999)'))),
    el('label', { class: 'campo' }, 'Título', el('input', { name: 'titulo', maxlength: '120', value: r?.titulo || '', placeholder: 'Rifa de dos cifras' })),
    el('label', { class: 'campo' }, 'Lotería', el('input', { name: 'loteria', maxlength: '80', value: r?.loteria ?? 'Chontico Día' })),
    el('div', { class: 'fila' },
      el('label', { class: 'campo' }, 'Valor del número', el('input', { name: 'precio', inputmode: 'numeric', value: r ? String(r.precio) : '' })),
      el('label', { class: 'campo' }, 'Premio', el('input', { name: 'premio', maxlength: '60', value: r?.premio || '', placeholder: '$200.000' }))),
    el('label', { class: 'campo' }, 'Fecha y hora del sorteo', el('input', { name: 'fecha', type: 'datetime-local', value: aInputFecha(r?.fecha_sorteo) })),
    el('p', { class: 'ayuda' }, 'A esa hora la página deja de recibir separaciones.'),
    el('p', { class: 'error', hidden: true }),
    el('div', { class: 'pie' },
      el('button', { class: 'boton boton-suave', type: 'button', onclick: cerrarVentana }, 'Cancelar'),
      el('button', { class: 'boton boton-lima', type: 'submit' }, nueva ? 'Crear rifa' : 'Guardar')),
  );
  const error = form.querySelector('.error');
  if (nueva) {
    const sugerir = () => { if (!form.titulo.dataset.tocado) form.titulo.value = form.cifras.value === '2' ? 'Rifa de dos cifras' : 'Rifa de tres cifras'; };
    form.titulo.addEventListener('input', () => { form.titulo.dataset.tocado = '1'; });
    form.cifras.addEventListener('change', sugerir);
    sugerir();
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
      titulo: form.titulo.value.trim(),
      loteria: form.loteria.value.trim() || null,
      precio: Number(soloDigitos(form.precio.value)),
      premio: form.premio.value.trim() || null,
      fecha_sorteo: form.fecha.value ? new Date(form.fecha.value).toISOString() : null,
    };
    if (!datos.titulo) { error.textContent = 'Escribe un título.'; error.hidden = false; return; }
    if (!datos.precio) { error.textContent = 'Escribe el valor de cada número.'; error.hidden = false; return; }
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      if (nueva) {
        const creada = await ok(sb.from('rifas').insert({ ...datos, cifras: Number(form.cifras.value) }).select('id').single());
        estado.rifaId = creada.id;
        estado.verHistorial = false;
        toast('Rifa creada');
      } else {
        await ok(sb.from('rifas').update(datos).eq('id', r.id));
        toast('Cambios guardados');
      }
      cerrarVentana();
      await recargar();
    } catch { error.textContent = 'No se pudo guardar.'; error.hidden = false; }
    finally { boton.disabled = false; }
  });
  abrirVentana(form);
}

/* ---------- Cerrar y reiniciar ---------- */

function ventanaReiniciar(r) {
  const porNumero = new Map(estado.boletas.map((b) => [b.numero, b]));
  const quien = el('div', { class: 'aviso-ganador', hidden: true });
  const form = el('form', { novalidate: true },
    cabeceraVentana('Cerrar y reiniciar', nombreRifa(r)),
    el('label', { class: 'campo' }, 'Número ganador',
      el('input', { name: 'ganador', inputmode: 'numeric', maxlength: String(r.cifras), placeholder: r.cifras === 2 ? '00' : '000', autocomplete: 'off' })),
    quien,
    el('p', { class: 'ayuda' },
      'Esta rifa pasa al historial con todos sus clientes y abonos (nada se borra). ',
      'Se abre una rifa nueva igual, para el siguiente día a la misma hora, con todos los números libres. ',
      'Los enlaces de 2 y 3 cifras pasan solos a la nueva.'),
    el('p', { class: 'error', hidden: true }),
    el('div', { class: 'pie' },
      el('button', { class: 'boton boton-suave', type: 'button', onclick: cerrarVentana }, 'Cancelar'),
      el('button', { class: 'boton', type: 'submit' }, 'Cerrar y reiniciar')),
  );
  const error = form.querySelector('.error');
  form.ganador.addEventListener('input', () => {
    const v = soloDigitos(form.ganador.value);
    if (v.length !== r.cifras) { quien.hidden = true; return; }
    const b = porNumero.get(v);
    quien.textContent = b ? `El ${v} lo tiene ${b.nombre} (${telefonoBonito(b.whatsapp)}).` : `Nadie tenía el ${v}.`;
    quien.hidden = false;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ganador = soloDigitos(form.ganador.value);
    if (ganador && ganador.length !== r.cifras) { error.textContent = `El número debe tener ${r.cifras} cifras.`; error.hidden = false; return; }
    if (!ganador && !confirm('No escribiste número ganador. ¿Cerrar la rifa sin ganador?')) return;
    const boton = form.querySelector('[type=submit]');
    boton.disabled = true;
    try {
      const res = await ok(sb.rpc('admin_reiniciar_rifa', { p_rifa_id: r.id, p_numero_ganador: ganador || null }));
      if (!res.ok) { error.textContent = ERRORES[res.error] || 'No se pudo cerrar.'; error.hidden = false; return; }
      estado.rifaId = res.nueva_id;
      toast('Rifa cerrada. La nueva ya está abierta.');
      cerrarVentana();
      await recargar();
    } catch { error.textContent = 'No se pudo cerrar. Revisa la conexión.'; error.hidden = false; }
    finally { boton.disabled = false; }
  });
  abrirVentana(form);
  form.ganador.focus();
}

/* ---------- Historial ---------- */

function vistaHistorial() {
  const cerradas = estado.rifas.filter((r) => r.estado === 'cerrada')
    .sort((a, b) => new Date(b.fecha_sorteo || b.cerrada_at) - new Date(a.fecha_sorteo || a.cerrada_at));
  if (!cerradas.length) return el('p', { class: 'vacio' }, 'Aquí aparecen las rifas que cierres con «Cerrar y reiniciar».');
  return el('div', { class: 'historial' }, cerradas.map((r) => el('button', {
    class: 'cliente', type: 'button',
    onclick: () => { estado.verHistorial = false; estado.rifaId = r.id; estado.vista = 'clientes'; mostrarPanelCerrada(); },
  },
  el('h3', {}, nombreRifa(r)),
  el('p', { class: 'cliente-sub' }, [r.loteria && `Lotería ${r.loteria}`, r.fecha_sorteo && fechaLarga.format(new Date(r.fecha_sorteo))].filter(Boolean).join(' · ')),
  el('span', { class: 'insignia insignia-abierta' },
    r.numero_ganador ? `Ganó el ${r.numero_ganador} · ${r.ganador_nombre || 'nadie lo tenía'}` : 'Sin ganador'),
  el('p', { class: 'cliente-sub' }, `${r.vendidos} números vendidos · ${pesos.format(r.recaudado)} recaudado`),
  )));
}

// Una rifa cerrada se ve igual que una abierta, pero sin registrar ni liberar;
// los abonos sí se pueden seguir anotando (hay quien paga después del sorteo).
async function mostrarPanelCerrada() {
  const r = rifaActual();
  await cargarRifa();
  const volver = el('button', { class: 'enlace', type: 'button',
    onclick: () => { estado.verHistorial = true; mostrarPanel(); } }, '← Volver al historial');
  app.replaceChildren(el('div', { class: 'centro' }, volver), vistaRifa(r));
}

/* ---------- Arranque ---------- */

sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') mostrarIngreso(); });
arrancar().catch(() => mostrarIngreso('entrar', 'No se pudo conectar. Recarga la página.'));
