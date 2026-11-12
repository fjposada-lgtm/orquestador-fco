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

  const PBI = { meta:null, empresas:[], filas:[], proy:{}, corte:'', info:[], cache:new Map() };

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

    let json;
    try {
      const res = await fetch(DATA_URL, { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      json = validar(await res.json());
    } catch (e) {
      console.info('[Power BI] Sin datos reales (' + DATA_URL + ': ' + e.message + '). Se mantienen los datos simulados.');
      return;
    }

    PBI.meta = json.meta; PBI.empresas = json.empresas; PBI.filas = json.filas;
    PBI.proy = json.proyeccionMes || {}; PBI.corte = json.meta.corte;
    prepararSociedades();

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
    UI.renderBriefing();
    UI.renderNotifications();
    UI.renderAll();
    conectarAI();

    console.log('%c[Power BI] Datos reales cargados · corte ' + PBI.corte + ' · ' + PBI.filas.length + ' filas',
                'color:#19C37D');
  }

  iniciar();

})();
