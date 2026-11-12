/* ==========================================================================
   ORQUESTADOR PACO · Módulo "Monitor de Inversiones"
   --------------------------------------------------------------------------
   Módulo de APOYO AL ANÁLISIS. No ejecuta compras, ventas ni ninguna
   operación financiera: sólo muestra información y registra la decisión que
   el usuario toma por su cuenta.

   Se registra en el punto de extensión `UI.moduleRenderers` de script.js y
   toma el control de la vista de módulo cuando se navega a "Monitor de
   Inversiones". No modifica el diseño ni la lógica de la Home.

   Fuente de datos: data/inversiones-demo.json
   Persistencia:    localStorage, con respaldo en memoria si no está disponible
   ========================================================================== */

'use strict';

(function () {

  const MODULE_ID = 'monitor-inversiones';
  const DATA_URL  = 'data/inversiones-demo.json';
  const STORE_KEY = 'orquestador.inversiones.decisiones';
  const MAX_HIST  = 60;

  /* Las tres únicas acciones registrables. Ninguna opera en el mercado. */
  const DECISIONES = [
    { id:'mantener',  label:'Mantener',  tono:'green', desc:'Sin cambios en la posición' },
    { id:'revisar',   label:'Revisar',   tono:'amber', desc:'Requiere análisis adicional' },
    { id:'no-operar', label:'No operar', tono:'red',   desc:'Descartado por ahora' }
  ];

  const NIVELES = [
    { id:'alta',  label:'Alta',  tono:'red',   desc:'Seguimiento diario' },
    { id:'media', label:'Media', tono:'amber', desc:'Revisión semanal' },
    { id:'baja',  label:'Baja',  tono:'green', desc:'Sin novedades' }
  ];

  /* Estado local del módulo. No se mezcla con el STATE global. */
  const MOD = { data:null, error:null, cargando:false, origen:null, decisiones:[] };

  /* ======================================================================
     Datos de respaldo
     Copia del JSON. Existe porque al abrir index.html directamente desde el
     disco (file://) el navegador bloquea fetch() por seguridad. Al conectar
     una fuente real, este respaldo debe eliminarse.
     ====================================================================== */
  const RESPALDO = {
    meta:{ fuente:'respaldo', aviso:'Datos de demostración incorporados en el código.' },
    resumenDia:{
      valorCartera:28.7, moneda:'USD',
      titular:'Jornada plana con rotación interna: el cobre compensa la caída del litio.',
      comentario:'La cartera cierra prácticamente sin cambios pese a dos movimientos fuertes de signo opuesto.',
      mercado:'Bolsa de Santiago cerrada · Wall Street en curso'
    },
    activos:[
      { ticker:'SQM-B',     nombre:'Sociedad Química y Minera', clase:'Acción · Chile', moneda:'CLP', precio:38450,  varDia:-3.2, varSemana:-6.8, varMes:-9.4, peso:11.6, atencion:'alta',  nota:'Cuarta sesión a la baja por corrección del precio del litio.' },
      { ticker:'USDCLP',    nombre:'Dólar observado',           clase:'Divisa',         moneda:'CLP', precio:948.6,  varDia:0.9,  varSemana:1.8,  varMes:-1.2, peso:12.1, atencion:'alta',  nota:'Afecta el costo de insumos importados del grupo.' },
      { ticker:'CMPC',      nombre:'Empresas CMPC',             clase:'Acción · Chile', moneda:'CLP', precio:1842,   varDia:-1.8, varSemana:-3.4, varMes:2.1,  peso:14.2, atencion:'media', nota:'Presión en precios de celulosa.' },
      { ticker:'COBRE',     nombre:'Cobre COMEX',               clase:'Commodity · lb', moneda:'USD', precio:4.62,   varDia:2.1,  varSemana:4.6,  varMes:7.8,  peso:8.4,  atencion:'media', nota:'Indicador adelantado de la demanda de construcción.' },
      { ticker:'VOO',       nombre:'Vanguard S&P 500 ETF',      clase:'ETF · EE.UU.',   moneda:'USD', precio:612.4,  varDia:0.6,  varSemana:1.2,  varMes:3.4,  peso:22.4, atencion:'baja',  nota:'Núcleo del portafolio.' },
      { ticker:'FRFL',      nombre:'Fondo Renta Fija Local',    clase:'Fondo mutuo',    moneda:'CLP', precio:1284.5, varDia:0.1,  varSemana:0.3,  varMes:0.9,  peso:13.7, atencion:'baja',  nota:'Reserva de liquidez.' },
      { ticker:'FALABELLA', nombre:'S.A.C.I. Falabella',        clase:'Acción · Chile', moneda:'CLP', precio:2914,   varDia:1.4,  varSemana:2.9,  varMes:5.2,  peso:9.8,  atencion:'baja',  nota:'Recuperación gradual del consumo interno.' },
      { ticker:'BTU-2032',  nombre:'Bono Tesorería 2032',       clase:'Renta fija',     moneda:'CLP', precio:98.4,   varDia:-0.2, varSemana:-0.6, varMes:1.4,  peso:7.8,  atencion:'baja',  nota:'Duración 6,2 años.' }
    ],
    noticias:[
      { titulo:'Litio: el precio spot cae por cuarta semana consecutiva',       fuente:'Agencia internacional (demo)',  hora:'07:20', relacionado:'SQM-B',  tono:'negativo' },
      { titulo:'El cobre supera los USD 4,60 por libra',                        fuente:'Agencia internacional (demo)',  hora:'06:45', relacionado:'COBRE',  tono:'positivo' },
      { titulo:'Banco Central mantiene la tasa de política monetaria en 4,75%', fuente:'Prensa económica local (demo)', hora:'08:10', relacionado:'USDCLP', tono:'neutro'   },
      { titulo:'Celulosa: nuevos embarques presionan los precios en Asia',      fuente:'Consultora sectorial (demo)',   hora:'05:30', relacionado:'CMPC',   tono:'negativo' },
      { titulo:'El S&P 500 cierra en máximos tras resultados tecnológicos',     fuente:'Prensa internacional (demo)',   hora:'22:15', relacionado:'VOO',    tono:'positivo' }
    ],
    analisis:{
      titulo:'Lectura del día', generado:'07:15',
      texto:'La cartera está plana en el día, pero eso esconde dos movimientos relevantes de signo opuesto que conviene mirar por separado antes que el agregado.',
      puntos:[
        'SQM-B acumula −6,8% en la semana y −9,4% en el mes. Es la posición más deteriorada del portafolio.',
        'El cobre sube 2,1% en el día y 7,8% en el mes, señal favorable para la demanda de construcción.',
        'El dólar en 948,6 mejora la valorización en pesos pero encarece los insumos importados.',
        'Renta fija y fondo local aportan estabilidad: 21,5% del portafolio se mueve menos de 0,3%.',
        'Concentración a vigilar: VOO y CMPC suman 36,6% del portafolio.'
      ],
      advertencia:'Texto de demostración. Este panel aún no está conectado a un modelo de análisis; su contenido es fijo y no constituye recomendación de inversión.'
    }
  };

  /* ======================================================================
     Persistencia
     ====================================================================== */
  const Store = {
    /* localStorage puede no estar disponible (file://, modo privado, políticas). */
    ok: (() => {
      try { localStorage.setItem('__inv_test', '1'); localStorage.removeItem('__inv_test'); return true; }
      catch (e) { return false; }
    })(),
    memoria: [],

    leer() {
      if (!Store.ok) return Store.memoria;
      try {
        const raw = localStorage.getItem(STORE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        console.warn('[Inversiones] Historial ilegible, se reinicia.', e);
        return [];
      }
    },

    guardar(lista) {
      Store.memoria = lista;
      if (!Store.ok) return;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(lista)); }
      catch (e) { console.warn('[Inversiones] No se pudo guardar el historial.', e); }
    }
  };

  /* ======================================================================
     Carga de datos
     ====================================================================== */
  function validar(json) {
    if (!json || typeof json !== 'object') throw new Error('El archivo no contiene un objeto JSON.');
    if (!Array.isArray(json.activos) || !json.activos.length) throw new Error('El archivo no trae la lista de activos.');
    return json;
  }

  function explicarError(e) {
    if (location.protocol === 'file:') {
      return 'El navegador bloquea la lectura de archivos locales cuando la página se abre directamente desde el disco. ' +
             'Sirve el proyecto por HTTP para leer el archivo real.';
    }
    return e && e.message ? e.message : 'Error desconocido al leer el archivo.';
  }

  async function cargar() {
    MOD.cargando = true;
    MOD.error = null;
    try {
      const res = await fetch(DATA_URL, { cache:'no-store' });
      if (!res.ok) throw new Error('El servidor respondió ' + res.status + ' ' + res.statusText + '.');
      MOD.data = validar(await res.json());
      MOD.origen = 'archivo';
    } catch (e) {
      console.warn('[Inversiones] No se pudo cargar ' + DATA_URL, e);
      MOD.error = explicarError(e);
      MOD.data = RESPALDO;
      MOD.origen = 'respaldo';
    } finally {
      MOD.cargando = false;
    }
  }

  /* ======================================================================
     Cálculos
     ====================================================================== */
  const pesoTotal = a => a.reduce((s, x) => s + (Number(x.peso) || 0), 0) || 1;

  /** Variación diaria del portafolio, ponderada por el peso de cada activo. */
  const varPortafolio = a => a.reduce((s, x) => s + (Number(x.varDia) || 0) * (Number(x.peso) || 0), 0) / pesoTotal(a);

  const porNivel   = (a, id) => a.filter(x => x.atencion === id);
  const decisionDe = t => MOD.decisiones.find(d => d.ticker === t);
  const decMeta    = id => DECISIONES.find(d => d.id === id) || { label:id, tono:'blue' };
  const tonoNoticia = t => ({ positivo:'green', negativo:'red', neutro:'muted' }[t] || 'muted');

  /* ======================================================================
     Formato
     ====================================================================== */
  function fmtPrecio(a) {
    const n = Number(a.precio);
    if (a.moneda === 'USD') return 'US$ ' + UTIL.num(n, n < 10 ? 2 : 1);
    return '$ ' + n.toLocaleString('es-CL', { maximumFractionDigits: n < 1000 ? 1 : 0 });
  }

  function fmtFecha(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('es-CL', { day:'2-digit', month:'short' }) + ' · ' +
           d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
  }

  /* ======================================================================
     Render · bloques
     ====================================================================== */

  function bloqueAviso() {
    const err = MOD.error ? `
      <div class="inv-banner inv-banner--warn">
        <span class="inv-banner__ico">${UTIL.icon('i-alert', 'ico ico--xs')}</span>
        <div>
          <b>No se pudo leer ${DATA_URL}</b> — se muestran los datos de respaldo incorporados en el código.
          <div class="inv-banner__d">${UTIL.esc(MOD.error)}</div>
        </div>
      </div>` : '';

    return err + `
      <div class="inv-banner inv-banner--info">
        <span class="inv-banner__ico">${UTIL.icon('i-shield', 'ico ico--xs')}</span>
        <div>
          <b>Módulo de apoyo al análisis.</b>
          No ejecuta compras, ventas ni ninguna operación financiera. Los botones sólo registran
          la decisión que tomas por tu cuenta, para dejar traza de ella.
        </div>
      </div>`;
  }

  function bloqueResumen() {
    const r   = MOD.data.resumenDia || {};
    const act = MOD.data.activos;
    const vp  = varPortafolio(act);
    const alta = porNivel(act, 'alta').length;

    const stats = [
      { k:'Valor de cartera',      v:`<span class="money">${UTIL.usd(Number(r.valorCartera) || 0)}</span>`, d:null },
      { k:'Variación diaria',      v:UTIL.pct(vp, 2), d:vp },
      { k:'Activos observados',    v:String(act.length), d:null },
      { k:'En atención alta',      v:String(alta), d:null },
      { k:'Decisiones registradas',v:`<span id="invStatDec">${MOD.decisiones.length}</span>`, d:null }
    ];

    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Resumen del día</h2>
            <p class="panel__sub">${UTIL.esc(r.mercado || '')} · fuente: ${MOD.origen === 'archivo' ? DATA_URL : 'datos de respaldo'}</p>
          </div>
          <button class="btn btn--ghost btn--sm" data-inv-act="recargar">Actualizar datos</button>
        </header>

        <div class="inv-stats">
          ${stats.map(s => `
            <div class="inv-stat">
              <span class="inv-stat__k">${UTIL.esc(s.k)}</span>
              <span class="inv-stat__v ${s.d === null ? '' : 'kpi__delta ' + UTIL.dir(s.d)}">${s.v}</span>
            </div>`).join('')}
        </div>

        <p class="inv-titular">${UTIL.esc(r.titular || '')}</p>
        <p class="inv-coment">${UTIL.esc(r.comentario || '')}</p>
      </section>`;
  }

  function bloqueActivos() {
    const filas = MOD.data.activos.map(a => {
      const dec   = decisionDe(a.ticker);
      const nivel = NIVELES.find(n => n.id === a.atencion) || NIVELES[2];
      return `
        <tr class="inv-row">
          <td>
            <div class="co">
              <span class="co__mark">${UTIL.esc(a.ticker.slice(0, 4))}</span>
              <span>
                <span class="co__name">${UTIL.esc(a.nombre)}</span><br>
                <span class="co__tag">${UTIL.esc(a.ticker)} · ${UTIL.esc(a.clase)}</span>
              </span>
            </div>
          </td>
          <td class="num money">${fmtPrecio(a)}</td>
          <td class="num"><span class="kpi__delta ${UTIL.dir(a.varDia)}">${UTIL.pct(a.varDia)}</span></td>
          <td class="num"><span class="kpi__delta ${UTIL.dir(a.varSemana)}">${UTIL.pct(a.varSemana)}</span></td>
          <td class="num">${UTIL.num(a.peso)}%</td>
          <td><span class="badge badge--${nivel.tono}"><i class="dot dot--${nivel.tono}"></i>${nivel.label}</span></td>
          <td>
            <div class="inv-dec" data-inv-group="${UTIL.esc(a.ticker)}">
              ${DECISIONES.map(d => `
                <button class="inv-dec__b inv-dec__b--${d.tono} ${dec && dec.decision === d.id ? 'is-active' : ''}"
                        data-inv-dec="${d.id}" data-inv-ticker="${UTIL.esc(a.ticker)}"
                        data-tip="${UTIL.esc(d.desc)}">${d.label}</button>`).join('')}
            </div>
          </td>
        </tr>
        <tr class="inv-noterow"><td colspan="7"><span class="inv-note">${UTIL.esc(a.nota || '')}</span></td></tr>`;
    }).join('');

    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Activos observados</h2>
            <p class="panel__sub">${MOD.data.activos.length} instrumentos en seguimiento · registra tu decisión en cada fila</p>
          </div>
          <div class="legend">
            ${DECISIONES.map(d => `<span class="lg"><i class="dot dot--${d.tono}"></i>${d.label}</span>`).join('')}
          </div>
        </header>
        <div class="table-wrap">
          <table class="table inv-table">
            <thead>
              <tr>
                <th>Activo</th><th class="num">Precio</th><th class="num">Día</th>
                <th class="num">Semana</th><th class="num">Peso</th><th>Atención</th><th>Decisión</th>
              </tr>
            </thead>
            <tbody>${filas}</tbody>
          </table>
        </div>
      </section>`;
  }

  function bloqueVariacion() {
    const act = MOD.data.activos.slice().sort((a, b) => b.varDia - a.varDia);
    const max = Math.max.apply(null, act.map(a => Math.abs(a.varDia)).concat([1]));

    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Variación diaria</h2>
            <p class="panel__sub">Ordenada de mayor alza a mayor caída</p>
          </div>
        </header>
        <div class="inv-div">
          ${act.map(a => {
            const w   = (Math.abs(a.varDia) / max) * 50;
            const pos = a.varDia >= 0;
            return `
              <div class="inv-div__row" data-tip="${UTIL.esc(a.nombre)} · ${UTIL.pct(a.varDia, 1, true)} en el día">
                <span class="inv-div__t">${UTIL.esc(a.ticker)}</span>
                <span class="inv-div__track">
                  <i class="inv-div__zero"></i>
                  <i class="inv-div__bar ${pos ? 'is-pos' : 'is-neg'}"
                     style="${pos ? 'left:50%' : 'right:50%'}" data-w="${w}"></i>
                </span>
                <span class="inv-div__v kpi__delta ${UTIL.dir(a.varDia)}">${UTIL.pct(a.varDia)}</span>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function bloqueAtencion() {
    const act = MOD.data.activos;
    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Nivel de atención</h2>
            <p class="panel__sub">Prioridad de seguimiento asignada a cada activo</p>
          </div>
        </header>
        <div class="inv-niveles">
          ${NIVELES.map(n => {
            const lista = porNivel(act, n.id);
            const pct   = (lista.length / act.length) * 100;
            return `
              <div class="inv-nivel">
                <div class="inv-nivel__top">
                  <span class="inv-nivel__k"><i class="dot dot--${n.tono}"></i>${n.label}</span>
                  <span class="inv-nivel__n">${lista.length}</span>
                </div>
                <div class="biz__track">
                  <i class="biz__fill" style="background:var(--${n.tono})" data-w="${pct}"></i>
                </div>
                <div class="inv-nivel__f">
                  <span>${UTIL.esc(n.desc)}</span>
                  <span>${lista.map(x => UTIL.esc(x.ticker)).join(' · ') || '—'}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function bloqueNoticias() {
    const n = MOD.data.noticias || [];
    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Noticias relevantes <span class="tag tag--ph">Placeholder</span></h2>
            <p class="panel__sub">Contenido de demostración · el feed de noticias aún no está conectado</p>
          </div>
        </header>
        <div class="inv-news">
          ${n.map(x => `
            <article class="inv-new">
              <i class="dot dot--${tonoNoticia(x.tono)}"></i>
              <div class="inv-new__b">
                <div class="inv-new__t">${UTIL.esc(x.titulo)}</div>
                <div class="inv-new__m">${UTIL.esc(x.fuente)} · ${UTIL.esc(x.hora)}</div>
              </div>
              <span class="inv-new__rel">${UTIL.esc(x.relacionado || '')}</span>
            </article>`).join('') || '<div class="mod-empty"><p>Sin noticias en el archivo de datos.</p></div>'}
        </div>
      </section>`;
  }

  function bloqueAnalisis() {
    const a = MOD.data.analisis || {};
    return `
      <section class="panel panel--ai">
        <header class="panel__head">
          <div class="ai-head">
            <div class="ai-badge">${UTIL.icon('i-spark')}</div>
            <div>
              <h2 class="panel__title">Análisis Claude <span class="tag tag--ph">Placeholder</span></h2>
              <p class="panel__sub">${UTIL.esc(a.titulo || '')} · ${UTIL.esc(a.generado || '')}</p>
            </div>
          </div>
        </header>
        <p class="ai-brief">${UTIL.esc(a.texto || '')}</p>
        <ul class="inv-puntos">
          ${(a.puntos || []).map(p => `<li>${UTIL.esc(p)}</li>`).join('')}
        </ul>
        <p class="inv-warn">${UTIL.esc(a.advertencia || '')}</p>
      </section>`;
  }

  function listaHistorial() {
    if (!MOD.decisiones.length) {
      return `
        <div class="mod-empty">
          ${UTIL.icon('i-check', 'ico')}
          <h3>Sin decisiones registradas</h3>
          <p>Usa los botones <b>Mantener</b>, <b>Revisar</b> o <b>No operar</b> en la tabla de activos
             observados. Cada registro queda guardado en este equipo.</p>
        </div>`;
    }
    return MOD.decisiones.map((d, i) => {
      const m = decMeta(d.decision);
      return `
        <div class="inv-hist">
          <span class="badge badge--${m.tono}">${m.label}</span>
          <div class="inv-hist__b">
            <div class="inv-hist__t">${UTIL.esc(d.nombre || d.ticker)}</div>
            <div class="inv-hist__m">${UTIL.esc(d.ticker)} · ${fmtFecha(d.ts)}${d.varDia === undefined ? '' : ' · día ' + UTIL.pct(d.varDia, 1, true)}</div>
          </div>
          <button class="icon-btn inv-hist__x" data-inv-act="borrar" data-inv-i="${i}" data-tip="Eliminar registro">
            ${UTIL.icon('i-close', 'ico ico--xs')}
          </button>
        </div>`;
    }).join('');
  }

  function bloqueHistorial() {
    return `
      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Historial de decisiones</h2>
            <p class="panel__sub">${Store.ok
              ? 'Guardado en este navegador (localStorage)'
              : 'Guardado sólo en memoria · se pierde al recargar la página'}</p>
          </div>
          <button class="btn btn--ghost btn--sm" data-inv-act="limpiar">Limpiar historial</button>
        </header>
        <div class="inv-hists" id="invHistorial">${listaHistorial()}</div>
      </section>`;
  }

  /* ======================================================================
     Render · vista completa
     ====================================================================== */
  function vista() {
    return `
      <div class="mod-head">
        <div>
          <div class="crumb">Patrimonio</div>
          <h2 class="mod-title">Monitor de Inversiones</h2>
          <p class="mod-sub">Seguimiento de activos observados, variación diaria y registro de decisiones.
             Datos de demostración desde <b>${DATA_URL}</b>.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
          <button class="btn btn--primary btn--sm" data-ai="Analiza el estado de mi portafolio de inversiones">
            ${UTIL.icon('i-spark', 'ico ico--xs')} Preguntar a Paco AI
          </button>
        </div>
      </div>

      ${bloqueAviso()}
      ${bloqueResumen()}
      ${bloqueActivos()}

      <div class="grid grid--6-4">
        ${bloqueVariacion()}
        ${bloqueAtencion()}
      </div>

      <div class="grid grid--5-5">
        ${bloqueNoticias()}
        ${bloqueAnalisis()}
      </div>

      ${bloqueHistorial()}`;
  }

  function esqueleto() {
    return `
      <div class="mod-head">
        <div>
          <div class="crumb">Patrimonio</div>
          <h2 class="mod-title">Monitor de Inversiones</h2>
          <p class="mod-sub">Leyendo ${DATA_URL}…</p>
        </div>
      </div>
      <section class="panel"><div class="mod-empty"><p>Cargando datos del monitor…</p></div></section>`;
  }

  function animar(root) {
    requestAnimationFrame(() => {
      root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
    });
  }

  async function render(root) {
    MOD.decisiones = Store.leer();

    if (!MOD.data) {
      root.innerHTML = esqueleto();
      await cargar();
      if (STATE.moduleId !== MODULE_ID) return;   // el usuario navegó a otra vista mientras cargaba
    }

    root.innerHTML = vista();
    animar(root);
  }

  /* ======================================================================
     Acciones
     ====================================================================== */
  function registrar(ticker, decision) {
    const a = MOD.data.activos.find(x => x.ticker === ticker);
    if (!a) return;

    /* Una decisión vigente por activo: la nueva reemplaza a la anterior. */
    MOD.decisiones = MOD.decisiones.filter(d => d.ticker !== ticker);
    MOD.decisiones.unshift({
      ts: Date.now(), ticker, nombre: a.nombre, decision,
      precio: a.precio, varDia: a.varDia
    });
    if (MOD.decisiones.length > MAX_HIST) MOD.decisiones.length = MAX_HIST;
    Store.guardar(MOD.decisiones);

    refrescar(ticker);
    UTIL.toast(a.ticker + ': ' + decMeta(decision).label + ' · registrado');
  }

  /** Actualiza sólo lo que cambia, para no perder la posición de scroll. */
  function refrescar(ticker) {
    if (ticker) {
      const grupo = document.querySelector('[data-inv-group="' + ticker + '"]');
      if (grupo) {
        const actual = decisionDe(ticker);
        grupo.querySelectorAll('[data-inv-dec]').forEach(b =>
          b.classList.toggle('is-active', !!actual && actual.decision === b.dataset.invDec));
      }
    }
    const hist = document.getElementById('invHistorial');
    if (hist) hist.innerHTML = listaHistorial();

    const stat = document.getElementById('invStatDec');
    if (stat) stat.textContent = MOD.decisiones.length;
  }

  function limpiar() {
    if (!MOD.decisiones.length) { UTIL.toast('El historial ya está vacío'); return; }
    if (!confirm('¿Eliminar los ' + MOD.decisiones.length + ' registros del historial de decisiones?')) return;
    MOD.decisiones = [];
    Store.guardar(MOD.decisiones);
    document.querySelectorAll('[data-inv-dec]').forEach(b => b.classList.remove('is-active'));
    refrescar();
    UTIL.toast('Historial de decisiones eliminado');
  }

  function borrar(i) {
    const d = MOD.decisiones[i];
    if (!d) return;
    MOD.decisiones.splice(i, 1);
    Store.guardar(MOD.decisiones);
    refrescar(d.ticker);
  }

  /* ======================================================================
     Eventos · delegados y acotados a la vista de este módulo
     ====================================================================== */
  document.addEventListener('click', e => {
    if (STATE.moduleId !== MODULE_ID) return;

    const dec = e.target.closest('[data-inv-dec]');
    if (dec) { registrar(dec.dataset.invTicker, dec.dataset.invDec); return; }

    const act = e.target.closest('[data-inv-act]');
    if (!act) return;

    switch (act.dataset.invAct) {
      case 'limpiar':  limpiar(); break;
      case 'borrar':   borrar(Number(act.dataset.invI)); break;
      case 'recargar':
        MOD.data = null;
        UTIL.toast('Releyendo ' + DATA_URL + '…');
        render(document.getElementById('view-module'));
        break;
    }
  });

  /* ======================================================================
     Registro en el orquestador
     ====================================================================== */
  if (typeof UI === 'undefined' || !UI.moduleRenderers) {
    console.error('[Inversiones] script.js no está cargado o no expone UI.moduleRenderers.');
    return;
  }
  UI.moduleRenderers[MODULE_ID] = render;
  console.log('%c[Inversiones] Monitor de Inversiones registrado', 'color:#19C37D');

})();
