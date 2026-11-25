/* ==========================================================================
   ORQUESTADOR PACO · Datos reales desde Power BI
   --------------------------------------------------------------------------
   Lee data-real/powerbi.json (generado por tools/actualizar-powerbi.ps1 con
   consultas de sólo lectura al modelo "Reporte_de_Ventas_Corporativo_TX") y
   reemplaza en DATA los bloques que tienen un equivalente real:

     KPIs · serie de 12 meses · ventas por sociedad · semáforo de empresas ·
     alertas · resumen ejecutivo · notificaciones · respuestas de Paco AI
     sobre ventas, margen y sociedades.

   Lo que el modelo no contiene (caja, cuentas por cobrar, producción,
   presupuesto, EBITDA contable, agenda, proyectos, patrimonio) NO se
   inventa: sale de la Home o queda rotulado como "Simulado".

   Si el archivo no existe (por ejemplo en un clon del repositorio, porque
   data-real/ no se versiona) el Orquestador sigue con los datos simulados.

   Definiciones
     Venta          medida [Despachado Total Corporativo]
     Costo          medida [Costo Total Corporativo] (costo directo)
     Margen bruto   Venta − Costo. No es EBITDA.
     A terceros     Venta − venta a empresas relacionadas del grupo
     Montos         millones de pesos chilenos (MM$)
   ========================================================================== */

'use strict';

(function () {

  const DATA_URL = 'data-real/powerbi.json';
  const MESES    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const COLORES  = ['#3B82F6','#19C37D','#8B7FF0','#FFB020','#4FC3D9','#64798F'];
  const VERDE = '#19C37D', AMBAR = '#FFB020', ROJO = '#FF5A67', AZUL = '#3B82F6';
  const DIAS_DESFASE = 7;     // una sociedad sin datos hace más de 7 días se considera desactualizada

  const PBI = { meta:null, empresas:[], filas:[], proy:{}, corte:'', info:[], adh:null, cache:new Map() };

  /* ======================================================================
     Fechas · se manejan como texto ISO (AAAA-MM-DD), comparable con < y >
     ====================================================================== */
  const aFecha = s => new Date(s + 'T00:00:00Z');
  const aTexto = d => d.toISOString().slice(0, 10);
  const masDias = (s, n) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d); };
  const finMes = (y, m) => aTexto(new Date(Date.UTC(y, m, 0)));              // m: 1-12
  const iniMes = (y, m) => y + '-' + String(m).padStart(2, '0') + '-01';

  /** Misma fecha, n años antes. El 29-feb cae al 28-feb. */
  function masAnios(s, n) {
    const y = +s.slice(0, 4) + n, m = +s.slice(5, 7), d = +s.slice(8, 10);
    const tope = +finMes(y, m).slice(8, 10);
    return y + '-' + s.slice(5, 7) + '-' + String(Math.min(d, tope)).padStart(2, '0');
  }

  const fechaCorta = s => +s.slice(8, 10) + ' ' + MESES[+s.slice(5, 7) - 1].toLowerCase();
  const fechaLarga = s => fechaCorta(s) + ' ' + s.slice(0, 4);

  /* ======================================================================
     Cubo · suma de venta, costo y venta a relacionadas en millones de pesos
     ====================================================================== */
  function suma(emps, desde, hasta) {
    const clave = [...emps].join(',') + '|' + desde + '|' + hasta;
    if (PBI.cache.has(clave)) return PBI.cache.get(clave);
    let v = 0, c = 0, r = 0;
    const dias = new Set();
    for (const f of PBI.filas) {
      if (f[0] < desde || f[0] > hasta || !emps.has(f[1])) continue;
      v += f[2]; c += f[3]; r += f[4];
      if (f[2] > 0) dias.add(f[0]);
    }
    const res = { v:v / 1e6, c:c / 1e6, r:r / 1e6, mb:(v - c) / 1e6, ter:(v - r) / 1e6, dias:dias.size };
    PBI.cache.set(clave, res);
    return res;
  }

  const pctDe  = (a, b) => b ? (a / b) * 100 : 0;
  const varPct = (a, b) => b > 0 ? (a / b - 1) * 100 : null;
  const tono   = d => d === null ? AZUL : d >= 0 ? VERDE : d > -5 ? AMBAR : ROJO;
  const acota  = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const r1     = n => +n.toFixed(1);

  /* ======================================================================
     Períodos · todos terminan en la fecha de corte de los datos
     ====================================================================== */
  function rango(id) {
    const c = PBI.corte, y = +c.slice(0, 4), m = +c.slice(5, 7);
    let d;
    switch (id) {
      case 'hoy':       return { d:c, h:c, pd:masDias(c, -7), ph:masDias(c, -7), cmp:'vs. semana anterior' };
      case 'mes':       d = iniMes(y, m); break;
      case 'trimestre': d = iniMes(y, Math.floor((m - 1) / 3) * 3 + 1); break;
      case 'ano':       d = masDias(masAnios(c, -1), 1); break;            // 12 meses móviles
      default:          d = iniMes(y, 1);                                   // ytd
    }
    return { d, h:c, pd:masAnios(d, -1), ph:masAnios(c, -1), cmp:'YoY' };
  }

  function periodos() {
    const c = PBI.corte, y = c.slice(0, 4), m = +c.slice(5, 7);
    const q = Math.floor((m - 1) / 3) + 1;
    return [
      { id:'hoy',       label:'Último día', hint:fechaCorta(c),                   factor:1, ctx:'del ' + fechaCorta(c) },
      { id:'mes',       label:'Mes',        hint:MESES[m - 1] + ' al ' + +c.slice(8, 10), factor:1, ctx:'del mes' },
      { id:'trimestre', label:'Trimestre',  hint:'Q' + q + ' ' + y,               factor:1, ctx:'del trimestre' },
      { id:'ytd',       label:'YTD',        hint:'Ene – ' + MESES[m - 1],         factor:1, ctx:'acumulado' },
      { id:'ano',       label:'12 meses',   hint:'Móviles',                       factor:1, ctx:'12 meses' }
    ];
  }

  /* ======================================================================
     Sociedades y perímetros
     ====================================================================== */
  const idDe  = n => n.toLowerCase().replace(/\s*tx$/, '').replace(/[^a-z]/g, '');
  const codDe = n => ({ hormigones:'HTX', morteros:'MTX', cementos:'CTX', minera:'MIN', distribuidora:'DTX' }[idDe(n)]
                       || n.slice(0, 3).toUpperCase());

  function prepararSociedades() {
    const ultima = PBI.empresas.map(() => '');
    for (const f of PBI.filas) if (f[2] > 0 && f[0] > ultima[f[1]]) ultima[f[1]] = f[0];
    const limite = masDias(PBI.corte, -DIAS_DESFASE);
    PBI.info = PBI.empresas.map((n, i) => ({
      i, nombre:n, id:idDe(n), cod:codDe(n), ultima:ultima[i], alDia:ultima[i] >= limite
    }));
  }

  /** Sociedades de un perímetro, y cuáles sirven de base comparable para el YoY. */
  function perimetro(id) {
    const lista = id === 'consolidado' ? PBI.info : PBI.info.filter(e => e.id === id);
    const alDia = lista.filter(e => e.alDia);
    return {
      emps: new Set(lista.map(e => e.i)),
      cmp:  new Set((alDia.length ? alDia : lista).map(e => e.i)),
      fuera: lista.filter(e => !e.alDia)
    };
  }

  function entidades() {
    const ytd = rango('ytd');
    const margen = emps => { const s = suma(emps, ytd.d, ytd.h); return r1(pctDe(s.mb, s.v)); };
    const orden = PBI.info.slice().sort((a, b) =>
      suma(new Set([b.i]), ytd.d, ytd.h).v - suma(new Set([a.i]), ytd.d, ytd.h).v);
    return [
      { id:'consolidado', label:'Grupo Consolidado', hint:PBI.info.length + ' sociedades', factor:1,
        margin:margen(perimetro('consolidado').emps), scope:'all' }
    ].concat(orden.map(e => ({
      id:e.id, label:e.nombre, hint:e.alDia ? 'Sociedad' : 'Sin datos recientes', factor:1,
      margin:margen(new Set([e.i])), scope:e.id
    })));
  }

  /* ======================================================================
     Bloques de DATA · se recalculan en cada render según período y perímetro
     ====================================================================== */
  function kpis() {
    const P = perimetro(STATE.entity), R = rango(STATE.period), M = rango('mes');
    const cur  = suma(P.emps, R.d, R.h);
    const curC = suma(P.cmp, R.d, R.h), prevC = suma(P.cmp, R.pd, R.ph);
    const mes  = suma(P.emps, M.d, M.h);
    const mesC = suma(P.cmp, M.d, M.h), mesPrevC = suma(P.cmp, M.pd, M.ph);

    const base = P.fuera.length
      ? ' Variación en base comparable: excluye ' + P.fuera.map(e => e.nombre).join(', ') + ' (sin datos recientes).'
      : '';

    const dV  = varPct(curC.v, prevC.v);
    const dMb = varPct(curC.mb, prevC.mb);
    const dT  = varPct(curC.ter, prevC.ter);
    const dM  = varPct(mesC.v, mesPrevC.v);

    /* Proyección de cierre del mes: medida del modelo, por sociedad. */
    const conProy = PBI.info.filter(e => P.emps.has(e.i) && PBI.proy[e.nombre] > 0);
    const proy    = conProy.reduce((s, e) => s + PBI.proy[e.nombre], 0) / 1e6;
    const y = +PBI.corte.slice(0, 4), m = +PBI.corte.slice(5, 7);
    const mesAnt  = suma(new Set(conProy.map(e => e.i)), iniMes(y - 1, m), finMes(y - 1, m));
    const dP      = varPct(proy, mesAnt.v);

    const prom     = cur.dias ? cur.v / cur.dias : 0;
    const promPrev = prevC.dias ? prevC.v / prevC.dias : 0;
    const dProm    = varPct(curC.dias ? curC.v / curC.dias : 0, promPrev);

    const k = (o, delta) => Object.assign({ unit:'musd', stock:false, delta:delta === null ? 0 : r1(delta),
                                           accent:tono(delta) }, o);
    return [
      k({ id:'ventas', label:'Ventas', value:cur.v, deltaLabel:R.cmp, bar:acota(50 + (dV || 0), 4, 100),
          tip:'Medida «Despachado Total Corporativo» de Power BI. Incluye venta entre empresas relacionadas.' + base,
          ask:'¿Cómo van las ventas?' }, dV),
      k({ id:'margenbruto', label:'Margen bruto', value:cur.mb, deltaLabel:UTIL.num(pctDe(cur.mb, cur.v)) + '% s/ venta',
          bar:acota(pctDe(cur.mb, cur.v), 4, 100),
          tip:'Venta menos «Costo Total Corporativo» (costo directo). No es EBITDA: no descuenta gastos de administración ni ventas.' + base,
          ask:'¿Cómo está el margen?' }, dMb),
      k({ id:'ventasmes', label:'Ventas ' + MESES[m - 1], value:mes.v, deltaLabel:'YoY al día ' + +PBI.corte.slice(8, 10),
          forcePeriod:true, bar:acota(pctDe(mes.v, proy || mes.v), 4, 100),
          tip:'Venta del mes en curso hasta la fecha de corte, contra los mismos días del año anterior.' + base,
          ask:'¿Cómo van las ventas este mes?' }, dM),
      k({ id:'proyeccion', label:'Proyección ' + MESES[m - 1], value:proy, forcePeriod:true,
          deltaLabel:'vs. ' + MESES[m - 1].toLowerCase() + ' ' + (y - 1) + ' completo', bar:acota(pctDe(mes.v, proy), 4, 100),
          tip:'Medida «Proyeccion de Despacho Corporativo» de Power BI para el cierre del mes en curso.',
          ask:'¿Cómo van las ventas este mes?' }, dP),
      k({ id:'terceros', label:'Venta a terceros', value:cur.ter, deltaLabel:UTIL.num(pctDe(cur.ter, cur.v)) + '% de la venta',
          bar:acota(pctDe(cur.ter, cur.v), 4, 100),
          tip:'Venta total menos lo despachado a empresas relacionadas del grupo.' + base,
          ask:'¿Cuánto de la venta es entre empresas relacionadas?' }, dT),
      k({ id:'promdia', label:'Promedio diario', value:prom, deltaLabel:cur.dias + (cur.dias === 1 ? ' día' : ' días') + ' con despacho',
          bar:acota(50 + (dProm || 0), 4, 100),
          tip:'Venta del período dividida por los días con despacho.' + base,
          ask:'¿Cómo van las ventas?' }, dProm)
    ];
  }

  function serie() {
    const P = perimetro(STATE.entity);
    const y = +PBI.corte.slice(0, 4), m = +PBI.corte.slice(5, 7);
    const out = { labels:[], ventas:[], ebitda:[], presupuesto:[], forecast:[] };
    const proy = PBI.info.filter(e => P.emps.has(e.i)).reduce((s, e) => s + (PBI.proy[e.nombre] || 0), 0) / 1e6;

    for (let k = 11; k >= 0; k--) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1));
      const yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1;
      const actual = k === 0;
      const hasta = actual ? PBI.corte : finMes(yy, mm);
      const s  = suma(P.emps, iniMes(yy, mm), hasta);
      const aa = suma(P.emps, iniMes(yy - 1, mm), actual ? masAnios(hasta, -1) : finMes(yy - 1, mm));
      out.labels.push(MESES[mm - 1] + (actual ? '*' : ''));
      out.ventas.push(r1(s.v));
      out.ebitda.push(r1(s.mb));
      out.presupuesto.push(r1(aa.v));
      out.forecast.push(r1(actual && proy ? proy : s.v));
    }
    return out;
  }

  /** Una fila por sociedad para el período elegido. */
  function sociedades() {
    const R = rango(STATE.period);
    return PBI.info.map(e => {
      const uno = new Set([e.i]);
      const cur = suma(uno, R.d, R.h), prev = suma(uno, R.pd, R.ph);
      const yoy = varPct(cur.v, prev.v);
      const margen = pctDe(cur.mb, cur.v), margenPrev = pctDe(prev.mb, prev.v);
      let status = 'green';
      if (!e.alDia || (yoy !== null && yoy < -5)) status = 'red';
      else if ((yoy !== null && yoy < 0) || margen < margenPrev - 2) status = 'amber';
      return {
        name:e.nombre, code:e.cod, country:'CL', groups:['all', e.id],
        tag:e.alDia ? 'Datos al ' + fechaCorta(e.ultima) : 'Sin datos desde ' + fechaLarga(e.ultima),
        sales:cur.v, ebitda:cur.mb, margin:r1(margen), budget:Math.round(pctDe(cur.ter, cur.v)),
        yoy:yoy === null ? 0 : r1(yoy), status
      };
    }).sort((a, b) => b.sales - a.sales);
  }

  function negocios(filas) {
    const conVenta = filas.filter(c => c.sales > 0);
    return (conVenta.length ? conVenta : filas).map((c, i) => ({
      name:c.name, value:c.sales, color:COLORES[i % COLORES.length], delta:c.yoy, margin:c.margin
    }));
  }

  /* ======================================================================
     Alertas y resumen · derivados del acumulado del año
     ====================================================================== */
  function alertas() {
    const R = rango('ytd'), cuando = 'corte ' + fechaCorta(PBI.corte);
    const todo = suma(perimetro('consolidado').emps, R.d, R.h);
    const out = [];

    PBI.info.filter(e => !e.alDia).forEach(e => out.push({
      prio:'alta', company:e.nombre, time:cuando,
      text:`${e.nombre} no registra despachos en el modelo de Power BI desde el ${fechaLarga(e.ultima)}. ` +
           'El consolidado posterior a esa fecha no la incluye.',
      impact:'Efecto', value:'Consolidado incompleto' }));

    PBI.info.filter(e => e.alDia).forEach(e => {
      const uno = new Set([e.i]);
      const cur = suma(uno, R.d, R.h), prev = suma(uno, R.pd, R.ph);
      const yoy = varPct(cur.v, prev.v);
      const mg = pctDe(cur.mb, cur.v), mgPrev = pctDe(prev.mb, prev.v), dif = mg - mgPrev;

      if (yoy !== null && yoy <= -5) out.push({
        prio:'alta', company:e.nombre, time:cuando,
        text:`La venta acumulada de ${e.nombre} cae ${UTIL.pct(Math.abs(yoy))} contra el mismo período del año anterior.`,
        impact:'Diferencia', value:UTIL.musd(cur.v - prev.v) });

      if (prev.v > 0 && dif <= -3) out.push({
        prio:'alta', company:e.nombre, time:cuando,
        text:`El margen bruto de ${e.nombre} baja de ${UTIL.num(mgPrev)}% a ${UTIL.num(mg)}% en el acumulado.`,
        impact:'Variación', value:UTIL.num(dif) + ' puntos' });

      if (prev.v > 0 && dif >= 8) out.push({
        prio:'media', company:e.nombre, time:cuando,
        text:`El margen bruto de ${e.nombre} sube de ${UTIL.num(mgPrev)}% a ${UTIL.num(mg)}% en el acumulado. ` +
             'Un salto de esta magnitud conviene validarlo contra el costo cargado en el modelo.',
        impact:'Variación', value:'+' + UTIL.num(dif) + ' puntos' });

      if (yoy !== null && yoy >= 10) out.push({
        prio:'oportunidad', company:e.nombre, time:cuando,
        text:`${e.nombre} crece ${UTIL.pct(yoy)} en venta acumulada contra el mismo período del año anterior.`,
        impact:'Incremento', value:'+' + UTIL.musd(cur.v - prev.v) });
    });

    if (todo.v > 0 && pctDe(todo.r, todo.v) >= 10) out.push({
      prio:'media', company:'Grupo', time:cuando,
      text:`${UTIL.num(pctDe(todo.r, todo.v))}% de la venta acumulada del grupo es entre empresas relacionadas. ` +
           'La suma de las sociedades no equivale a la venta a terceros.',
      impact:'Venta entre relacionadas', value:UTIL.musd(todo.r) });

    const adh = PBI.adh ? alertaAdhesivos() : null;
    if (adh) out.push(adh);

    const orden = { alta:0, media:1, oportunidad:2 };
    return out.sort((a, b) => orden[a.prio] - orden[b.prio]);
  }

  function resumen() {
    const P = perimetro('consolidado'), R = rango('ytd'), M = rango('mes');
    const cur = suma(P.emps, R.d, R.h);
    const dV = varPct(suma(P.cmp, R.d, R.h).v, suma(P.cmp, R.pd, R.ph).v);
    const dM = varPct(suma(P.cmp, M.d, M.h).v, suma(P.cmp, M.pd, M.ph).v);
    const filas = PBI.info.filter(e => e.alDia).map(e => {
      const uno = new Set([e.i]);
      return { n:e.nombre, y:varPct(suma(uno, R.d, R.h).v, suma(uno, R.pd, R.ph).v) };
    }).filter(x => x.y !== null).sort((a, b) => b.y - a.y);

    let t = `Al <b>${fechaLarga(PBI.corte)}</b> el grupo acumula ventas por <b>${UTIL.musd(cur.v)}</b> ` +
            `con un margen bruto de <b>${UTIL.num(pctDe(cur.mb, cur.v))}%</b>.`;
    if (dV !== null) t += ` En base comparable la venta acumulada varía <b>${UTIL.pct(dV, 1, true)}</b> contra el año anterior` +
                          (dM !== null ? ` y la del mes <b>${UTIL.pct(dM, 1, true)}</b>.` : '.');
    if (filas.length) t += ` <b>${filas[0].n}</b> lidera el crecimiento (${UTIL.pct(filas[0].y, 1, true)}).`;
    if (P.fuera.length) t += ` <b>Atención:</b> ${P.fuera.map(e => `${e.nombre} no tiene datos desde el ${fechaLarga(e.ultima)}`).join('; ')}.`;
    t += ` De la venta acumulada, <b>${UTIL.num(pctDe(cur.r, cur.v))}%</b> es entre empresas relacionadas.`;
    return t;
  }

  function notificaciones(al) {
    const tipo = { alta:'red', media:'amber', oportunidad:'green' };
    const ico  = { alta:'i-alert', media:'i-pulse', oportunidad:'i-pulse' };
    return al.slice(0, 6).map(a => ({ type:tipo[a.prio], icon:ico[a.prio], t:a.text,
                                      m:a.company + ' · Power BI · ' + a.time, unread:true }));
  }

  /* ======================================================================
     Paco AI · respuestas calculadas sobre los datos reales
     ====================================================================== */
  const kv = (a, b) => `<div class="kv"><span>${UTIL.esc(a)}</span><b>${b}</b></div>`;
  const pie = () => `<br><small>Fuente: Power BI · ${UTIL.esc(PBI.meta.modelo)} · corte ${fechaLarga(PBI.corte)}.</small>`;

  function respVentas() {
    const P = perimetro('consolidado'), R = rango('ytd'), M = rango('mes');
    const cur = suma(P.emps, R.d, R.h), mes = suma(P.emps, M.d, M.h);
    const dV = varPct(suma(P.cmp, R.d, R.h).v, suma(P.cmp, R.pd, R.ph).v);
    const dM = varPct(suma(P.cmp, M.d, M.h).v, suma(P.cmp, M.pd, M.ph).v);
    const proy = PBI.info.reduce((s, e) => s + (PBI.proy[e.nombre] || 0), 0) / 1e6;
    const filas = PBI.info.map(e => {
      const uno = new Set([e.i]), c = suma(uno, R.d, R.h), y = varPct(c.v, suma(uno, R.pd, R.ph).v);
      return { e, c, y };
    }).sort((a, b) => b.c.v - a.c.v);
    return `Las ventas del mes llevan <b>${UTIL.musd(mes.v)}</b> al ${fechaCorta(PBI.corte)}` +
      (dM !== null ? ` (<b>${UTIL.pct(dM, 1, true)}</b> contra los mismos días del año anterior)` : '') +
      (proy ? `, con una proyección de cierre de <b>${UTIL.musd(proy)}</b>.` : '.') +
      ` El acumulado del año es <b>${UTIL.musd(cur.v)}</b>` +
      (dV !== null ? `, <b>${UTIL.pct(dV, 1, true)}</b> en base comparable.` : '.') +
      filas.map(x => kv(x.e.nombre, UTIL.musd(x.c.v) + (x.e.alDia
        ? (x.y === null ? '' : ' · ' + UTIL.pct(x.y, 1, true))
        : ' · sin datos desde ' + fechaCorta(x.e.ultima)))).join('') +
      `De ese total, <b>${UTIL.musd(cur.r)}</b> (${UTIL.num(pctDe(cur.r, cur.v))}%) es venta entre empresas relacionadas.` + pie();
  }

  function respMargen() {
    const R = rango('ytd'), cur = suma(perimetro('consolidado').emps, R.d, R.h);
    return `El margen bruto acumulado es <b>${UTIL.musd(cur.mb)}</b>, un <b>${UTIL.num(pctDe(cur.mb, cur.v))}%</b> de la venta.` +
      PBI.info.map(e => {
        const uno = new Set([e.i]), c = suma(uno, R.d, R.h), p = suma(uno, R.pd, R.ph);
        return kv(e.nombre, UTIL.num(pctDe(c.mb, c.v)) + '% · año anterior ' + UTIL.num(pctDe(p.mb, p.v)) + '%');
      }).join('') +
      'Es venta menos costo directo, tal como lo calcula el modelo. <b>No es EBITDA</b>: el modelo de ventas ' +
      'no descuenta gastos de administración ni de ventas.' + pie();
  }

  function respSociedad(e) {
    const uno = new Set([e.i]), R = rango('ytd'), M = rango('mes');
    const c = suma(uno, R.d, R.h), p = suma(uno, R.pd, R.ph), m = suma(uno, M.d, M.h), mp = suma(uno, M.pd, M.ph);
    const y = varPct(c.v, p.v), ym = varPct(m.v, mp.v);
    return `<b>${UTIL.esc(e.nombre)}</b> · acumulado del año al ${fechaCorta(PBI.corte)}:` +
      kv('Venta', UTIL.musd(c.v) + (y === null ? '' : ' · ' + UTIL.pct(y, 1, true))) +
      kv('Margen bruto', UTIL.musd(c.mb) + ' · ' + UTIL.num(pctDe(c.mb, c.v)) + '%') +
      kv('Margen año anterior', UTIL.num(pctDe(p.mb, p.v)) + '%') +
      kv('Venta del mes', UTIL.musd(m.v) + (ym === null ? '' : ' · ' + UTIL.pct(ym, 1, true))) +
      kv('Proyección de cierre', PBI.proy[e.nombre] ? UTIL.musd(PBI.proy[e.nombre] / 1e6) : '—') +
      kv('Venta a relacionadas', UTIL.musd(c.r) + ' · ' + UTIL.num(pctDe(c.r, c.v)) + '%') +
      (e.alDia ? '' : `<b>Atención:</b> no hay despachos en el modelo desde el ${fechaLarga(e.ultima)}; las variaciones no son comparables.`) + pie();
  }

  function respAlertas() {
    return `Hay <b>${DATA.alerts.length} alertas</b> derivadas de los datos de Power BI:` +
      '<ul>' + DATA.alerts.map(a => `<li><b>${UTIL.esc(a.company)}:</b> ${UTIL.esc(a.text)}</li>`).join('') + '</ul>' + pie();
  }

  function conectarAI() {
    const simulada = AI.answer;
    AI.answer = q => {
      const t = q.toLowerCase();
      if (PBI.adh && /adhesiv/.test(t)) return respAdhesivos();
      if ((PBI.metas || PBI.prod) && /presupuesto|meta|cumplimiento/.test(t)) return respPresupuesto();
      if (PBI.prod && /producci|m3|m³|planta|capacidad/.test(t)) return respProduccion();
      if (/alerta|atenci[oó]n|riesgo|oportunidad|qu[eé] est[aá] pasando/.test(t)) return respAlertas();
      const soc = PBI.info.find(e => t.includes(e.id) || t.includes(e.nombre.toLowerCase()));
      if (soc) return respSociedad(soc);
      if (/relacionad|tercero/.test(t)) return respVentas();
      if (/margen|ebitda|rentab|costo/.test(t)) return respMargen();
      if (/venta|vendimos|despach|proyecci|factur/.test(t)) return respVentas();
      if (/empresa|sociedad|desempe/.test(t)) return respVentas();
      return '<div class="kv"><span>Respuesta de demostración</span><b>cifras simuladas</b></div>' +
             'Esta consulta no se puede responder con el modelo de ventas de Power BI. ' +
             'Lo que sigue es el texto de ejemplo del prototipo, no información real:<br><br>' + simulada(q);
    };

    const hilo = $('#aiThread');
    if (hilo && hilo.children.length <= 1) {
      hilo.innerHTML = '';
      const altas = DATA.alerts.filter(a => a.prio === 'alta').length;
      AI.bubble('ai', `${UTIL.greeting()}, ${UTIL.esc(DATA.user.name)}. Tengo cargados los datos de <b>Power BI</b> ` +
        `con corte al <b>${fechaLarga(PBI.corte)}</b>.<br><br>${resumen()}<br><br>` +
        `Hay <b>${altas}</b> ${altas === 1 ? 'alerta' : 'alertas'} de prioridad alta. Puedo responder con datos reales sobre ` +
        'ventas, margen bruto y cada sociedad; el resto de mis respuestas sigue siendo de demostración.');
    }
  }

  /* ======================================================================
     Rótulos de la interfaz que cambian con los datos reales
     ====================================================================== */
  function panel(titulo) {
    const h = $$('.panel__title').find(x => x.textContent.trim().startsWith(titulo));
    return h ? { h, sub:h.parentElement.querySelector('.panel__sub') } : null;
  }

  function rotular() {
    const corte = 'Power BI · corte ' + fechaLarga(PBI.corte);
    const set = (titulo, nuevoTitulo, sub) => {
      const p = panel(titulo);
      if (!p) return;
      if (nuevoTitulo) p.h.textContent = nuevoTitulo;
      if (sub && p.sub) p.sub.innerHTML = sub;
    };

    set('Ventas y EBITDA', 'Ventas y margen bruto',
        'Últimos 12 meses · millones de CLP · <span id="chartScope"></span> · *mes en curso al ' + fechaCorta(PBI.corte));
    set('Ventas por negocio', 'Ventas por sociedad', 'Participación en la venta del período · ' + corte);
    set('Semáforo de empresas', null, 'Desempeño por sociedad · ' + corte);
    set('Requiere tu atención', null, 'Alertas calculadas sobre los datos de Power BI');
    set('PACO AI · Resumen ejecutivo', null, 'Calculado sobre ' + corte);

    const th = $$('#companyTable thead th');
    if (th.length >= 5) { th[2].textContent = 'Margen bruto'; th[3].textContent = 'Margen %'; th[4].textContent = 'A terceros'; }

    const seg = { ebitda:'Margen bruto', margen:'Margen %', presupuesto:'Año anterior', forecast:'Proyección' };
    Object.keys(seg).forEach(k => { const b = $(`#chartMetrics [data-metric="${k}"]`); if (b) b.textContent = seg[k]; });

    /* Bloques que el modelo de Power BI no cubre: quedan a la vista, rotulados. */
    ['Agenda del gerente', 'Mapa del grupo', 'Proyectos estratégicos', 'Patrimonio', 'Personal'].forEach(t => {
      const p = panel(t);
      if (p && !p.h.querySelector('.tag--ph')) p.h.insertAdjacentHTML('beforeend', ' <span class="tag tag--ph">Simulado</span>');
    });

    /* Sugerencias de consulta: sólo las que se responden con datos reales. */
    const chips = [
      '¿Cómo van las ventas este mes?', '¿Cómo va cada sociedad?', '¿Cómo está el margen bruto?',
      '¿Cuánto vendemos entre empresas relacionadas?', '¿Qué problemas necesitan mi atención?'
    ];
    $$('.askbar__chips .chip').forEach((c, i) => {
      if (chips[i]) { c.textContent = chips[i]; c.dataset.ask = chips[i]; } else c.remove();
    });

    const st = $('#dataStatus');
    if (st) st.textContent = 'Datos reales · ' + corte;
  }

  /* ======================================================================
     Línea Adhesivos · módulo Grupo TX → Adhesivos
     Alcance: despachos de Morteros TX cuya planta es "Planta Adhesivos".
     ====================================================================== */
  function sumaAdh(desde, hasta) {
    let v = 0, c = 0;
    for (const f of PBI.adh.filas) {
      if (f[0] < desde || f[0] > hasta) continue;
      v += f[1]; c += f[2];
    }
    return { v:v / 1e6, c:c / 1e6, mb:(v - c) / 1e6, mg:v ? ((v - c) / v) * 100 : 0 };
  }

  const pts = d => `<span class="kpi__delta ${UTIL.dir(d)}">${d > 0 ? '+' : d < 0 ? '−' : ''}${UTIL.num(Math.abs(d))} pts</span>`;

  function adhDatos() {
    const c = PBI.adh.corte, y = +c.slice(0, 4), m = +c.slice(5, 7);
    const cAnt = masAnios(c, -1);
    const acum = sumaAdh(iniMes(y, 1), c), acumAnt = sumaAdh(iniMes(y - 1, 1), cAnt);
    const mes  = sumaAdh(iniMes(y, m), c), mesAnt  = sumaAdh(iniMes(y - 1, m), cAnt);

    const meses = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1));
      const yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1, actual = k === 0;
      const hasta = actual ? c : finMes(yy, mm);
      meses.push({ label:MESES[mm - 1] + ' ' + String(yy).slice(2) + (actual ? '*' : ''),
                   cur:sumaAdh(iniMes(yy, mm), hasta),
                   ant:sumaAdh(iniMes(yy - 1, mm), actual ? masAnios(hasta, -1) : finMes(yy - 1, mm)) });
    }

    const familias = PBI.adh.grupos.map(g => {
      const v = g[1] / 1e6, mb = (g[1] - g[2]) / 1e6, vp = g[3] / 1e6, mbp = (g[3] - g[4]) / 1e6;
      return { n:g[0] || '(sin familia)', v, mb, vp, mbp,
               mg:v ? (mb / v) * 100 : null, mgp:vp ? (mbp / vp) * 100 : null };
    }).sort((a, b) => b.v - a.v);

    return { c, y, m, acum, acumAnt, mes, mesAnt, meses, familias };
  }

  function renderAdhesivos(root) {
    const A = adhDatos();
    const dMg = A.acum.mg - A.acumAnt.mg;
    const dV = varPct(A.acum.v, A.acumAnt.v), dMb = varPct(A.acum.mb, A.acumAnt.mb), dMes = varPct(A.mes.v, A.mesAnt.v);
    const maxV = Math.max.apply(null, A.meses.map(x => x.cur.v).concat([1]));

    const tarjetas = [
      { k:'Venta acumulada ' + A.y, v:UTIL.musd(A.acum.v), d:`<span class="kpi__delta ${UTIL.dir(dV || 0)}">${UTIL.pct(dV || 0)}</span>`, s:'vs. mismo período ' + (A.y - 1) },
      { k:'Margen bruto', v:UTIL.musd(A.acum.mb), d:`<span class="kpi__delta ${UTIL.dir(dMb || 0)}">${UTIL.pct(dMb || 0)}</span>`, s:'vs. mismo período ' + (A.y - 1) },
      { k:'Margen % acumulado', v:UTIL.num(A.acum.mg) + '%', d:pts(dMg), s:'era ' + UTIL.num(A.acumAnt.mg) + '% en ' + (A.y - 1) },
      { k:'Venta ' + MESES[A.m - 1] + ' al día ' + +A.c.slice(8, 10), v:UTIL.musd(A.mes.v),
        d:`<span class="kpi__delta ${UTIL.dir(dMes || 0)}">${UTIL.pct(dMes || 0)}</span>`, s:'margen ' + UTIL.num(A.mes.mg) + '%' }
    ];

    const top = A.familias.slice(0, 14), resto = A.familias.slice(14);
    const filaFam = f => `
      <tr>
        <td><span class="co__name">${UTIL.esc(f.n)}</span></td>
        <td class="num money">${UTIL.musd(f.v)}</td>
        <td class="num">${UTIL.num(pctDe(f.v, A.acum.v))}%</td>
        <td class="num">${f.mg === null ? '—' : UTIL.num(f.mg) + '%'}</td>
        <td class="num">${f.mgp === null ? '—' : UTIL.num(f.mgp) + '%'}</td>
        <td class="num">${f.mg === null || f.mgp === null ? '—' : pts(f.mg - f.mgp)}</td>
        <td class="num money"><span class="kpi__delta ${UTIL.dir(f.mb - f.mbp)}">${UTIL.musd(f.mb - f.mbp)}</span></td>
      </tr>`;
    const otros = resto.length ? (() => {
      const s = resto.reduce((a, f) => ({ v:a.v + f.v, mb:a.mb + f.mb, vp:a.vp + f.vp, mbp:a.mbp + f.mbp }), { v:0, mb:0, vp:0, mbp:0 });
      return filaFam({ n:'Otras ' + resto.length + ' familias', v:s.v, mb:s.mb, vp:s.vp, mbp:s.mbp,
                       mg:s.v ? (s.mb / s.v) * 100 : null, mgp:s.vp ? (s.mbp / s.vp) * 100 : null });
    })() : '';

    root.innerHTML = `
      <div class="mod-head">
        <div>
          <div class="crumb">Grupo TX</div>
          <h2 class="mod-title">Adhesivos</h2>
          <p class="mod-sub">Venta y margen bruto de <b>Planta Adhesivos</b> (Morteros TX) ·
             Power BI · corte <b>${fechaLarga(A.c)}</b> · millones de CLP.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
          <button class="btn btn--primary btn--sm" data-ai="¿Cómo está el margen de adhesivos?">
            ${UTIL.icon('i-spark', 'ico ico--xs')} Preguntar a Paco AI
          </button>
        </div>
      </div>

      <div class="kpi-row" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        ${tarjetas.map(t => `
          <article class="kpi" style="--kpi-accent:#3B82F6">
            <div class="kpi__label">${UTIL.esc(t.k)}</div>
            <div class="kpi__value"><span class="money">${t.v}</span></div>
            <div class="kpi__meta">${t.d}<span>${UTIL.esc(t.s)}</span></div>
          </article>`).join('')}
      </div>

      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Margen mensual</h2>
            <p class="panel__sub">Últimos 12 meses contra el mismo mes del año anterior · *mes en curso al ${fechaCorta(A.c)}, comparado con los mismos días</p>
          </div>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Mes</th><th class="num">Venta</th><th style="width:22%"></th><th class="num">Margen bruto</th>
              <th class="num">Margen %</th><th class="num">Año anterior</th><th class="num">Diferencia</th>
            </tr></thead>
            <tbody>
              ${A.meses.map(x => `
                <tr>
                  <td>${x.label}</td>
                  <td class="num money">${UTIL.musd(x.cur.v)}</td>
                  <td><div class="biz__track"><i class="biz__fill" style="background:#3B82F6" data-w="${(x.cur.v / maxV) * 100}"></i></div></td>
                  <td class="num money">${UTIL.musd(x.cur.mb)}</td>
                  <td class="num">${x.cur.v ? UTIL.num(x.cur.mg) + '%' : '—'}</td>
                  <td class="num">${x.ant.v ? UTIL.num(x.ant.mg) + '%' : '—'}</td>
                  <td class="num">${x.cur.v && x.ant.v ? pts(x.cur.mg - x.ant.mg) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Margen por familia de producto</h2>
            <p class="panel__sub">Acumulado ${A.y} al ${fechaCorta(A.c)} contra los mismos días de ${A.y - 1} · ordenado por venta</p>
          </div>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Familia</th><th class="num">Venta</th><th class="num">Part.</th><th class="num">Margen %</th>
              <th class="num">Margen % ${A.y - 1}</th><th class="num">Diferencia</th><th class="num">Var. margen $</th>
            </tr></thead>
            <tbody>${top.map(filaFam).join('')}${otros}</tbody>
          </table>
        </div>
        <p class="panel__sub" style="margin-top:12px">Margen bruto = venta menos costo directo, según las medidas del modelo; no es EBITDA.
           Alcance: ${UTIL.esc(PBI.adh.definicion || '')}. Los adhesivos cerámicos y pegamentos en polvo se fabrican en Planta Morteros
           y no están incluidos aquí.</p>
      </section>`;

    requestAnimationFrame(() => $$('[data-w]', root).forEach(el => { el.style.width = el.dataset.w + '%'; }));
  }

  function respAdhesivos() {
    const A = adhDatos(), dMg = A.acum.mg - A.acumAnt.mg;
    const peores = A.familias.filter(f => f.mg !== null && f.mgp !== null)
      .sort((a, b) => (a.mb - a.mbp) - (b.mb - b.mbp)).slice(0, 3);
    return `El margen bruto de <b>Planta Adhesivos</b> acumulado a ${fechaCorta(A.c)} es <b>${UTIL.num(A.acum.mg)}%</b>, ` +
      `contra <b>${UTIL.num(A.acumAnt.mg)}%</b> en el mismo período del año anterior (${dMg >= 0 ? '+' : '−'}${UTIL.num(Math.abs(dMg))} puntos).` +
      kv('Venta acumulada', UTIL.musd(A.acum.v)) + kv('Margen bruto', UTIL.musd(A.acum.mb)) +
      kv('Margen del mes', UTIL.num(A.mes.mg) + '%') +
      'Familias que más margen restan contra el año anterior:' +
      peores.map(f => kv(f.n, UTIL.num(f.mgp) + '% → ' + UTIL.num(f.mg) + '% · ' + UTIL.musd(f.mb - f.mbp))).join('') + pie();
  }

  function alertaAdhesivos() {
    const A = adhDatos(), dMg = A.acum.mg - A.acumAnt.mg;
    if (!A.acumAnt.v || dMg > -2) return null;
    const peor = A.familias.filter(f => f.mg !== null && f.mgp !== null)
      .sort((a, b) => (a.mb - a.mbp) - (b.mb - b.mbp))[0];
    return { prio:'alta', company:'Planta Adhesivos', time:'corte ' + fechaCorta(A.c),
      text:`El margen bruto de Planta Adhesivos baja de ${UTIL.num(A.acumAnt.mg)}% a ${UTIL.num(A.acum.mg)}% en el acumulado.` +
           (peor ? ` La mayor pérdida está en ${peor.n} (${UTIL.num(peor.mgp)}% → ${UTIL.num(peor.mg)}%).` : ''),
      impact:'Margen bruto vs. año anterior', value:UTIL.musd(A.acum.mb - A.acumAnt.mb) };
  }

  /* ======================================================================
     Módulo por sociedad · Empresas → <sociedad>
     Cada sociedad se muestra hasta SU última fecha con venta en el modelo,
     comparada contra los mismos días del año anterior.
     ====================================================================== */
  const delta = d => d === null ? '—' : `<span class="kpi__delta ${UTIL.dir(d)}">${UTIL.pct(d)}</span>`;

  /** Tabla de detalle a partir de filas [nombre, venta, costo, ventaAnt, costoAnt] en pesos. */
  function tablaDetalle(titulo, sub, columna, filas, totalVenta, maximo) {
    if (!filas || !filas.length) return '';
    const orden = filas.map(g => {
      const v = g[1] / 1e6, mb = (g[1] - g[2]) / 1e6, vp = g[3] / 1e6, mbp = (g[3] - g[4]) / 1e6;
      return { n:g[0] || '(sin clasificar)', v, vp, mg:v ? (mb / v) * 100 : null, mgp:vp ? (mbp / vp) * 100 : null };
    }).filter(f => f.v > 0 || f.vp > 0).sort((a, b) => b.v - a.v).slice(0, maximo || 20);

    return `
      <section class="panel">
        <header class="panel__head">
          <div><h2 class="panel__title">${UTIL.esc(titulo)}</h2><p class="panel__sub">${sub}</p></div>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>${UTIL.esc(columna)}</th><th class="num">Venta</th><th class="num">Part.</th>
              <th class="num">Año anterior</th><th class="num">Var.</th>
              <th class="num">Margen %</th><th class="num">Margen % ant.</th><th class="num">Diferencia</th>
            </tr></thead>
            <tbody>
              ${orden.map(f => `
                <tr>
                  <td><span class="co__name">${UTIL.esc(f.n)}</span>
                    ${f.v > 0 && !f.vp ? ' <span class="badge badge--blue">Nuevo</span>' : ''}
                    ${f.mg !== null && f.mg >= 95 ? ' <span class="badge badge--amber">Revisar costo</span>' : ''}</td>
                  <td class="num money">${UTIL.musd(f.v)}</td>
                  <td class="num">${UTIL.num(pctDe(f.v, totalVenta))}%</td>
                  <td class="num money">${f.vp ? UTIL.musd(f.vp) : '—'}</td>
                  <td class="num">${delta(varPct(f.v, f.vp))}</td>
                  <td class="num">${f.mg === null ? '—' : UTIL.num(f.mg) + '%'}</td>
                  <td class="num">${f.mgp === null ? '—' : UTIL.num(f.mgp) + '%'}</td>
                  <td class="num">${f.mg === null || f.mgp === null ? '—' : pts(f.mg - f.mgp)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function renderSociedad(root, e) {
    const S = PBI.soc[e.nombre] || {};
    const c = S.corte || e.ultima, y = +c.slice(0, 4), m = +c.slice(5, 7), cAnt = masAnios(c, -1);
    const uno = new Set([e.i]);
    const acum = suma(uno, iniMes(y, 1), c), acumAnt = suma(uno, iniMes(y - 1, 1), cAnt);
    const mes  = suma(uno, iniMes(y, m), c), mesAnt  = suma(uno, iniMes(y - 1, m), cAnt);
    const mg = pctDe(acum.mb, acum.v), mgAnt = pctDe(acumAnt.mb, acumAnt.v);
    const proy = e.alDia && PBI.proy[e.nombre] ? PBI.proy[e.nombre] / 1e6 : null;

    const meses = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1));
      const yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1, actual = k === 0;
      const hasta = actual ? c : finMes(yy, mm);
      meses.push({ label:MESES[mm - 1] + ' ' + String(yy).slice(2) + (actual ? '*' : ''),
                   cur:suma(uno, iniMes(yy, mm), hasta),
                   ant:suma(uno, iniMes(yy - 1, mm), actual ? masAnios(hasta, -1) : finMes(yy - 1, mm)) });
    }
    const maxV = Math.max.apply(null, meses.map(x => x.cur.v).concat([1]));

    const tarjetas = [
      { k:'Venta acumulada ' + y, v:UTIL.musd(acum.v), d:delta(varPct(acum.v, acumAnt.v)), s:'vs. mismo período ' + (y - 1) },
      { k:'Margen bruto', v:UTIL.musd(acum.mb), d:pts(mg - mgAnt), s:UTIL.num(mg) + '% · era ' + UTIL.num(mgAnt) + '%' },
      { k:'Venta ' + MESES[m - 1] + ' al día ' + +c.slice(8, 10), v:UTIL.musd(mes.v), d:delta(varPct(mes.v, mesAnt.v)),
        s:proy ? 'proyección de cierre ' + UTIL.musd(proy) : 'vs. mismos días ' + (y - 1) },
      { k:'Venta a terceros', v:UTIL.musd(acum.ter), d:delta(varPct(acum.ter, acumAnt.ter)),
        s:UTIL.num(pctDe(acum.ter, acum.v)) + '% de la venta' }
    ];

    const aviso = e.alDia ? '' : `
      <div class="inv-banner inv-banner--warn">
        <span class="inv-banner__ico">${UTIL.icon('i-alert', 'ico ico--xs')}</span>
        <div><b>Sin despachos en el modelo desde el ${fechaLarga(e.ultima)}.</b>
          <div class="inv-banner__d">Las cifras y comparaciones de esta página llegan hasta esa fecha; no reflejan el año completo.</div></div>
      </div>`;
    const periodo = `Acumulado ${y} al ${fechaCorta(c)} contra los mismos días de ${y - 1}`;

    root.innerHTML = `
      <div class="mod-head">
        <div>
          <div class="crumb">Empresas</div>
          <h2 class="mod-title">${UTIL.esc(e.nombre)}</h2>
          <p class="mod-sub">Venta y margen bruto · Power BI · corte <b>${fechaLarga(c)}</b> · millones de CLP.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
          <button class="btn btn--primary btn--sm" data-ai="Analiza el desempeño de ${UTIL.esc(e.nombre)}">
            ${UTIL.icon('i-spark', 'ico ico--xs')} Preguntar a Paco AI
          </button>
        </div>
      </div>
      ${aviso}
      <div class="kpi-row" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        ${tarjetas.map(t => `
          <article class="kpi" style="--kpi-accent:#3B82F6">
            <div class="kpi__label">${UTIL.esc(t.k)}</div>
            <div class="kpi__value"><span class="money">${t.v}</span></div>
            <div class="kpi__meta">${t.d}<span>${UTIL.esc(t.s)}</span></div>
          </article>`).join('')}
      </div>

      <section class="panel">
        <header class="panel__head">
          <div>
            <h2 class="panel__title">Evolución mensual</h2>
            <p class="panel__sub">Últimos 12 meses contra el mismo mes del año anterior · *mes en curso al ${fechaCorta(c)}, comparado con los mismos días</p>
          </div>
        </header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Mes</th><th class="num">Venta</th><th style="width:20%"></th><th class="num">Año anterior</th>
              <th class="num">Var.</th><th class="num">Margen %</th><th class="num">Margen % ant.</th><th class="num">Diferencia</th>
            </tr></thead>
            <tbody>
              ${meses.map(x => `
                <tr>
                  <td>${x.label}</td>
                  <td class="num money">${UTIL.musd(x.cur.v)}</td>
                  <td><div class="biz__track"><i class="biz__fill" style="background:#3B82F6" data-w="${(x.cur.v / maxV) * 100}"></i></div></td>
                  <td class="num money">${x.ant.v ? UTIL.musd(x.ant.v) : '—'}</td>
                  <td class="num">${delta(varPct(x.cur.v, x.ant.v))}</td>
                  <td class="num">${x.cur.v ? UTIL.num(pctDe(x.cur.mb, x.cur.v)) + '%' : '—'}</td>
                  <td class="num">${x.ant.v ? UTIL.num(pctDe(x.ant.mb, x.ant.v)) + '%' : '—'}</td>
                  <td class="num">${x.cur.v && x.ant.v ? pts(pctDe(x.cur.mb, x.cur.v) - pctDe(x.ant.mb, x.ant.v)) : '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </section>

      ${tablaDetalle('Venta por ' + (S.dimension || 'categoría').toLowerCase(), periodo, S.dimension || 'Categoría', S.desglose, acum.v)}
      ${tablaDetalle('Principales clientes', periodo + ' · 15 mayores por venta · incluye empresas relacionadas', 'Cliente', S.clientes, acum.v, 15)}

      <section class="panel">
        <p class="panel__sub">Venta = medida «${UTIL.esc(PBI.meta.medidas.venta)}»; costo = «${UTIL.esc(PBI.meta.medidas.costo)}».
           Margen bruto = venta menos costo directo; no es EBITDA. <b>Revisar costo</b> marca las filas con margen de 95% o más,
           donde el modelo casi no trae costo cargado.</p>
      </section>`;

    requestAnimationFrame(() => $$('[data-w]', root).forEach(el => { el.style.width = el.dataset.w + '%'; }));
  }

  /* ======================================================================
     Producción de Hormigones (m³) y Presupuesto
     Fuentes: modelo "KPI Diario - Hormigones" (m³ y medida Presupuestad) y
     tabla de metas comerciales del BSC (Morteros, por planta).
     ====================================================================== */
  const m3 = n => UTIL.num(n, 0) + ' m³';
  const cumple = p => p === null ? '—'
    : `<span class="badge badge--${p >= 100 ? 'green' : p >= 90 ? 'amber' : 'red'}">${UTIL.num(p, 0)}%</span>`;

  function cabecera(crumb, titulo, sub, pregunta) {
    return `
      <div class="mod-head">
        <div>
          <div class="crumb">${UTIL.esc(crumb)}</div>
          <h2 class="mod-title">${UTIL.esc(titulo)}</h2>
          <p class="mod-sub">${sub}</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
          <button class="btn btn--primary btn--sm" data-ai="${UTIL.esc(pregunta)}">
            ${UTIL.icon('i-spark', 'ico ico--xs')} Preguntar a Paco AI
          </button>
        </div>
      </div>`;
  }

  const tarjetasHtml = lista => `
    <div class="kpi-row" style="grid-template-columns:repeat(${lista.length},minmax(0,1fr))">
      ${lista.map(t => `
        <article class="kpi" style="--kpi-accent:#3B82F6">
          <div class="kpi__label">${UTIL.esc(t.k)}</div>
          <div class="kpi__value">${t.v}</div>
          <div class="kpi__meta">${t.d || ''}<span>${UTIL.esc(t.s)}</span></div>
        </article>`).join('')}
    </div>`;

  function tablaHtml(titulo, sub, cabeceras, filas) {
    return `
      <section class="panel">
        <header class="panel__head"><div><h2 class="panel__title">${UTIL.esc(titulo)}</h2><p class="panel__sub">${sub}</p></div></header>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>${cabeceras.map((h, i) => `<th${i ? ' class="num"' : ''}>${UTIL.esc(h)}</th>`).join('')}</tr></thead>
            <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
  }

  /** Resumen de producción de Hormigones: acumulado, mes en curso y cumplimiento. */
  function prodDatos() {
    const H = PBI.prod, c = H.corte, y = +c.slice(0, 4), m = +c.slice(5, 7);
    const de = (yy, mm) => H.mensual.find(x => x[0] === yy && x[1] === mm) || [yy, mm, 0, 0];
    const cerrados = []; for (let i = 1; i < m; i++) cerrados.push(i);
    const sum = (yy, idx) => cerrados.reduce((s, i) => s + de(yy, i)[idx], 0);
    const mes = de(y, m);
    const acum = sum(y, 2) + mes[2], acumAnt = sum(y - 1, 2) + (H.mesAnteriorMismosDias || 0);
    const meses = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1)), yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1, actual = k === 0;
      const cur = de(yy, mm), ant = actual ? (H.mesAnteriorMismosDias || 0) : de(yy - 1, mm)[2];
      meses.push({ label:MESES[mm - 1] + ' ' + String(yy).slice(2) + (actual ? '*' : ''), actual, m3:cur[2], pres:cur[3], ant });
    }
    return { c, y, m, mes, acum, acumAnt, cerrM3:sum(y, 2), cerrPres:sum(y, 3), meses, hayCerrados:cerrados.length > 0,
             ultimoCerrado:cerrados.length ? MESES[cerrados[cerrados.length - 1] - 1] : '' };
  }

  function renderProduccion(root) {
    const P = prodDatos(), H = PBI.prod;
    const cumplAcum = P.cerrPres ? pctDe(P.cerrM3, P.cerrPres) : null;
    const avance = P.mes[3] ? pctDe(P.mes[2], P.mes[3]) : null;

    /* Plantas: meses cerrados del año contra los mismos meses del año anterior. */
    const plantas = {};
    H.plantas.forEach(x => {
      const p = plantas[x[0]] || (plantas[x[0]] = { n:x[0], zona:x[1], cur:0, ant:0, mes:0 });
      if (x[2] === P.y && x[3] < P.m) p.cur += x[4];
      if (x[2] === P.y - 1 && x[3] < P.m) p.ant += x[4];
      if (x[2] === P.y && x[3] === P.m) p.mes = x[4];
    });
    const lista = Object.keys(plantas).map(k => plantas[k]).filter(p => p.cur || p.ant || p.mes).sort((a, b) => b.cur - a.cur);
    const totalCur = lista.reduce((s, p) => s + p.cur, 0);

    root.innerHTML =
      cabecera('Operaciones', 'Producción · Hormigones',
        `Metros cúbicos despachados por las plantas de hormigón · Power BI (${UTIL.esc(H.fuente)}) · corte <b>${fechaLarga(P.c)}</b>.`,
        '¿Cómo va la producción de las plantas?') +
      tarjetasHtml([
        { k:'Despachado ' + P.y, v:m3(P.acum), d:delta(varPct(P.acum, P.acumAnt)), s:'vs. mismo período ' + (P.y - 1) },
        { k:'Cumplimiento presupuesto', v:cumplAcum === null ? '—' : UTIL.num(cumplAcum, 0) + '%',
          s:P.hayCerrados ? 'Ene – ' + P.ultimoCerrado + ' · ' + m3(P.cerrM3) + ' de ' + m3(P.cerrPres) : 'sin meses cerrados' },
        { k:MESES[P.m - 1] + ' al día ' + +P.c.slice(8, 10), v:m3(P.mes[2]), d:delta(varPct(P.mes[2], H.mesAnteriorMismosDias || 0)), s:'vs. mismos días ' + (P.y - 1) },
        { k:'Avance del presupuesto del mes', v:avance === null ? '—' : UTIL.num(avance, 0) + '%', s:'presupuesto ' + m3(P.mes[3]) }
      ]) +
      tablaHtml('Despacho mensual contra presupuesto',
        'Últimos 12 meses · *mes en curso al ' + fechaCorta(P.c) + ': el presupuesto es del mes completo y el año anterior, de los mismos días',
        ['Mes', 'Despachado', 'Presupuesto', 'Cumplimiento', 'Año anterior', 'Var.'],
        P.meses.map(x => [x.label, m3(x.m3), x.pres ? m3(x.pres) : '—',
          x.pres ? cumple(pctDe(x.m3, x.pres)) + (x.actual ? ' <small>avance</small>' : '') : '—',
          x.ant ? m3(x.ant) : '—', delta(varPct(x.m3, x.ant))])) +
      tablaHtml('Despacho por planta',
        P.hayCerrados ? `Ene – ${P.ultimoCerrado} ${P.y} contra los mismos meses de ${P.y - 1}` : 'Mes en curso',
        ['Planta', 'Zona', 'Acumulado', 'Part.', 'Año anterior', 'Var.', MESES[P.m - 1] + ' en curso'],
        lista.map(p => [`<span class="co__name">${UTIL.esc(p.n)}</span>`, UTIL.esc(p.zona || ''), m3(p.cur),
          UTIL.num(pctDe(p.cur, totalCur)) + '%', p.ant ? m3(p.ant) : '—', delta(varPct(p.cur, p.ant)), m3(p.mes)])) +
      `<section class="panel"><p class="panel__sub">El presupuesto es la medida «${UTIL.esc(H.medidaPresupuesto)}» del modelo y sólo existe para el total
         de Hormigones, no por planta. La producción de las plantas de Morteros, Adhesivos y Pinturas aún no está conectada.</p></section>`;
  }

  /** Metas comerciales de Morteros contra la venta real, por planta. */
  function metasDatos() {
    const M = PBI.metas, c = M.corte, y = +c.slice(0, 4), m = +c.slice(5, 7);
    const val = (arr, yy, mm, pl) => arr.filter(x => x[0] === yy && x[1] === mm && (!pl || x[2] === pl)).reduce((s, x) => s + x[3], 0) / 1e6;
    const conMeta = [...new Set(M.metas.filter(x => x[0] === y && x[3] > 0).map(x => x[2]))].sort();
    const sinMeta = [...new Set(M.ventas.filter(x => x[0] === y && x[3] > 0).map(x => x[2]))].filter(p => p && conMeta.indexOf(p) < 0);
    const plantas = conMeta.map(pl => {
      let v = 0, meta = 0;
      for (let i = 1; i < m; i++) { v += val(M.ventas, y, i, pl); meta += val(M.metas, y, i, pl); }
      return { n:pl, v, meta, mesV:val(M.ventas, y, m, pl), mesMeta:val(M.metas, y, m, pl) };
    });
    const meses = [];
    for (let i = 1; i <= m; i++) {
      const v = conMeta.reduce((s, pl) => s + val(M.ventas, y, i, pl), 0), meta = conMeta.reduce((s, pl) => s + val(M.metas, y, i, pl), 0);
      meses.push({ label:MESES[i - 1] + (i === m ? '*' : ''), actual:i === m, v, meta });
    }
    const tot = plantas.reduce((s, p) => ({ v:s.v + p.v, meta:s.meta + p.meta }), { v:0, meta:0 });
    return { c, y, m, plantas, meses, tot, sinMeta, hayCerrados:m > 1, ultimoCerrado:m > 1 ? MESES[m - 2] : '' };
  }

  function renderPresupuesto(root) {
    let html = cabecera('Finanzas', 'Presupuesto',
      'Cumplimiento contra las metas y presupuestos que existen hoy en Power BI · millones de CLP y m³.',
      '¿Cómo vamos contra el presupuesto?');

    if (PBI.metas) {
      const D = metasDatos(), cum = D.tot.meta ? pctDe(D.tot.v, D.tot.meta) : null;
      html += tarjetasHtml([
        { k:'Morteros TX · cumplimiento de metas', v:cum === null ? '—' : UTIL.num(cum, 0) + '%',
          s:D.hayCerrados ? 'Ene – ' + D.ultimoCerrado + ' ' + D.y : 'sin meses cerrados' },
        { k:'Venta de las plantas con meta', v:`<span class="money">${UTIL.musd(D.tot.v)}</span>`, s:'meta ' + UTIL.musd(D.tot.meta) },
        { k:'Diferencia contra la meta', v:`<span class="money">${UTIL.musd(D.tot.v - D.tot.meta)}</span>`, s:'acumulado de meses cerrados' }
      ]) +
      tablaHtml('Morteros TX · venta contra meta por planta',
        (D.hayCerrados ? `Ene – ${D.ultimoCerrado} ${D.y}` : '') + ' · metas comerciales del BSC · corte ' + fechaLarga(D.c),
        ['Planta', 'Venta', 'Meta', 'Cumplimiento', 'Diferencia', MESES[D.m - 1] + ' en curso', 'Meta del mes', 'Avance'],
        D.plantas.map(p => [`<span class="co__name">${UTIL.esc(p.n)}</span>`, UTIL.musd(p.v), UTIL.musd(p.meta),
          cumple(p.meta ? pctDe(p.v, p.meta) : null), UTIL.musd(p.v - p.meta), UTIL.musd(p.mesV), UTIL.musd(p.mesMeta),
          cumple(p.mesMeta ? pctDe(p.mesV, p.mesMeta) : null)])) +
      tablaHtml('Morteros TX · venta contra meta por mes',
        'Suma de las plantas con meta · *mes en curso: la meta es del mes completo',
        ['Mes', 'Venta', 'Meta', 'Cumplimiento', 'Diferencia'],
        D.meses.map(x => [x.label, UTIL.musd(x.v), UTIL.musd(x.meta),
          cumple(x.meta ? pctDe(x.v, x.meta) : null) + (x.actual ? ' <small>avance</small>' : ''), UTIL.musd(x.v - x.meta)])) +
      `<section class="panel"><p class="panel__sub">Las metas vienen de la tabla de metas comerciales del BSC (suma de todos los ejecutivos,
         activos e inactivos). ${D.sinMeta.length ? 'Sin meta cargada: <b>' + D.sinMeta.map(UTIL.esc).join(', ') + '</b>. ' : ''}
         Falta confirmar que estas metas son el presupuesto oficial de la sociedad.</p></section>`;
    }

    if (PBI.prod) {
      const P = prodDatos();
      html += tablaHtml('Hormigones TX · despacho contra presupuesto (m³)',
        'Presupuesto en volumen del modelo KPI Diario - Hormigones · *mes en curso: avance sobre el presupuesto del mes completo',
        ['Mes', 'Despachado', 'Presupuesto', 'Cumplimiento'],
        P.meses.map(x => [x.label, m3(x.m3), x.pres ? m3(x.pres) : '—',
          x.pres ? cumple(pctDe(x.m3, x.pres)) + (x.actual ? ' <small>avance</small>' : '') : '—']));
    }

    html += `<section class="panel"><p class="panel__sub"><b>Sin presupuesto en Power BI:</b> Hormigones TX en pesos, Cementos TX, Minera TX,
      Distribuidora TX y el consolidado del grupo. Para completarlo hace falta la fuente oficial del presupuesto.</p></section>`;
    root.innerHTML = html;
  }

  function respProduccion() {
    const P = prodDatos(), cum = P.cerrPres ? pctDe(P.cerrM3, P.cerrPres) : null;
    return `Hormigones lleva <b>${m3(P.acum)}</b> despachados en ${P.y}` +
      (varPct(P.acum, P.acumAnt) === null ? '.' : ` (<b>${UTIL.pct(varPct(P.acum, P.acumAnt), 1, true)}</b> contra el mismo período del año anterior).`) +
      (cum === null ? '' : kv('Cumplimiento del presupuesto, Ene – ' + P.ultimoCerrado, UTIL.num(cum, 0) + '%')) +
      kv(MESES[P.m - 1] + ' al día ' + +P.c.slice(8, 10), m3(P.mes[2]) + ' de ' + m3(P.mes[3]) + ' presupuestados') +
      'Sólo tengo producción de las plantas de hormigón; la de Morteros, Adhesivos y Pinturas aún no está conectada.' +
      `<br><small>Fuente: Power BI · ${UTIL.esc(PBI.prod.fuente)} · corte ${fechaLarga(P.c)}.</small>`;
  }

  function respPresupuesto() {
    let t = '';
    if (PBI.metas) {
      const D = metasDatos();
      t += `<b>Morteros TX</b> cumple <b>${UTIL.num(pctDe(D.tot.v, D.tot.meta), 0)}%</b> de sus metas comerciales (Ene – ${D.ultimoCerrado}).` +
        D.plantas.map(p => kv(p.n, UTIL.num(pctDe(p.v, p.meta), 0) + '% · ' + UTIL.musd(p.v) + ' de ' + UTIL.musd(p.meta))).join('');
    }
    if (PBI.prod) {
      const P = prodDatos();
      if (P.cerrPres) t += `<b>Hormigones TX</b> cumple <b>${UTIL.num(pctDe(P.cerrM3, P.cerrPres), 0)}%</b> de su presupuesto en volumen (${m3(P.cerrM3)} de ${m3(P.cerrPres)}).<br>`;
    }
    return t + 'No hay presupuesto en Power BI para Hormigones en pesos, Cementos, Minera, Distribuidora ni para el consolidado.' +
      '<br><small>Fuente: Power BI · metas comerciales del BSC y KPI Diario - Hormigones.</small>';
  }

  /* ======================================================================
     Tareas · pendientes reales de datos e integración (Personal → Tareas)
     ====================================================================== */
  function tareasReales() {
    const t = [];
    const add = (title, description, priority) =>
      t.push({ title, description, owner:DATA.user.name, due:'Pendiente', priority, status:'Abierta' });

    PBI.info.filter(e => !e.alDia).forEach(e => add(
      `Regularizar los datos de ${e.nombre} en Power BI`,
      `El modelo no registra despachos de ${e.nombre} desde el ${fechaLarga(e.ultima)}. Confirmar con quien mantiene el modelo ` +
      'si la operación pasó a otra sociedad o sistema y dejar la fuente al día.', 'Alta'));

    PBI.info.forEach(e => ((PBI.soc[e.nombre] || {}).desglose || []).forEach(d => {
      if (d[1] >= 500e6 && (d[1] - d[2]) / d[1] >= 0.95) add(
        `Cargar el costo de ${d[0]} en ${e.nombre}`,
        `${d[0]} registra ${UTIL.musd(d[1] / 1e6)} de venta este año con sólo ${UTIL.musd(d[2] / 1e6)} de costo en el modelo. ` +
        `Mientras no se cargue, el margen de ${e.nombre} aparece inflado.`, 'Alta');
    }));

    if (PBI.metas) add('Confirmar y completar el presupuesto',
      'Están conectadas las metas comerciales de Morteros (BSC) y el presupuesto en m³ de Hormigones. Falta confirmar que esas metas son el ' +
      'presupuesto oficial y obtener el de Hormigones en pesos, Cementos, Minera, Distribuidora y el consolidado.', 'Media');
    else add('Conectar presupuesto al Orquestador',
      'No hay presupuesto cargado. Falta definir la fuente oficial y conectarla.', 'Media');

    if (PBI.prod) add('Conectar la producción de Morteros, Adhesivos y Pinturas',
      'Está conectado el despacho en m³ de las plantas de hormigón. Falta la producción de las demás plantas.', 'Media');
    else add('Conectar producción al Orquestador',
      'No hay datos de producción cargados. Falta definir la fuente y conectarla.', 'Media');

    add('Conectar cuentas por cobrar al Orquestador',
      'En Power BI sólo hay cartera de la Comercializadora, con facturas hasta julio de 2026. Falta la fuente de la cartera de clientes del grupo.', 'Media');
    add('Conectar caja al Orquestador',
      'No hay ningún modelo de Power BI con saldos de caja o bancos. Tiene que venir de tesorería u otra fuente.', 'Media');
    return t;
  }

  function aplicarTareas() {
    DATA.tasks = tareasReales();
    const altas = DATA.tasks.filter(x => x.priority === 'Alta').length;
    const p = (DATA.personal || []).find(x => x.goto === 'tareas');
    if (p) { p.n = String(DATA.tasks.length); p.s = altas + ' de prioridad alta'; }
    UI.renderPersonal();
  }

  /** Reemplaza el grupo "Empresas" del menú por las sociedades reales del modelo. */
  function navegacionSociedades() {
    const ytd = rango('ytd');
    const orden = PBI.info.slice().sort((a, b) =>
      suma(new Set([b.i]), ytd.d, ytd.h).v - suma(new Set([a.i]), ytd.d, ytd.h).v);
    const g = DATA.nav.find(x => x.id === 'empresas');
    if (g) g.items = orden.map(e => ({ id:'e-' + e.id, name:e.nombre }));

    const existe = id => DATA.nav.some(x => x.items.some(i => i.id === id));
    orden.forEach(e => {
      const r = root => renderSociedad(root, e);
      UI.moduleRenderers['e-' + e.id] = r;
      if (existe(e.id)) UI.moduleRenderers[e.id] = r;       // p. ej. Grupo TX → Hormigones / Morteros
    });
    UI.renderNav();
  }

  /* ======================================================================
     Aplicación sobre DATA
     ====================================================================== */
  function aplicar() {
    const filas = sociedades();
    DATA.kpis      = kpis();
    DATA.series    = serie();
    DATA.companies = filas;
    DATA.business  = negocios(filas);

    /* En "Último día" la comparación es contra la semana anterior, no anual. */
    const th = $$('#companyTable thead th')[5];
    if (th) th.textContent = rango(STATE.period).cmp === 'YoY' ? 'Var. YoY' : 'Var. semana';
  }

  function resumenModulo() {
    const k = DATA.kpis;
    return [
      { k:'Ventas ' + UTIL.period().ctx, v:UTIL.musd(k[0].value), d:k[0].delta, s:k[0].deltaLabel },
      { k:'Margen bruto',                v:UTIL.musd(k[1].value), d:k[1].delta, s:k[1].deltaLabel },
      { k:k[3].label,                    v:UTIL.musd(k[3].value), d:k[3].delta, s:k[3].deltaLabel },
      { k:'Registros leídos de Power BI', v:UTIL.num(PBI.filas.length, 0), d:0, s:'corte ' + fechaCorta(PBI.corte) }
    ];
  }

  function validar(json) {
    if (!json || !Array.isArray(json.filas) || !json.filas.length) throw new Error('El archivo no trae filas.');
    if (!Array.isArray(json.empresas) || !json.empresas.length) throw new Error('El archivo no trae la lista de empresas.');
    if (!json.meta || !/^\d{4}-\d{2}-\d{2}$/.test(json.meta.corte || '')) throw new Error('El archivo no trae la fecha de corte.');
    return json;
  }

  async function iniciar() {
    if (typeof DATA === 'undefined' || typeof UI === 'undefined') {
      console.error('[Power BI] script.js no está cargado.');
      return;
    }

    /* Dos vías de carga: data-real/powerbi-data.js (una etiqueta <script>, que
       funciona también al abrir index.html directo desde el disco) y, si no
       está, el JSON por fetch (requiere servir el proyecto por HTTP). */
    let json;
    try {
      if (window.ORQUESTADOR_PBI) {
        json = validar(window.ORQUESTADOR_PBI);
      } else {
        const res = await fetch(DATA_URL, { cache:'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        json = validar(await res.json());
      }
    } catch (e) {
      console.info('[Power BI] Sin datos reales (' + DATA_URL + ': ' + e.message + '). Se mantienen los datos simulados.');
      return;
    }

    PBI.meta = json.meta; PBI.empresas = json.empresas; PBI.filas = json.filas;
    PBI.proy = json.proyeccionMes || {}; PBI.corte = json.meta.corte;
    const a = json.adhesivos;
    PBI.adh = a && Array.isArray(a.filas) && a.filas.length && Array.isArray(a.grupos) && a.corte ? a : null;
    PBI.soc = json.sociedades || {};
    prepararSociedades();
    navegacionSociedades();
    if (PBI.adh) UI.moduleRenderers.adhesivos = renderAdhesivos;

    const p = json.produccionHormigones, mt = json.metasMorteros;
    PBI.prod  = p && Array.isArray(p.mensual) && p.mensual.length && p.corte ? p : null;
    PBI.metas = mt && Array.isArray(mt.metas) && mt.metas.length && mt.corte ? mt : null;
    if (PBI.prod) { UI.moduleRenderers.produccion = renderProduccion; UI.moduleRenderers['produccion-g'] = renderProduccion; }
    if (PBI.prod || PBI.metas) UI.moduleRenderers.presupuesto = renderPresupuesto;

    DATA.real     = true;
    DATA.moneda   = 'CLP';
    DATA.terms    = { ebitda:'Margen bruto', margen:'Margen bruto %', presupuesto:'Año anterior',
                      forecast:'Proyección de cierre', cumpl:'vs. año anterior' };
    DATA.periods  = periodos();
    DATA.entities = entidades();
    if (!DATA.entities.some(e => e.id === STATE.entity)) STATE.entity = 'consolidado';
    DATA.moduleMini = resumenModulo;

    DATA.alerts        = alertas();
    DATA.briefing      = resumen();
    DATA.notifications = notificaciones(DATA.alerts);

    /* Cada render recalcula los bloques para el período y perímetro vigentes. */
    const renderAll = UI.renderAll;
    UI.renderAll = () => { aplicar(); renderAll(); };

    rotular();
    aplicarTareas();
    UI.renderBriefing();
    UI.renderNotifications();
    UI.renderAll();
    conectarAI();

    console.log('%c[Power BI] Datos reales cargados · corte ' + PBI.corte + ' · ' + PBI.filas.length + ' filas',
                'color:#19C37D');
  }

  iniciar();

})();
