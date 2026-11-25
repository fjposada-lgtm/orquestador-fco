/* ==========================================================================
   ORQUESTADOR PACO · Executive Command Center
   --------------------------------------------------------------------------
   Arquitectura:
     1. DATA    → capa de datos simulada. Punto único de reemplazo por APIs.
     2. STATE   → estado de la aplicación (vista, período, perímetro, privacidad).
     3. UTIL    → formateo y helpers.
     4. UI      → render de cada bloque de interfaz.
     5. CHARTS  → capa de gráficos (Chart.js + fallback nativo).
     6. AI      → motor conversacional simulado (mock).
     7. EVENTS  → cableado de interacciones.
     8. BOOT    → arranque.

   NOTA DE INTEGRACIÓN
   Cada objeto de DATA está pensado como el contrato de respuesta de un
   endpoint. Para conectar a Power BI / ERP / CRM / SQL basta con sustituir
   DATA.<bloque> por el resultado de una llamada asíncrona y volver a invocar
   UI.renderAll(). Ninguna función de UI depende de datos globales fuera de
   DATA y STATE.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. DATA
   ========================================================================== */
const DATA = {

  /* --- Usuario ------------------------------------------------------- */
  user: {
    name: 'Francisco',
    fullName: 'Francisco Posada',
    initials: 'FP',
    role: 'Presidente Ejecutivo',
    group: 'Grupo TX'
  },

  /* --- Períodos ------------------------------------------------------- */
  periods: [
    { id:'hoy',        label:'Hoy',        hint:'01 sep',        factor:0.0035, ctx:'del día' },
    { id:'mes',        label:'Mes',        hint:'Septiembre',    factor:0.0919, ctx:'del mes' },
    { id:'trimestre',  label:'Trimestre',  hint:'Q3 2026',       factor:0.2680, ctx:'del trimestre' },
    { id:'ytd',        label:'YTD',        hint:'Ene – Sep',     factor:1.0000, ctx:'acumulado' },
    { id:'ano',        label:'Año',        hint:'2026 proy.',    factor:1.3180, ctx:'proyectado año' }
  ],

  /* --- Perímetros de consolidación ------------------------------------ */
  entities: [
    { id:'consolidado', label:'Grupo Consolidado', hint:'8 sociedades', factor:1.000, margin:14.6, scope:'all' },
    { id:'grupotx',     label:'Grupo TX',          hint:'Core',         factor:0.812, margin:14.9, scope:'tx' },
    { id:'hormigones',  label:'Hormigones',        hint:'Línea',        factor:0.564, margin:12.1, scope:'hormigones' },
    { id:'chile',       label:'Chile',             hint:'País',         factor:0.642, margin:15.5, scope:'CL' },
    { id:'peru',        label:'Perú',              hint:'País',         factor:0.169, margin:13.4, scope:'PE' },
    { id:'otras',       label:'Otras Empresas',    hint:'No core',      factor:0.188, margin:22.4, scope:'otras' }
  ],

  /* --- Serie mensual base (Grupo Consolidado, MUSD) -------------------- */
  series: {
    labels:      ['Oct','Nov','Dic','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep'],
    ventas:      [ 9.4, 9.9, 9.4, 10.1, 10.0, 11.2, 10.6, 11.4, 11.9, 11.5, 11.2, 11.8],
    ebitda:      [1.28,1.42,1.31, 1.45, 1.44, 1.68, 1.52, 1.69, 1.79, 1.71, 1.66, 1.75],
    presupuesto: [ 9.8, 9.6, 9.9, 10.0, 10.2, 10.6, 10.9, 11.0, 11.4, 11.5, 11.4, 11.5],
    forecast:    [ 9.5, 9.8, 9.6, 10.0, 10.3, 10.9, 10.8, 11.3, 11.7, 11.6, 11.9, 12.3]
  },

  /* --- KPIs de cabecera ------------------------------------------------ */
  kpis: [
    { id:'ventas',    label:'Ventas Grupo',       value:128.4, unit:'musd', delta:12.8, deltaLabel:'YoY',
      accent:'#3B82F6', bar:88,  stock:false, tip:'Ventas consolidadas del grupo, netas de IVA',
      ask:'¿Cómo van las ventas del grupo?' },
    { id:'ebitda',    label:'EBITDA',             value:18.7,  unit:'musd', delta:9.4,  deltaLabel:'14,6% margen',
      accent:'#19C37D', bar:73,  stock:false, tip:'EBITDA consolidado antes de partidas no recurrentes',
      ask:'¿Cuál es nuestro EBITDA proyectado?' },
    { id:'ventasmes', label:'Ventas Mes',         value:11.8,  unit:'musd', delta:3.0,  deltaLabel:'103% presupuesto',
      accent:'#19C37D', bar:103, stock:false, forcePeriod:'mes', tip:'Ventas del mes en curso vs. presupuesto',
      ask:'¿Cómo van las ventas este mes?' },
    { id:'caja',      label:'Caja',               value:21.4,  unit:'musd', delta:6.2,  deltaLabel:'vs. mes anterior',
      accent:'#3B82F6', bar:64,  stock:true,  tip:'Disponible consolidado + equivalentes de efectivo',
      ask:'¿Cómo está nuestra posición de caja?' },
    { id:'cxc',       label:'Cuentas por Cobrar', value:16.2,  unit:'musd', delta:-4.8, deltaLabel:'DSO 47 días', invert:true,
      accent:'#FFB020', bar:58,  stock:true,  tip:'Cartera total. 8,4% vencida a más de 60 días',
      ask:'¿Qué clientes están atrasados?' },
    { id:'produccion',label:'Producción',         value:94,    unit:'pct',  delta:-1.4, deltaLabel:'cumplimiento plan',
      accent:'#FFB020', bar:94,  stock:true,  fixed:true, tip:'Cumplimiento del plan de producción del grupo',
      ask:'¿Cómo va la producción de las plantas?' }
  ],

  /* --- Ventas por línea de negocio ------------------------------------- */
  business: [
    { name:'Hormigones',        value:72.4, color:'#3B82F6', delta:9.4,  margin:7.8  },
    { name:'Morteros',          value:29.8, color:'#19C37D', delta:14.2, margin:16.4 },
    { name:'Adhesivos',         value:9.7,  color:'#8B7FF0', delta:6.1,  margin:11.2 },
    { name:'Pinturas',          value:8.1,  color:'#FFB020', delta:18.6, margin:21.7 },
    { name:'Químicos',          value:5.2,  color:'#4FC3D9', delta:22.4, margin:24.1 },
    { name:'Impermeabilizantes',value:3.2,  color:'#64798F', delta:-3.1, margin:14.8 }
  ],

  /* --- Semáforo de empresas -------------------------------------------- */
  companies: [
    { name:'Grupo TX Chile',        code:'TXC', tag:'Consolidado Chile', country:'CL', groups:['all','tx','CL'],
      sales:82.4, ebitda:12.8, margin:15.5, budget:104, yoy:11.2, status:'green' },
    { name:'TX Perú',               code:'TXP', tag:'Consolidado Perú',  country:'PE', groups:['all','tx','PE'],
      sales:21.7, ebitda:2.9,  margin:13.4, budget:98,  yoy:24.1, status:'amber' },
    { name:'Hormigones Transex',    code:'HTX', tag:'Hormigón premezclado', country:'CL', groups:['all','tx','CL','hormigones'],
      sales:74.2, ebitda:5.8,  margin:7.8,  budget:101, yoy:9.4,  status:'green' },
    { name:'Cementos Transex',      code:'CTX', tag:'Cemento y morteros', country:'CL', groups:['all','tx','CL'],
      sales:18.6, ebitda:3.4,  margin:18.3, budget:106, yoy:14.8, status:'green' },
    { name:'Inmobiliaria Los Silos',code:'ILS', tag:'Renta inmobiliaria', country:'CL', groups:['all','CL','otras'],
      sales:8.3,  ebitda:3.1,  margin:37.3, budget:92,  yoy:-4.2, status:'red' },
    { name:'Centauro',              code:'CEN', tag:'Logística y transporte', country:'CL', groups:['all','CL','otras'],
      sales:12.4, ebitda:1.6,  margin:12.9, budget:97,  yoy:6.1,  status:'amber' },
    { name:'Agrícola San Rafael',   code:'ASR', tag:'Agroindustrial', country:'CL', groups:['all','CL','otras'],
      sales:4.2,  ebitda:0.6,  margin:14.3, budget:88,  yoy:-2.8, status:'red' },
    { name:'Inversiones TX',        code:'INV', tag:'Portafolio financiero', country:'CL', groups:['all','CL','otras'],
      sales:3.1,  ebitda:2.4,  margin:77.4, budget:112, yoy:18.6, status:'green' }
  ],

  /* --- Alertas ejecutivas ----------------------------------------------- */
  alerts: [
    { prio:'alta', company:'Integraciones', time:'ahora',
      text:'Mantener abierta la integración pendiente de Power BI y ERP para profundizar ventas, márgenes, cartera, producción, proyectos, patrimonio y agenda.',
      impact:'Pendiente', value:'Datos transaccionales exactos' },
    { prio:'alta', company:'Cementos Transex', time:'hace 2 h',
      text:'El margen de adhesivos cayó 2,8 puntos en el trimestre por alza del costo de resinas.',
      impact:'Impacto estimado', value:'−US$ 1,1 M EBITDA anualizado' },
    { prio:'alta', company:'Hormigones Transex', time:'hace 4 h',
      text:'Cliente Constructora X mantiene US$ 680.000 vencidos a más de 90 días.',
      impact:'Exposición', value:'US$ 680 K en riesgo' },
    { prio:'alta', company:'Grupo TX Chile', time:'ayer',
      text:'El costo del cemento subió 6,2% y aún no se ha trasladado a lista de precios.',
      impact:'Impacto mensual', value:'−US$ 340 K margen' },
    { prio:'media', company:'Planta Santiago', time:'hace 6 h',
      text:'La planta Santiago está operando al 91% de capacidad con dos mixers en mantención.',
      impact:'Capacidad ociosa', value:'9% · US$ 210 K/mes' },
    { prio:'media', company:'Operaciones', time:'hace 8 h',
      text:'El inventario del aditivo superplastificante X tiene cobertura de solo 9 días.',
      impact:'Riesgo de quiebre', value:'3 plantas afectadas' },
    { prio:'media', company:'Centauro', time:'ayer',
      text:'El costo logístico por m³ subió 4,1% por alza de combustible y sobretiempo.',
      impact:'Impacto trimestral', value:'−US$ 155 K' },
    { prio:'oportunidad', company:'TX Perú', time:'hoy',
      text:'Las ventas de Perú crecieron 24% en el mes, impulsadas por infraestructura pública.',
      impact:'Upside anualizado', value:'+US$ 2,6 M ventas' },
    { prio:'oportunidad', company:'Comercial', time:'hoy',
      text:'Nuevo proyecto minero en evaluación podría generar US$ 4,2 M en ventas a 18 meses.',
      impact:'Potencial', value:'+US$ 4,2 M · margen 16%' },
    { prio:'oportunidad', company:'Pinturas', time:'hace 1 día',
      text:'Pinturas crece 18,6% con el mejor margen del grupo. Existe capacidad instalada disponible.',
      impact:'Upside con CAPEX bajo', value:'+US$ 1,8 M ventas' }
  ],

  /* --- Agenda ------------------------------------------------------------ */
  agenda: [
    { time:'09:00', title:'Comité Comercial',            meta:'Sala Directorio · 6 asistentes', tag:'Comercial',  color:'#3B82F6' },
    { time:'11:00', title:'Revisión TX Perú',            meta:'Videollamada · Gerencia Perú',   tag:'Operación',  color:'#19C37D' },
    { time:'13:00', title:'Almuerzo Cliente Estratégico',meta:'Constructora Andes · CEO',       tag:'Comercial',  color:'#3B82F6' },
    { time:'16:00', title:'Directorio',                  meta:'Presencial · 9 directores',      tag:'Gobierno',   color:'#FFB020' },
    { time:'18:00', title:'Entrenamiento',               meta:'Personal · 60 min',              tag:'Personal',   color:'#8B7FF0' }
  ],

  /* --- Briefing IA ------------------------------------------------------- */
  briefing: 'Grupo TX está operando <b>sobre presupuesto</b>. Las ventas acumuladas crecen <b>12,8%</b>, ' +
            'mientras que el EBITDA se mantiene en <b>14,6%</b> de margen. <b>Perú presenta el mayor ' +
            'crecimiento del grupo (+24,1%)</b>. El principal punto de atención es una caída del margen ' +
            'en adhesivos de 2,8 puntos y un aumento sostenido de las cuentas por cobrar durante las ' +
            'últimas tres semanas, con el DSO subiendo de 42 a 47 días.',

  /* --- Mapa / mercados --------------------------------------------------- */
  markets: [
    { id:'cl', name:'Chile',          sub:'8 plantas · 4 sociedades',   value:'US$ 82,4 M', delta:11.2,  state:'op',    x:33, y:84 },
    { id:'pe', name:'Perú',           sub:'3 plantas · Lima y Arequipa',value:'US$ 21,7 M', delta:24.1,  state:'op',    x:26, y:56 },
    { id:'ca', name:'Centroamérica',  sub:'Panamá · due diligence',     value:'En evaluación', delta:null, state:'exp',  x:19, y:24 },
    { id:'cb', name:'Caribe',         sub:'Rep. Dominicana · scouting', value:'Prospecto',  delta:null,  state:'eval',  x:34, y:15 },
    { id:'sa', name:'Sudamérica',     sub:'Colombia · Ecuador',         value:'Prospecto',  delta:null,  state:'eval',  x:31, y:38 }
  ],

  /* --- Proyectos estratégicos -------------------------------------------- */
  projects: [
    { name:'Expansión Perú',        owner:'R. Vidal',    date:'Dic 2026', progress:72, status:'green', risk:'Bajo',  capex:'US$ 12,4 M' },
    { name:'Nueva Planta Rancagua', owner:'M. Cortés',   date:'Mar 2027', progress:48, status:'amber', risk:'Medio', capex:'US$ 18,2 M' },
    { name:'Entrada Centroamérica', owner:'F. Posada',   date:'Jun 2027', progress:22, status:'amber', risk:'Alto',  capex:'US$ 8,0 M' },
    { name:'Prefabricados',         owner:'J. Herrera',  date:'Sep 2026', progress:88, status:'green', risk:'Bajo',  capex:'US$ 3,6 M' },
    { name:'Fibrocemento',          owner:'A. Muñoz',    date:'Feb 2027', progress:35, status:'red',   risk:'Alto',  capex:'US$ 2,8 M' },
    { name:'Digitalización ERP',    owner:'C. Reyes',    date:'Nov 2026', progress:64, status:'green', risk:'Medio', capex:'US$ 1,4 M' },
    { name:'IA Grupo TX',           owner:'F. Posada',   date:'Dic 2026', progress:41, status:'green', risk:'Bajo',  capex:'US$ 0,4 M' }
  ],

  /* --- Patrimonio -------------------------------------------------------- */
  wealth: [
    { k:'Valor Empresas',       v:186.4, d:9.8 },
    { k:'Activos Inmobiliarios',v:64.2,  d:4.1 },
    { k:'Inversiones',          v:28.7,  d:12.6 },
    { k:'Liquidez',             v:11.3,  d:-2.4 },
    { k:'Deuda',                v:-52.8, d:-6.1 }
  ],
  wealthTotal: { k:'Patrimonio Neto', v:237.8, d:8.4 },

  /* --- Módulos personales ------------------------------------------------ */
  personal: [
    { k:'Agenda',        n:'5',    s:'reuniones hoy',   icon:'i-calendar', goto:'agenda' },
    { k:'Correo',        n:'12',   s:'requieren respuesta', icon:'i-mail', goto:'correo' },
    { k:'Tareas',        n:'8',    s:'1 alerta abierta',icon:'i-check',    goto:'tareas' },
    { k:'Documentos',    n:'4',    s:'esperan tu firma',icon:'i-doc',      goto:'documentos' },
    { k:'Viajes',        n:'Lima', s:'14–16 sep',       icon:'i-plane',    goto:'viajes' },
    { k:'Entrenamiento', n:'4/5',  s:'sesiones semana', icon:'i-heart',    goto:'entrenamiento' },
    { k:'Objetivos',     n:'68%',  s:'avance anual',    icon:'i-target',   goto:'objetivos' },
    { k:'Familia',       n:'2',    s:'recordatorios',   icon:'i-user',     goto:'familia' }
  ],

  /* --- Tareas personales ----------------------------------------------- */
  tasks: [
    {
      title:'Mantener abierta la integración pendiente de Power BI y ERP',
      description:'Mantener abierta la alerta sobre la integración pendiente de Power BI y ERP para profundizar ventas, márgenes, cartera, producción, proyectos, patrimonio y agenda con datos transaccionales.',
      owner:'Francisco',
      due:'Hoy',
      priority:'Alta',
      status:'Abierta'
    }
  ],

  /* --- Notificaciones ---------------------------------------------------- */
  notifications: [
    { type:'amber', icon:'i-alert',  t:'Alerta abierta: integración pendiente de Power BI y ERP', m:'Orquestador · ahora', unread:true },
    { type:'red',   icon:'i-alert',  t:'Cartera vencida sobre umbral: Constructora X supera US$ 680 K', m:'Finanzas · hace 12 min', unread:true },
    { type:'amber', icon:'i-factory',t:'Planta Santiago bajo 92% de capacidad por segunda semana',      m:'Operaciones · hace 1 h',  unread:true },
    { type:'green', icon:'i-pulse',  t:'TX Perú cerró el mes 24% sobre el año anterior',                m:'Comercial · hace 2 h',    unread:true },
    { type:'blue',  icon:'i-doc',    t:'4 documentos esperan tu firma electrónica',                     m:'Legal · hace 3 h',        unread:true },
    { type:'amber', icon:'i-cart',   t:'Cotización de cemento vence en 48 horas',                       m:'Compras · hace 5 h',      unread:true },
    { type:'blue',  icon:'i-calendar',t:'Directorio de hoy 16:00 · carpeta disponible',                 m:'Agenda · hace 6 h',       unread:true }
  ],

  /* --- Navegación --------------------------------------------------------- */
  nav: [
    { id:'inicio', name:'Inicio', icon:'i-home', open:true, items:[
      { id:'home', name:'Executive Home', view:'home' }
    ]},
    { id:'grupo', name:'Grupo TX', icon:'i-building', source:'Power BI · ERP', items:[
      { id:'resumen', name:'Resumen Ejecutivo' }, { id:'ventas', name:'Ventas' },
      { id:'finanzas-g', name:'Finanzas' }, { id:'ebitda', name:'EBITDA' },
      { id:'produccion-g', name:'Producción' }, { id:'hormigones', name:'Hormigones' },
      { id:'morteros', name:'Morteros' }, { id:'adhesivos', name:'Adhesivos' },
      { id:'pinturas', name:'Pinturas' }, { id:'quimicos', name:'Químicos' },
      { id:'impermeabilizantes', name:'Impermeabilizantes' }, { id:'chile', name:'Chile' },
      { id:'peru', name:'Perú' }, { id:'expansion', name:'Expansión Internacional' }
    ]},
    { id:'comercial', name:'Comercial', icon:'i-briefcase', source:'CRM · ERP', items:[
      { id:'pipeline', name:'Pipeline Comercial' }, { id:'clientes', name:'Clientes' },
      { id:'grandes-cuentas', name:'Grandes Cuentas' }, { id:'vendedores', name:'Vendedores' },
      { id:'productos', name:'Productos' }, { id:'precios', name:'Precios' },
      { id:'margen-producto', name:'Margen por Producto' }, { id:'cotizaciones', name:'Cotizaciones' }
    ]},
    { id:'operaciones', name:'Operaciones', icon:'i-factory', source:'MES · SCADA · ERP', items:[
      { id:'produccion', name:'Producción' }, { id:'plantas', name:'Plantas' },
      { id:'capacidad', name:'Capacidad' }, { id:'stock', name:'Stock' },
      { id:'inventarios', name:'Inventarios' }, { id:'despachos', name:'Despachos' },
      { id:'logistica', name:'Logística' }, { id:'camiones', name:'Camiones' },
      { id:'mantencion', name:'Mantención' }, { id:'calidad', name:'Calidad' }
    ]},
    { id:'compras', name:'Compras', icon:'i-cart', source:'ERP · Portal proveedores', items:[
      { id:'compras', name:'Compras' }, { id:'cemento', name:'Cemento' },
      { id:'arena', name:'Arena' }, { id:'materias-primas', name:'Materias Primas' },
      { id:'proveedores', name:'Proveedores' }, { id:'costos', name:'Costos' },
      { id:'contratos', name:'Contratos' }
    ]},
    { id:'finanzas', name:'Finanzas', icon:'i-finance', source:'Contabilidad · SQL · Tesorería', items:[
      { id:'eerr', name:'Estado de Resultados' }, { id:'balance', name:'Balance' },
      { id:'cashflow', name:'Cash Flow' }, { id:'caja', name:'Caja' },
      { id:'deuda', name:'Deuda' }, { id:'cxc', name:'Cuentas por Cobrar' },
      { id:'cxp', name:'Cuentas por Pagar' }, { id:'presupuesto', name:'Presupuesto' },
      { id:'forecast', name:'Forecast' }, { id:'capex', name:'CAPEX' }
    ]},
    { id:'bi', name:'Inteligencia de Negocio', icon:'i-pulse', source:'Power BI · Modelos IA', items:[
      { id:'powerbi', name:'Power BI' }, { id:'kpis', name:'KPIs' },
      { id:'reportes', name:'Reportes' }, { id:'forecast-ia', name:'Forecast IA' },
      { id:'alertas', name:'Alertas' }, { id:'margenes', name:'Análisis de Márgenes' },
      { id:'competitivo', name:'Análisis Competitivo' }
    ]},
    { id:'empresas', name:'Empresas', icon:'i-grid', source:'Consolidación societaria', items:[
      { id:'e-grupo', name:'Grupo TX' }, { id:'e-hormigones', name:'Hormigones Transex' },
      { id:'e-cementos', name:'Cementos Transex' }, { id:'e-inmobiliaria', name:'Inmobiliaria Los Silos' },
      { id:'e-centauro', name:'Centauro' }, { id:'e-agricola', name:'Agrícola San Rafael' },
      { id:'e-inversiones', name:'Inversiones' },
      { id:'e-add', name:'Agregar compañía', add:true }
    ]},
    { id:'patrimonio', name:'Patrimonio', icon:'i-diamond', source:'Family office · Valorizaciones', items:[
      { id:'monitor-inversiones', name:'Monitor de Inversiones' },
      { id:'p-resumen', name:'Resumen Patrimonial' }, { id:'p-empresas', name:'Empresas' },
      { id:'p-propiedades', name:'Propiedades' }, { id:'p-terrenos', name:'Terrenos' },
      { id:'p-inversiones', name:'Inversiones' }, { id:'p-liquidez', name:'Liquidez' },
      { id:'p-deuda', name:'Deuda' }, { id:'p-valorizaciones', name:'Valorizaciones' }
    ]},
    { id:'personal', name:'Personal', icon:'i-user', source:'Microsoft 365 · Google Workspace', items:[
      { id:'agenda', name:'Agenda' }, { id:'correo', name:'Correo' },
      { id:'tareas', name:'Tareas' }, { id:'documentos', name:'Documentos' },
      { id:'viajes', name:'Viajes' }, { id:'familia', name:'Familia' },
      { id:'salud', name:'Salud' }, { id:'entrenamiento', name:'Entrenamiento' },
      { id:'objetivos', name:'Objetivos' }
    ]},
    { id:'ia', name:'IA', icon:'i-spark', source:'Modelos generativos · RAG corporativo', items:[
      { id:'asistente', name:'Asistente Ejecutivo', ai:true },
      { id:'preguntar', name:'Preguntar a Paco AI', ai:true },
      { id:'analizar-empresas', name:'Analizar Empresas', ai:true, q:'Analiza el desempeño de todas las empresas del grupo' },
      { id:'directorio', name:'Preparar Directorio', ai:true, q:'Prepárame para el directorio' },
      { id:'reunion', name:'Preparar Reunión', ai:true, q:'Prepárame para la reunión de hoy' },
      { id:'documento', name:'Analizar Documento', ai:true, q:'Analiza el último documento cargado' },
      { id:'informe', name:'Generar Informe', ai:true, q:'Prepara un informe ejecutivo del mes' },
      { id:'buscar', name:'Buscar Información', ai:true, q:'Busca información sobre el mercado del hormigón' }
    ]},
    { id:'config', name:'Configuración', icon:'i-gear', source:'Administración', items:[
      { id:'integraciones', name:'Integraciones' }, { id:'usuarios', name:'Usuarios' },
      { id:'permisos', name:'Permisos' }, { id:'fuentes', name:'Fuentes de Datos' },
      { id:'preferencias', name:'Preferencias' }
    ]}
  ],

  /* --- Fuentes de datos (roadmap de integración) --------------------------- */
  sources: [
    { n:'Microsoft Power BI',   d:'Modelos semánticos y datasets certificados', s:'ready' },
    { n:'ERP corporativo',      d:'Ventas, compras, inventarios y producción',  s:'ready' },
    { n:'CRM',                  d:'Pipeline, clientes y cotizaciones',          s:'ready' },
    { n:'Base SQL financiera',  d:'Contabilidad, balance y flujo de caja',      s:'ready' },
    { n:'Microsoft 365',        d:'Correo, calendario, Teams y documentos',     s:'pending' },
    { n:'Google Workspace',     d:'Drive, Gmail y Calendar',                    s:'pending' },
    { n:'Sistemas de planta',   d:'MES y SCADA de plantas Chile y Perú',        s:'pending' },
    { n:'Motor de IA',          d:'RAG corporativo sobre documentos internos',  s:'ready' }
  ]
};

/* ==========================================================================
   2. STATE
   ========================================================================== */
const STATE = {
  view: 'home',
  moduleId: null,
  period: 'ytd',
  entity: 'consolidado',
  chartMetric: 'ventas',
  alertFilter: 'todas',
  privacy: false,
  wealthVisible: false,
  collapsed: false,
  aiOpen: false,
  aiBusy: false
};

/* ==========================================================================
   3. UTIL
   ========================================================================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const UTIL = {
  period()  { return DATA.periods.find(p => p.id === STATE.period); },
  entity()  { return DATA.entities.find(e => e.id === STATE.entity); },

  /** Factor combinado. `stock` = magnitud de balance (no escala por período). */
  factor(stock) {
    const e = UTIL.entity().factor;
    return stock ? e : e * UTIL.period().factor;
  },

  num(n, dec = 1) {
    return Number(n).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  },

  /** Monto operacional en millones, en la moneda de DATA.moneda (USD por
      defecto; CLP cuando js/powerbi.js carga datos reales). */
  musd(n, dec = 1) {
    if (DATA.moneda !== 'CLP') return UTIL.usd(n, dec);
    const abs = Math.abs(n), s = n < 0 ? '−' : '';
    if (abs < 1 && abs > 0) return s + '$ ' + UTIL.num(abs * 1000, 0) + ' K';
    return s + 'MM$ ' + UTIL.num(abs, abs >= 100 ? 0 : 1);
  },

  /** Millones de USD con escala automática a miles cuando corresponde. */
  usd(n, dec = 1) {
    const abs = Math.abs(n);
    if (abs < 1 && abs > 0) return (n < 0 ? '−' : '') + 'US$ ' + UTIL.num(Math.abs(n) * 1000, 0) + ' K';
    return (n < 0 ? '−' : '') + 'US$ ' + UTIL.num(Math.abs(n), dec) + ' M';
  },

  pct(n, dec = 1, sign = false) {
    const s = sign && n > 0 ? '+' : (n < 0 ? '−' : '');
    return s + UTIL.num(Math.abs(n), dec) + '%';
  },

  dir(n, invert) {
    const v = invert ? -n : n;
    return v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';
  },

  statusColor(s) {
    return { green:'#19C37D', amber:'#FFB020', red:'#FF5A67', blue:'#3B82F6' }[s] || '#3B82F6';
  },

  prioColor(p) {
    return { alta:'#FF5A67', media:'#FFB020', oportunidad:'#19C37D' }[p] || '#3B82F6';
  },

  today() {
    const d = new Date();
    const s = d.toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  },

  icon(id, cls = 'ico') {
    return `<svg class="${cls}"><use href="#${id}"/></svg>`;
  },

  toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), 2600);
  },

  esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
};

/* ==========================================================================
   4. UI
   ========================================================================== */
const UI = {

  /* ---------- Navegación ---------- */
  renderNav() {
    $('#nav').innerHTML = DATA.nav.map(g => `
      <div class="nav__group ${g.open ? 'is-open' : ''}" data-group="${g.id}">
        <button class="nav__label" data-toggle-group data-tip="${UTIL.esc(g.name)}">
          ${UTIL.icon(g.icon)}
          <span class="nav__name">${UTIL.esc(g.name)}</span>
          <svg class="nav__caret" viewBox="0 0 24 24"><path d="M9 5.5 15.5 12 9 18.5"/></svg>
        </button>
        <div class="nav__items"><div>
          ${g.items.map(it => `
            <button class="nav__item ${it.add ? 'nav__add' : ''}"
                    data-nav="${it.id}" data-group-id="${g.id}">
              ${it.add ? '+ ' : ''}${UTIL.esc(it.name)}
            </button>`).join('')}
        </div></div>
      </div>`).join('');
    UI.markNav();
  },

  markNav() {
    $$('.nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.nav === (STATE.moduleId || 'home')));
    const active = $('.nav__item.is-active');
    $$('.nav__group').forEach(g => g.classList.remove('is-active-group'));
    if (active) active.closest('.nav__group').classList.add('is-active-group');
  },

  /* ---------- Selectores ---------- */
  renderSelects() {
    const build = (id, list, current) => {
      const menu = $(`${id} .select__menu`);
      menu.innerHTML = list.map(o => `
        <button class="select__opt ${o.id === current ? 'is-active' : ''}" data-opt="${o.id}">
          <span>${o.label}</span><small>${o.hint}</small>
        </button>`).join('');
      $(`${id} [data-value]`).textContent = list.find(o => o.id === current).label;
    };
    build('#selPeriod', DATA.periods, STATE.period);
    build('#selEntity', DATA.entities, STATE.entity);
    $('#scopeValue').textContent = UTIL.entity().label;
    $('#chartScope').textContent = UTIL.entity().label;
  },

  /* ---------- KPIs ---------- */
  renderKPIs() {
    const per = UTIL.period();
    $('#kpiRow').innerHTML = DATA.kpis.map(k => {
      let value, sub = k.deltaLabel;

      if (k.unit === 'pct') {
        value = `${UTIL.num(k.value * (0.97 + UTIL.entity().factor * 0.03), 0)}<small>%</small>`;
      } else {
        const f = k.forcePeriod ? UTIL.entity().factor : UTIL.factor(k.stock);
        value = `<span class="money">${UTIL.musd(k.value * f)}</span>`;
      }
      if (k.id === 'ebitda') {
        sub = `${UTIL.num(UTIL.entity().margin)}% margen`;
      }
      if (!k.stock && !k.forcePeriod && k.unit !== 'pct') {
        sub = `${k.deltaLabel} · ${per.ctx}`;
      }

      const dir = UTIL.dir(k.delta, k.invert);
      return `
        <article class="kpi" style="--kpi-accent:${k.accent}" data-ask="${UTIL.esc(k.ask)}" data-tip="${UTIL.esc(k.tip)}">
          <div class="kpi__label">${UTIL.esc(k.label)}</div>
          <div class="kpi__value">${value}</div>
          <div class="kpi__meta">
            <span class="kpi__delta ${dir}">${UTIL.pct(k.delta)}</span>
            <span>${UTIL.esc(sub)}</span>
          </div>
          <div class="kpi__bar"><i data-w="${Math.min(k.bar, 100)}"></i></div>
        </article>`;
    }).join('');
    requestAnimationFrame(() => $$('.kpi__bar i').forEach(b => b.style.width = b.dataset.w + '%'));
  },

  /* ---------- Ventas por negocio ---------- */
  renderBusiness() {
    const f = UTIL.factor(false);
    const total = DATA.business.reduce((a, b) => a + b.value, 0);
    $('#bizList').innerHTML = DATA.business.map(b => {
      const pct = (b.value / total) * 100;
      const dir = UTIL.dir(b.delta);
      return `
        <div class="biz" data-tip="Margen ${UTIL.num(b.margin)}% · ${UTIL.pct(b.delta, 1, true)} YoY">
          <div class="biz__top">
            <span class="biz__name">${UTIL.esc(b.name)}</span>
            <span class="biz__val"><span class="money">${UTIL.musd(b.value * f)}</span>
              <span class="biz__pct">${UTIL.num(pct)}%</span></span>
          </div>
          <div class="biz__track"><i class="biz__fill" style="background:${b.color}" data-w="${pct}"></i></div>
          <div class="biz__foot">
            <span class="kpi__delta ${dir}" style="font-size:10px">${UTIL.pct(b.delta)}</span>
            <span>margen ${UTIL.num(b.margin)}%</span>
          </div>
        </div>`;
    }).join('');
    requestAnimationFrame(() => $$('.biz__fill').forEach(b => b.style.width = b.dataset.w + '%'));
  },

  /* ---------- Semáforo de empresas ---------- */
  renderCompanies() {
    const scope = UTIL.entity().scope;
    const f = UTIL.period().factor;
    const rows = DATA.companies.filter(c => c.groups.includes(scope));
    const list = rows.length ? rows : DATA.companies;

    $('#companyTable tbody').innerHTML = list.map(c => {
      const label = { green:'Verde', amber:'Amarillo', red:'Rojo' }[c.status];
      const col = UTIL.statusColor(c.status);
      const dir = UTIL.dir(c.yoy);
      return `
        <tr data-company="${UTIL.esc(c.name)}">
          <td>
            <div class="co">
              <span class="co__mark">${c.code}</span>
              <span><span class="co__name">${UTIL.esc(c.name)}</span><br><span class="co__tag">${UTIL.esc(c.tag)}</span></span>
            </div>
          </td>
          <td class="num money">${UTIL.musd(c.sales * f)}</td>
          <td class="num money">${UTIL.musd(c.ebitda * f)}</td>
          <td class="num">${UTIL.num(c.margin)}%</td>
          <td class="num">
            <div class="budget">
              <span>${c.budget}%</span>
              <span class="budget__track"><i class="budget__fill" style="width:${Math.min(c.budget, 130) / 1.3}%;background:${col}"></i></span>
            </div>
          </td>
          <td class="num"><span class="kpi__delta ${dir}">${UTIL.pct(c.yoy)}</span></td>
          <td><span class="badge badge--${c.status}"><i class="dot dot--${c.status}"></i>${label}</span></td>
          <td class="num"><button class="btn btn--ghost btn--sm row-act" data-ai="Analiza el desempeño de ${UTIL.esc(c.name)}">Analizar</button></td>
        </tr>`;
    }).join('');
  },

  /* ---------- Alertas ---------- */
  renderAlerts() {
    const f = STATE.alertFilter;
    const list = DATA.alerts.filter(a => f === 'todas' || a.prio === f);
    $('#alertList').innerHTML = list.map(a => {
      const col = UTIL.prioColor(a.prio);
      return `
        <article class="alert" style="--a-color:${col}">
          <span class="alert__rail"></span>
          <div class="alert__body">
            <div class="alert__top">
              <span class="alert__prio">${a.prio.toUpperCase()}</span>
              <span class="alert__co">${UTIL.esc(a.company)}</span>
              <span class="alert__time">${UTIL.esc(a.time)}</span>
            </div>
            <p class="alert__txt" style="margin:0">${UTIL.esc(a.text)}</p>
            <div class="alert__impact">${UTIL.esc(a.impact)}: <b class="money">${UTIL.esc(a.value)}</b></div>
          </div>
          <div class="alert__act">
            <button class="btn btn--sm" data-ai="Analiza esta alerta: ${UTIL.esc(a.text)}">Analizar</button>
          </div>
        </article>`;
    }).join('') || '<div class="mod-empty"><p>No hay alertas en esta categoría.</p></div>';
  },

  /* ---------- Agenda ---------- */
  renderAgenda() {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    $('#agendaDate').textContent = UTIL.today();
    $('#agendaList').innerHTML = DATA.agenda.map((a, i) => {
      const [h, m] = a.time.split(':').map(Number);
      const start = h * 60 + m;
      const next = DATA.agenda[i + 1];
      const end = next ? Number(next.time.split(':')[0]) * 60 : start + 90;
      const isNow  = now >= start && now < end;
      const isPast = now >= end;
      return `
        <div class="agenda__item ${isNow ? 'is-now' : ''} ${isPast ? 'is-past' : ''}">
          <span class="agenda__time">${a.time}</span>
          <div>
            <div class="agenda__title">${UTIL.esc(a.title)}</div>
            <div class="agenda__meta">
              <i class="agenda__dot" style="background:${a.color}"></i>
              <span>${UTIL.esc(a.tag)} · ${UTIL.esc(a.meta)}</span>
            </div>
          </div>
          <button class="btn btn--ghost btn--sm row-act" data-ai="Prepárame para: ${UTIL.esc(a.title)}">Preparar</button>
        </div>`;
    }).join('');
  },

  /* ---------- Briefing ---------- */
  renderBriefing() { $('#aiBrief').innerHTML = DATA.briefing; },

  /* ---------- Mapa ---------- */
  renderMap() {
    const colorOf = s => s === 'op' ? '#19C37D' : s === 'exp' ? '#3B82F6' : '#64798F';

    const nodes = DATA.markets.map(m => `
      <g class="map-node" data-market="${m.id}">
        ${m.state !== 'eval' ? `<circle class="ring" cx="${m.x}" cy="${m.y}" r="5" fill="none" stroke="${colorOf(m.state)}" stroke-width=".55"/>` : ''}
        <circle class="core" cx="${m.x}" cy="${m.y}" r="${m.state === 'op' ? 2.4 : 1.7}" fill="${colorOf(m.state)}"/>
        <line x1="${m.x + 3}" y1="${m.y}" x2="${m.x + 11}" y2="${m.y}" stroke="${colorOf(m.state)}" stroke-width=".28" stroke-dasharray="1 1" opacity=".65"/>
        <text class="map-label" x="${m.x + 12.5}" y="${m.y - .6}" style="font-size:2.6px">${UTIL.esc(m.name)}</text>
        <text class="map-value" x="${m.x + 12.5}" y="${m.y + 3.4}" style="font-size:2.9px">${UTIL.esc(m.value)}</text>
      </g>`).join('');

    $('#mapCanvas').innerHTML = `
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <g opacity=".13" stroke="#3B82F6" stroke-width=".16" fill="none">
          ${[12, 26, 40, 54, 68, 82, 96].map(y => `<line x1="0" y1="${y}" x2="100" y2="${y}"/>`).join('')}
          ${[8, 24, 40, 56, 72, 88].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="100"/>`).join('')}
        </g>
        <path d="M8,10 L22,11 L27,17 L23,23 L27,29 L34,31 L42,37 L46,49 L42,63 L37,78 L32,95 L27,88 L25,72 L21,57 L17,43 L12,29 Z"
              fill="rgba(59,130,246,.12)" stroke="rgba(59,130,246,.42)" stroke-width=".35" stroke-linejoin="round"/>
        <path d="M33,84 L26,56 M26,56 L31,38 M31,38 L19,24 M19,24 L34,15"
              stroke="rgba(59,130,246,.42)" stroke-width=".3" stroke-dasharray="1.6 1.6" fill="none"/>
        ${nodes}
      </svg>`;

    $('#marketList').innerHTML = DATA.markets.map(m => {
      const st = { op:'green', exp:'blue', eval:'muted' }[m.state];
      const dir = m.delta === null ? '' : UTIL.dir(m.delta);
      return `
        <div class="market">
          <i class="dot dot--${st}"></i>
          <div class="market__body">
            <div class="market__name">${UTIL.esc(m.name)}</div>
            <div class="market__sub">${UTIL.esc(m.sub)}</div>
          </div>
          <div class="market__val">
            <div class="market__num money">${UTIL.esc(m.value)}</div>
            ${m.delta !== null ? `<div class="market__delta kpi__delta ${dir}">${UTIL.pct(m.delta)}</div>` : '<div class="market__delta" style="color:var(--text-dim)">—</div>'}
          </div>
        </div>`;
    }).join('');
  },

  /* ---------- Proyectos ---------- */
  renderProjects() {
    $('#projectList').innerHTML = DATA.projects.map(p => {
      const col = UTIL.statusColor(p.status);
      const riskBadge = { Bajo:'green', Medio:'amber', Alto:'red' }[p.risk];
      return `
        <article class="project" data-ai="Dame el estado del proyecto ${UTIL.esc(p.name)}">
          <div class="project__top">
            <div>
              <div class="project__name">${UTIL.esc(p.name)}</div>
              <div class="project__owner">${UTIL.esc(p.owner)} · <span class="money">${UTIL.esc(p.capex)}</span></div>
            </div>
            <i class="dot dot--${p.status}"></i>
          </div>
          <div class="project__pct">
            <span class="project__pctv">${p.progress}%</span>
            <span class="project__date">${UTIL.esc(p.date)}</span>
          </div>
          <div class="project__track"><i class="project__fill" style="background:${col}" data-w="${p.progress}"></i></div>
          <div class="project__foot">
            <span>Avance</span>
            <span class="risk"><i class="dot dot--${riskBadge}"></i>Riesgo ${p.risk}</span>
          </div>
        </article>`;
    }).join('');
    requestAnimationFrame(() => $$('.project__fill').forEach(b => b.style.width = b.dataset.w + '%'));
  },

  /* ---------- Patrimonio ---------- */
  renderWealth() {
    const show = STATE.wealthVisible;
    const val = v => show ? UTIL.usd(v) : '••• •••';
    const cls = show ? '' : 'masked';

    $('#wealthList').innerHTML =
      DATA.wealth.map(w => `
        <div class="wealth__item">
          <span class="wealth__k">${UTIL.esc(w.k)}</span>
          <span>
            <span class="wealth__v ${cls}">${val(w.v)}</span>
            ${show ? `<span class="wealth__d kpi__delta ${UTIL.dir(w.d)}">${UTIL.pct(w.d)}</span>` : ''}
          </span>
        </div>`).join('') +
      `<div class="wealth__item is-total">
        <span class="wealth__k">${DATA.wealthTotal.k}</span>
        <span>
          <span class="wealth__v ${cls}">${val(DATA.wealthTotal.v)}</span>
          ${show ? `<span class="wealth__d kpi__delta ${UTIL.dir(DATA.wealthTotal.d)}">${UTIL.pct(DATA.wealthTotal.d)}</span>` : ''}
        </span>
      </div>`;

    const btn = $('#btnNetWorth');
    btn.querySelector('span').textContent = show ? 'Ocultar valores' : 'Mostrar valores';
  },

  /* ---------- Personal ---------- */
  renderPersonal() {
    $('#personalGrid').innerHTML = DATA.personal.map(p => `
      <button class="pcard" data-nav="${p.goto}">
        <div class="pcard__top">
          <span class="pcard__k">${UTIL.esc(p.k)}</span>
          <span class="pcard__ico">${UTIL.icon(p.icon, 'ico ico--xs')}</span>
        </div>
        <div class="pcard__n">${UTIL.esc(p.n)}</div>
        <div class="pcard__s">${UTIL.esc(p.s)}</div>
      </button>`).join('');
  },

  /* ---------- Notificaciones ---------- */
  renderNotifications() {
    const unread = DATA.notifications.filter(n => n.unread).length;
    const badge = $('#notifCount');
    badge.textContent = unread;
    badge.style.display = unread ? 'grid' : 'none';

    $('#notifList').innerHTML = DATA.notifications.map((n, i) => {
      const col = UTIL.statusColor(n.type);
      return `
        <div class="notif ${n.unread ? 'is-unread' : ''}" data-notif="${i}">
          <span class="notif__ico" style="background:${col}1F;color:${col}">${UTIL.icon(n.icon, 'ico ico--xs')}</span>
          <div>
            <div class="notif__t">${UTIL.esc(n.t)}</div>
            <div class="notif__m">${UTIL.esc(n.m)}</div>
          </div>
        </div>`;
    }).join('');
  },

  /* ---------- Vista de módulo ---------- */
  renderModule(groupId, itemId) {
    const g = DATA.nav.find(x => x.id === groupId);
    const it = g.items.find(x => x.id === itemId);
    const f = UTIL.factor(false);

    /* Con datos reales, js/powerbi.js entrega este resumen ya calculado. */
    const mini = DATA.moduleMini ? DATA.moduleMini() : [
      { k:'Ventas ' + UTIL.period().ctx, v:UTIL.musd(128.4 * f), d:12.8 },
      { k:'EBITDA', v:UTIL.musd(18.7 * f), d:9.4 },
      { k:'Cumplimiento presupuesto', v:'103%', d:3.0 },
      { k:'Registros disponibles', v:UTIL.num(48213, 0), d:0 }
    ];

    $('#view-module').innerHTML = `
      <div class="mod-head">
        <div>
          <div class="crumb">${UTIL.esc(g.name)}</div>
          <h2 class="mod-title">${UTIL.esc(it.name)}</h2>
          <p class="mod-sub">Módulo del Orquestador · perímetro <b>${UTIL.entity().label}</b> · período <b>${UTIL.period().label}</b>.
             Fuente prevista: <b>${UTIL.esc(g.source || 'Interno')}</b>.</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
          <button class="btn btn--primary btn--sm" data-ai="Cuéntame sobre ${UTIL.esc(it.name)}">${UTIL.icon('i-spark','ico ico--xs')} Preguntar a Paco AI</button>
        </div>
      </div>

      <div class="kpi-row" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        ${mini.map(m => `
          <article class="kpi" style="--kpi-accent:#3B82F6">
            <div class="kpi__label">${UTIL.esc(m.k)}</div>
            <div class="kpi__value"><span class="money">${m.v}</span></div>
            <div class="kpi__meta"><span class="kpi__delta ${UTIL.dir(m.d)}">${UTIL.pct(m.d)}</span><span>${UTIL.esc(m.s || 'vs. período anterior')}</span></div>
          </article>`).join('')}
      </div>

      <div class="grid grid--6-4">
        <section class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">${UTIL.esc(it.name)} · vista detallada</h2>
              <p class="panel__sub">Este módulo se poblará con los datos reales al conectar la fuente.</p>
            </div>
          </header>
          <div class="mod-empty">
            ${UTIL.icon('i-pulse','ico')}
            <h3>Listo para conectar</h3>
            <p>La estructura de <b>${UTIL.esc(it.name)}</b> ya está definida en la capa DATA del Orquestador.
               Al habilitar la integración con <b>${UTIL.esc(g.source || 'la fuente interna')}</b>, este módulo
               mostrará los indicadores, tablas y gráficos correspondientes sin cambios en la interfaz.</p>
            <button class="btn btn--sm" data-nav="integraciones">Configurar integración</button>
          </div>
        </section>

        <section class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">Fuentes de datos</h2>
              <p class="panel__sub">Estado del roadmap de integración</p>
            </div>
          </header>
          <div class="src-list">
            ${DATA.sources.map(s => `
              <div class="src">
                <i class="dot dot--${s.s === 'ready' ? 'green' : 'amber'}"></i>
                <div class="src__n">${UTIL.esc(s.n)}<div class="src__d">${UTIL.esc(s.d)}</div></div>
                <span class="badge badge--${s.s === 'ready' ? 'green' : 'amber'}">${s.s === 'ready' ? 'Mapeado' : 'Pendiente'}</span>
              </div>`).join('')}
          </div>
        </section>
      </div>`;
  },

  /* ---------- Vistas ---------- */
  showHome() {
    STATE.view = 'home'; STATE.moduleId = 'home';
    $('#view-home').classList.remove('is-hidden');
    $('#view-module').classList.add('is-hidden');
    UI.markNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* Renderizadores registrados por módulos externos (por ejemplo
     js/inversiones.js). Clave = id del ítem de navegación. Si no hay uno
     registrado se usa la vista de módulo genérica. */
  moduleRenderers: {
    tareas(root) {
      root.innerHTML = `
        <div class="mod-head">
          <div>
            <div class="crumb">Personal</div>
            <h2 class="mod-title">Tareas</h2>
            <p class="mod-sub">Tareas abiertas de Francisco Posada.</p>
          </div>
          <button class="btn btn--ghost btn--sm" data-nav="home">Volver a Home</button>
        </div>
        <section class="panel">
          <header class="panel__head">
            <div>
              <h2 class="panel__title">Alertas y tareas abiertas</h2>
              <p class="panel__sub">${DATA.tasks.length} tarea pendiente</p>
            </div>
          </header>
          <div style="display:grid;gap:10px;padding:16px">
            ${DATA.tasks.map(task => `
              <article style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--panel)">
                <div>
                  <div style="font-weight:700;margin-bottom:6px">${UTIL.esc(task.title)}</div>
                  <div style="color:var(--muted);line-height:1.5">${UTIL.esc(task.description)}</div>
                  <div style="margin-top:10px;color:var(--muted);font-size:12px">
                    Responsable: ${UTIL.esc(task.owner)} · Vence: ${UTIL.esc(task.due)}
                  </div>
                </div>
                <div style="display:flex;align-items:flex-start;gap:8px">
                  <span class="badge badge--amber">${UTIL.esc(task.priority)}</span>
                  <span class="badge badge--amber">${UTIL.esc(task.status)}</span>
                </div>
              </article>`).join('')}
          </div>
        </section>`;
    }
  },

  renderModuleView(groupId, itemId) {
    const propio = UI.moduleRenderers[itemId];
    if (propio) propio($('#view-module'), { groupId, itemId });
    else UI.renderModule(groupId, itemId);
  },

  showModule(groupId, itemId) {
    STATE.view = 'module'; STATE.moduleId = itemId;
    UI.renderModuleView(groupId, itemId);
    $('#view-home').classList.add('is-hidden');
    $('#view-module').classList.remove('is-hidden');
    UI.markNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ---------- Render completo ---------- */
  renderAll() {
    UI.renderSelects();
    if (STATE.view === 'home') {
      UI.renderKPIs();
      UI.renderBusiness();
      UI.renderCompanies();
      UI.renderAlerts();
      CHARTS.update();
    } else {
      const g = DATA.nav.find(x => x.items.some(i => i.id === STATE.moduleId));
      if (g) UI.renderModuleView(g.id, STATE.moduleId);
    }
  },

  renderStatic() {
    $('#greetTitle').textContent = `${UTIL.greeting()}, ${DATA.user.name}`;
    $('#todayDate').textContent = UTIL.today();
    UI.renderNav();
    UI.renderAgenda();
    UI.renderBriefing();
    UI.renderMap();
    UI.renderProjects();
    UI.renderWealth();
    UI.renderPersonal();
    UI.renderNotifications();
  }
};

/* ==========================================================================
   5. CHARTS
   ========================================================================== */
const CHARTS = {
  instance: null,

  scaled(key) {
    const f = UTIL.entity().factor;
    return DATA.series[key].map(v => +(v * f).toFixed(2));
  },

  margin() {
    return DATA.series.ebitda.map((e, i) =>
      DATA.series.ventas[i] ? +((e / DATA.series.ventas[i]) * 100).toFixed(1) : null);
  },

  /* Nombres de las series. js/powerbi.js los reemplaza por los de las
     medidas reales (p. ej. margen bruto en lugar de EBITDA). */
  terms() {
    return Object.assign({ ebitda:'EBITDA', margen:'Margen EBITDA %', presupuesto:'Presupuesto',
                           forecast:'Forecast', cumpl:'Cumpl. presupuesto' }, DATA.terms || {});
  },

  config(metric) {
    const L = DATA.series.labels;
    const T = CHARTS.terms();
    const grid = { color:'rgba(255,255,255,.05)', drawTicks:false };
    const ticks = { color:'#64798F', font:{ family:'Inter', size:10 }, padding:8 };

    const base = {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      layout:{ padding:{ top:8 } },
      plugins:{
        legend:{ display:true, position:'top', align:'end',
          labels:{ color:'#8FA3B8', boxWidth:9, boxHeight:9, usePointStyle:true, pointStyle:'circle',
                   font:{ family:'Inter', size:11 }, padding:16 } },
        tooltip:{
          backgroundColor:'#14293E', borderColor:'rgba(255,255,255,.11)', borderWidth:1,
          titleColor:'#F4F7FA', bodyColor:'#C8D6E5', padding:11, cornerRadius:8, displayColors:true,
          usePointStyle:true, titleFont:{ family:'Inter', size:11, weight:'600' },
          bodyFont:{ family:'Inter', size:12 },
          callbacks:{
            label(c) {
              const v = c.parsed.y;
              return ` ${c.dataset.label}: ` + (metric === 'margen' ? `${UTIL.num(v)}%` : UTIL.musd(v));
            }
          }
        }
      },
      scales:{
        x:{ grid:{ ...grid, display:false }, border:{ display:false }, ticks },
        y:{ grid, border:{ display:false },
            ticks:{ ...ticks, callback:v => metric === 'margen' ? v + '%' : v } }
      }
    };

    const bar = (label, data, color, alpha = .85) => ({
      type:'bar', label, data,
      backgroundColor:color + Math.round(alpha * 255).toString(16).padStart(2, '0'),
      hoverBackgroundColor:color, borderRadius:4, borderSkipped:false, barPercentage:.68, categoryPercentage:.72
    });

    const line = (label, data, color, dash) => ({
      type:'line', label, data, borderColor:color, backgroundColor:'transparent',
      borderWidth:2, borderDash:dash || [], tension:.34,
      pointRadius:0, pointHoverRadius:5, pointBackgroundColor:color,
      pointHoverBorderColor:'#07111F', pointHoverBorderWidth:2
    });

    const fill = (label, data, color) => ({
      type:'line', label, data, borderColor:color, borderWidth:2, tension:.34,
      fill:true, pointRadius:0, pointHoverRadius:5, pointBackgroundColor:color,
      backgroundColor:(ctx) => {
        const { ctx:c, chartArea:a } = ctx.chart;
        if (!a) return color + '20';
        const g = c.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, color + '4D'); g.addColorStop(1, color + '00');
        return g;
      }
    });

    let ds;
    switch (metric) {
      case 'ebitda':
        ds = [bar(T.ebitda, CHARTS.scaled('ebitda'), '#19C37D'),
              line('Ventas', CHARTS.scaled('ventas'), '#3B82F6', [5, 4])];
        break;
      case 'margen':
        ds = [fill(T.margen, CHARTS.margin(), '#8B7FF0')];
        break;
      case 'presupuesto':
        ds = [bar('Ventas reales', CHARTS.scaled('ventas'), '#3B82F6'),
              bar(T.presupuesto, CHARTS.scaled('presupuesto'), '#64798F', .55)];
        break;
      case 'forecast':
        ds = [bar('Ventas reales', CHARTS.scaled('ventas'), '#3B82F6', .7),
              line(T.forecast, CHARTS.scaled('forecast'), '#FFB020', [6, 4])];
        break;
      default:
        ds = [fill('Ventas', CHARTS.scaled('ventas'), '#3B82F6'),
              line(T.ebitda, CHARTS.scaled('ebitda'), '#19C37D')];
    }

    return { type:'bar', data:{ labels:L, datasets:ds }, options:base };
  },

  update() {
    const cfg = CHARTS.config(STATE.chartMetric);
    if (window.Chart) {
      if (CHARTS.instance) CHARTS.instance.destroy();
      CHARTS.instance = new Chart($('#mainChart'), cfg);
    } else {
      CHARTS.fallback(cfg);
    }
    CHARTS.foot();
  },

  /** Render nativo mínimo si el CDN de Chart.js no está disponible (uso offline). */
  fallback(cfg) {
    const cv = $('#mainChart');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.parentElement.clientWidth, h = cv.parentElement.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);

    const pad = { l:38, r:12, t:22, b:26 };
    const sets = cfg.data.datasets;
    const max = Math.max(...sets.flatMap(s => s.data)) * 1.15;
    const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    const y = v => pad.t + ih - (v / max) * ih;

    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1;
    c.fillStyle = '#64798F'; c.font = '10px Inter, Arial';
    for (let i = 0; i <= 4; i++) {
      const yy = pad.t + (ih / 4) * i;
      c.beginPath(); c.moveTo(pad.l, yy); c.lineTo(w - pad.r, yy); c.stroke();
      c.fillText(UTIL.num(max - (max / 4) * i, 0), 8, yy + 3);
    }

    const n = cfg.data.labels.length, step = iw / n;
    sets.forEach((s, si) => {
      const col = (s.borderColor || s.hoverBackgroundColor || '#3B82F6');
      if (s.type === 'line') {
        c.beginPath(); c.strokeStyle = col; c.lineWidth = 2;
        s.data.forEach((v, i) => {
          const xx = pad.l + step * i + step / 2;
          i ? c.lineTo(xx, y(v)) : c.moveTo(xx, y(v));
        });
        c.stroke();
      } else {
        const bw = (step * .58) / sets.filter(d => d.type !== 'line').length;
        c.fillStyle = col;
        s.data.forEach((v, i) => {
          const xx = pad.l + step * i + step / 2 - (step * .29) + si * bw;
          c.fillRect(xx, y(v), bw - 2, pad.t + ih - y(v));
        });
      }
    });

    c.fillStyle = '#64798F';
    cfg.data.labels.forEach((l, i) => c.fillText(l, pad.l + step * i + step / 2 - 9, h - 8));
  },

  foot() {
    const f = UTIL.entity().factor;
    const v = DATA.series.ventas, e = DATA.series.ebitda, p = DATA.series.presupuesto;
    const sum = a => a.reduce((x, y) => x + y, 0);
    const T = CHARTS.terms();
    const best = v.indexOf(Math.max(...v));
    const stats = [
      { k:'Acumulado 12 M',   v:`<span class="money">${UTIL.musd(sum(v) * f)}</span>` },
      { k:T.ebitda + ' 12 M', v:`<span class="money">${UTIL.musd(sum(e) * f)}</span>` },
      { k:'Margen promedio',  v:sum(v) ? `${UTIL.num((sum(e) / sum(v)) * 100)}%` : '—' },
      { k:T.cumpl,            v:sum(p) ? `${UTIL.num((sum(v) / sum(p)) * 100, 0)}%` : '—' },
      { k:'Mejor mes',        v:`${DATA.series.labels[best]} · <span class="money">${UTIL.musd(v[best] * f)}</span>` }
    ];
    $('#chartFoot').innerHTML = stats.map(s =>
      `<div class="stat"><span class="stat__k">${s.k}</span><span class="stat__v">${s.v}</span></div>`).join('');
  }
};

/* ==========================================================================
   6. AI (mock)
   ========================================================================== */
const AI = {

  /* Base de conocimiento simulada. Sustituible por un endpoint LLM + RAG. */
  kb: [
    { keys:['venta','vendimos','ventas del mes','mes'],
      a:() => `Las ventas del mes alcanzan <b>${UTIL.usd(11.8)}</b>, un <b>103% del presupuesto</b> y +3,0% sobre el mes anterior.
        Acumulado YTD llegamos a <b>${UTIL.usd(128.4)}</b>, creciendo <b>12,8%</b> respecto al año pasado.
        <div class="kv"><span>Hormigones</span><b>US$ 72,4 M · +9,4%</b></div>
        <div class="kv"><span>Morteros</span><b>US$ 29,8 M · +14,2%</b></div>
        <div class="kv"><span>Pinturas</span><b>US$ 8,1 M · +18,6%</b></div>
        El principal motor del mes fue Perú, con crecimiento de 24%.` },

    { keys:['ebitda','margen del grupo','rentabilidad'],
      a:() => `El EBITDA acumulado es de <b>${UTIL.usd(18.7)}</b> con un margen de <b>14,6%</b>.
        Proyectado a cierre de año estimo <b>US$ 24,8 M</b> con margen de 14,7%, asumiendo estacionalidad normal del cuarto trimestre.
        <ul>
          <li>Mejor margen: <b>Inversiones TX (77,4%)</b> y <b>Cementos Transex (18,3%)</b>.</li>
          <li>Menor margen: <b>Hormigones Transex (7,8%)</b>, presionado por costo de cemento.</li>
          <li>Riesgo: adhesivos perdió 2,8 puntos de margen en el trimestre.</li>
        </ul>` },

    { keys:['bajo presupuesto','presupuesto','cumplimiento'],
      a:() => `Tres sociedades están <b>bajo presupuesto</b>:
        <div class="kv"><span>Agrícola San Rafael</span><b>88%</b></div>
        <div class="kv"><span>Inmobiliaria Los Silos</span><b>92%</b></div>
        <div class="kv"><span>Centauro</span><b>97%</b></div>
        <div class="kv"><span>TX Perú</span><b>98%</b></div>
        El grupo consolidado cierra en <b>103%</b>, compensado por Cementos Transex (106%) y Grupo TX Chile (104%).
        La brecha total contra presupuesto es de <b>+US$ 3,7 M</b> favorable.` },

    { keys:['atrasado','vencido','cobrar','cartera','moroso','cxc'],
      a:() => `Tienes <b>${UTIL.usd(16.2)}</b> en cuentas por cobrar y un DSO de <b>47 días</b> (era 42 hace tres semanas).
        Cartera vencida sobre 60 días: <b>US$ 1,36 M</b> (8,4%).
        <div class="kv"><span>Constructora X</span><b>US$ 680 K · 90+ días</b></div>
        <div class="kv"><span>Inmobiliaria Andes</span><b>US$ 214 K · 60 días</b></div>
        <div class="kv"><span>Constructora Sur</span><b>US$ 178 K · 60 días</b></div>
        <div class="kv"><span>Otros 14 clientes</span><b>US$ 288 K</b></div>
        <b>Recomiendo</b> suspender despachos a Constructora X hasta acordar plan de pago.` },

    { keys:['atención','problema','riesgo','urgente','preocupa'],
      a:() => `Hoy hay <b>3 temas de prioridad alta</b>:
        <ul>
          <li><b>Margen de adhesivos:</b> −2,8 puntos por costo de resinas. Impacto ~US$ 1,1 M anualizado.</li>
          <li><b>Constructora X:</b> US$ 680 K vencidos a 90+ días.</li>
          <li><b>Costo de cemento:</b> subió 6,2% sin traslado a precio. −US$ 340 K mensuales de margen.</li>
        </ul>
        Y dos temas de vigilancia: planta Santiago al 91% de capacidad y aditivo X con 9 días de cobertura.
        Si actúas sobre los tres primeros, recuperas aproximadamente <b>US$ 2,1 M</b> de EBITDA anualizado.` },

    { keys:['perdiendo','pérdida','plata','sangrando','fuga'],
      a:() => `Identifico <b>cuatro focos de pérdida de valor</b>, ordenados por impacto anualizado:
        <div class="kv"><span>Margen adhesivos</span><b>−US$ 1,1 M</b></div>
        <div class="kv"><span>Costo cemento sin traslado</span><b>−US$ 4,1 M</b></div>
        <div class="kv"><span>Capacidad ociosa Santiago</span><b>−US$ 2,5 M</b></div>
        <div class="kv"><span>Costo logístico Centauro</span><b>−US$ 0,6 M</b></div>
        El más grande y más fácil de corregir es el <b>traslado de precio del cemento</b>: una alza de 3% en lista
        recupera US$ 2,4 M sin afectar volumen según elasticidad histórica.` },

    { keys:['mejor margen','qué empresa','comparar empresa','ranking'],
      a:() => `Ranking por margen EBITDA:
        <div class="kv"><span>1 · Inversiones TX</span><b>77,4%</b></div>
        <div class="kv"><span>2 · Inmobiliaria Los Silos</span><b>37,3%</b></div>
        <div class="kv"><span>3 · Cementos Transex</span><b>18,3%</b></div>
        <div class="kv"><span>4 · Grupo TX Chile</span><b>15,5%</b></div>
        <div class="kv"><span>5 · Agrícola San Rafael</span><b>14,3%</b></div>
        <div class="kv"><span>8 · Hormigones Transex</span><b>7,8%</b></div>
        Ojo: Inmobiliaria tiene el segundo mejor margen pero está a <b>92% del presupuesto</b> por vacancia. Alta rentabilidad, bajo volumen.` },

    { keys:['chile','perú','peru','compara'],
      a:() => `Comparación <b>Chile vs. Perú</b>:
        <div class="kv"><span>Ventas Chile</span><b>US$ 82,4 M · +11,2%</b></div>
        <div class="kv"><span>Ventas Perú</span><b>US$ 21,7 M · +24,1%</b></div>
        <div class="kv"><span>Margen Chile</span><b>15,5%</b></div>
        <div class="kv"><span>Margen Perú</span><b>13,4%</b></div>
        <div class="kv"><span>Presupuesto Chile</span><b>104%</b></div>
        <div class="kv"><span>Presupuesto Perú</span><b>98%</b></div>
        Perú crece al doble de velocidad pero con 2,1 puntos menos de margen, explicado por mayor costo logístico
        y menor escala. Con la nueva planta el margen debería converger a 15% en 18 meses.` },

    { keys:['cliente','top','importantes','mayores'],
      a:() => `Top 10 clientes por venta acumulada:
        <div class="kv"><span>1 · Constructora Andes</span><b>US$ 11,4 M</b></div>
        <div class="kv"><span>2 · Grupo Salfa</span><b>US$ 8,9 M</b></div>
        <div class="kv"><span>3 · Minera Escondida</span><b>US$ 7,2 M</b></div>
        <div class="kv"><span>4 · Constructora X</span><b>US$ 6,8 M</b></div>
        <div class="kv"><span>5 · Echeverría Izquierdo</span><b>US$ 5,4 M</b></div>
        <div class="kv"><span>6 · Besalco</span><b>US$ 4,9 M</b></div>
        <div class="kv"><span>7 · Consorcio Lima Norte</span><b>US$ 4,2 M</b></div>
        <div class="kv"><span>8 · Sacyr Perú</span><b>US$ 3,8 M</b></div>
        <div class="kv"><span>9 · Ingevec</span><b>US$ 3,1 M</b></div>
        <div class="kv"><span>10 · Constructora Sur</span><b>US$ 2,7 M</b></div>
        Los 10 concentran el <b>45,6%</b> de la venta. Constructora X es el cuarto cliente y a la vez el mayor riesgo de cartera.` },

    { keys:['decisión','decisiones','semana','debo tomar'],
      a:() => `Cinco decisiones que te esperan esta semana:
        <ul>
          <li><b>Precio de lista hormigón:</b> aprobar alza de 3% para trasladar el costo del cemento. Impacto +US$ 2,4 M.</li>
          <li><b>Constructora X:</b> suspender crédito o aceptar plan de pago a 6 meses con garantía.</li>
          <li><b>CAPEX planta Rancagua:</b> el proyecto pide US$ 2,1 M adicionales por terreno.</li>
          <li><b>Fibrocemento:</b> el proyecto está en rojo, 35% de avance. Continuar o parar.</li>
          <li><b>Perú:</b> aprobar contratación de 12 personas para el segundo turno de Arequipa.</li>
        </ul>
        La primera es la de mayor impacto y la más urgente.` },

    { keys:['directorio','board','preparar directorio'],
      a:() => `Carpeta de directorio lista. Te propongo esta estructura para las <b>16:00</b>:
        <ul>
          <li><b>1. Resultados:</b> ventas US$ 128,4 M (+12,8%), EBITDA US$ 18,7 M (14,6%), 103% de presupuesto.</li>
          <li><b>2. Perú:</b> +24,1%, el motor de crecimiento. Solicitud de segundo turno en Arequipa.</li>
          <li><b>3. Presión de costos:</b> cemento +6,2%, resinas al alza. Propuesta de alza de precio 3%.</li>
          <li><b>4. Capital de trabajo:</b> DSO subió de 42 a 47 días. Plan de recuperación de cartera.</li>
          <li><b>5. Proyectos:</b> 7 iniciativas, US$ 46,8 M de CAPEX. Fibrocemento en rojo requiere decisión.</li>
          <li><b>6. Expansión:</b> avance del due diligence en Panamá.</li>
        </ul>
        Anticipo dos preguntas del directorio: sostenibilidad del margen de hormigones y calendario de retorno del CAPEX de Rancagua.` },

    { keys:['correo','mail','emails','bandeja'],
      a:() => `Tienes <b>12 correos</b> que requieren tu respuesta. Los relevantes:
        <ul>
          <li><b>Gerente Perú:</b> solicita aprobación del segundo turno en Arequipa (impacto US$ 480 K/año).</li>
          <li><b>CFO:</b> envía el flujo de caja proyectado a 90 días. Caja mínima cae a US$ 14,2 M en noviembre.</li>
          <li><b>Constructora Andes:</b> propone contrato marco a 24 meses por US$ 18 M.</li>
          <li><b>Legal:</b> 4 documentos esperan tu firma, dos vencen mañana.</li>
        </ul>
        Los otros 8 son informativos y ya los resumí en tu bandeja.` },

    { keys:['mañana','reuniones','agenda','calendario'],
      a:() => `Mañana tienes <b>4 compromisos</b>:
        <div class="kv"><span>08:30 · Comité de Operaciones</span><b>Planta Santiago</b></div>
        <div class="kv"><span>10:30 · Constructora Andes</span><b>Contrato marco</b></div>
        <div class="kv"><span>15:00 · Revisión CAPEX Rancagua</span><b>Gerencia Proyectos</b></div>
        <div class="kv"><span>17:30 · Llamada Panamá</span><b>Due diligence</b></div>
        La reunión con Andes es la de mayor valor: contrato marco potencial de US$ 18 M a 24 meses. Te preparo el material esta tarde.` },

    { keys:['hoy','qué está pasando','día','pasando'],
      a:() => `Resumen de hoy, <b>${UTIL.today()}</b>:
        <ul>
          <li>Ventas del mes en <b>US$ 11,8 M</b>, 103% del presupuesto.</li>
          <li>Producción del grupo al <b>94%</b> del plan. Planta Santiago al 91% por mantención de dos mixers.</li>
          <li><b>3 alertas altas</b> abiertas: margen de adhesivos, cartera de Constructora X y costo del cemento.</li>
          <li><b>5 reuniones</b> en agenda, incluido el directorio a las 16:00.</li>
          <li>Perú cerró el mes con <b>+24%</b>, el mejor resultado del grupo.</li>
        </ul>
        Si tuviera que elegir una sola prioridad para hoy: <b>aprobar el alza de precio del hormigón</b>.` },

    { keys:['proyecto','estratégico','capex','iniciativa'],
      a:() => `Estado de los <b>7 proyectos estratégicos</b> (CAPEX comprometido US$ 46,8 M):
        <div class="kv"><span>Prefabricados</span><b>88% · verde</b></div>
        <div class="kv"><span>Expansión Perú</span><b>72% · verde</b></div>
        <div class="kv"><span>Digitalización ERP</span><b>64% · verde</b></div>
        <div class="kv"><span>Nueva Planta Rancagua</span><b>48% · amarillo</b></div>
        <div class="kv"><span>IA Grupo TX</span><b>41% · verde</b></div>
        <div class="kv"><span>Fibrocemento</span><b>35% · rojo</b></div>
        <div class="kv"><span>Entrada Centroamérica</span><b>22% · amarillo</b></div>
        <b>Fibrocemento</b> es el único en rojo: lleva 4 meses de atraso y el caso de negocio se deterioró con el tipo de cambio.` },

    { keys:['producción','planta','capacidad','operacion'],
      a:() => `La producción del grupo está al <b>94%</b> del plan, 1,4 puntos bajo el mes anterior.
        <div class="kv"><span>Planta Santiago</span><b>91% · 2 mixers en mantención</b></div>
        <div class="kv"><span>Planta Rancagua</span><b>97%</b></div>
        <div class="kv"><span>Planta Antofagasta</span><b>99%</b></div>
        <div class="kv"><span>Planta Lima</span><b>96%</b></div>
        <div class="kv"><span>Planta Arequipa</span><b>88% · sin segundo turno</b></div>
        Santiago tiene 9% de capacidad ociosa equivalente a US$ 210 K mensuales. Arequipa está limitada por dotación, no por equipo.` },

    { keys:['oportunidad','crecer','upside','potencial'],
      a:() => `Cuatro oportunidades con impacto cuantificado:
        <ul>
          <li><b>Perú (+24%):</b> upside anualizado de US$ 2,6 M si se sostiene el ritmo.</li>
          <li><b>Nuevo proyecto minero:</b> US$ 4,2 M en ventas a 18 meses, margen 16%.</li>
          <li><b>Pinturas:</b> crece 18,6% con el mejor margen del portafolio y capacidad instalada libre. +US$ 1,8 M sin CAPEX.</li>
          <li><b>Contrato marco Constructora Andes:</b> US$ 18 M a 24 meses.</li>
        </ul>
        Total potencial identificado: <b>US$ 26,6 M</b> en ventas incrementales.` },

    { keys:['patrimonio','neto','personal','family'],
      a:() => `Tu patrimonio neto consolidado es de <b>US$ 237,8 M</b>, +8,4% en doce meses.
        <div class="kv"><span>Valor empresas</span><b>US$ 186,4 M</b></div>
        <div class="kv"><span>Activos inmobiliarios</span><b>US$ 64,2 M</b></div>
        <div class="kv"><span>Inversiones</span><b>US$ 28,7 M</b></div>
        <div class="kv"><span>Liquidez</span><b>US$ 11,3 M</b></div>
        <div class="kv"><span>Deuda</span><b>−US$ 52,8 M</b></div>
        La concentración en el negocio operativo es de 78%. Si quieres reducirla, el camino natural es aumentar el portafolio financiero con el flujo de los próximos 24 meses.` },

    { keys:['informe','reporte','resumen ejecutivo','explícame'],
      a:() => `Preparé el <b>informe ejecutivo del período</b>. Estructura propuesta:
        <ul>
          <li><b>Resultados:</b> ventas US$ 128,4 M (+12,8%), EBITDA US$ 18,7 M (14,6%), 103% de presupuesto.</li>
          <li><b>Por negocio:</b> hormigones lidera en volumen; pinturas y químicos en crecimiento y margen.</li>
          <li><b>Por geografía:</b> Chile aporta 79% de la venta; Perú el 100% del crecimiento incremental.</li>
          <li><b>Riesgos:</b> margen de adhesivos, cartera vencida y costo del cemento.</li>
          <li><b>Recomendaciones:</b> alza de precio 3%, plan de recuperación de cartera y segundo turno en Arequipa.</li>
        </ul>
        Puedo exportarlo a PDF o PowerPoint cuando conectes el módulo de documentos.` }
  ],

  answer(q) {
    const t = q.toLowerCase();
    const hit = AI.kb.find(e => e.keys.some(k => t.includes(k)));
    if (hit) return hit.a();

    return `He revisado <b>14 fuentes</b> del grupo para responder a "<i>${UTIL.esc(q)}</i>".
      Con la información disponible hoy, el estado general es el siguiente:
      <div class="kv"><span>Ventas YTD</span><b>US$ 128,4 M · +12,8%</b></div>
      <div class="kv"><span>EBITDA</span><b>US$ 18,7 M · 14,6%</b></div>
      <div class="kv"><span>Cumplimiento presupuesto</span><b>103%</b></div>
      <div class="kv"><span>Caja</span><b>US$ 21,4 M</b></div>
      <div class="kv"><span>Alertas abiertas</span><b>3 altas · 3 medias</b></div>
      Puedo profundizar en ventas, márgenes, cartera, producción, proyectos, patrimonio o agenda.
      Cuando conectemos Power BI y el ERP podré responder esta pregunta con el dato transaccional exacto.`;
  },

  open(question) {
    document.body.classList.add('ai-open');
    STATE.aiOpen = true;
    if (question) setTimeout(() => AI.send(question), 240);
    else setTimeout(() => $('#aiInput').focus(), 380);
  },

  close() {
    document.body.classList.remove('ai-open');
    STATE.aiOpen = false;
  },

  bubble(role, html) {
    const thread = $('#aiThread');
    const time = new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
    const el = document.createElement('div');
    el.className = `msg msg--${role}`;
    el.innerHTML = `
      <div class="msg__av">${role === 'ai' ? '<svg class="ico ico--xs" style="stroke:none;fill:currentColor"><use href="#i-spark"/></svg>' : DATA.user.initials}</div>
      <div><div class="msg__bub">${html}</div><div class="msg__time">${time}</div></div>`;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  },

  send(text) {
    const q = (text || '').trim();
    if (!q || STATE.aiBusy) return;
    STATE.aiBusy = true;
    $('#aiInput').value = '';
    AI.bubble('me', UTIL.esc(q));

    const typing = AI.bubble('ai', '<div class="typing"><i></i><i></i><i></i></div>');
    setTimeout(() => {
      typing.querySelector('.msg__bub').innerHTML = AI.answer(q);
      $('#aiThread').scrollTop = $('#aiThread').scrollHeight;
      STATE.aiBusy = false;
    }, 620 + Math.random() * 520);
  },

  welcome() {
    AI.bubble('ai',
      `Buenos días, Francisco. Ya revisé el cierre de anoche en <b>14 fuentes</b> del grupo.<br><br>
       Titular del día: estamos <b>103% del presupuesto</b> con ventas de <b>US$ 11,8 M</b> en el mes.
       Perú creció <b>24%</b>. Hay <b>3 alertas de prioridad alta</b> que conviene revisar antes del directorio de las 16:00.<br><br>
       ¿Por dónde quieres partir?`);
  }
};

/* ==========================================================================
   7. EVENTS
   ========================================================================== */
const EVENTS = {

  init() {
    EVENTS.delegated();
    EVENTS.selects();
    EVENTS.sidebar();
    EVENTS.ai();
    EVENTS.chartTabs();
    EVENTS.misc();
  },

  /* ---------- Delegación global ---------- */
  delegated() {
    document.addEventListener('click', e => {

      /* Navegación */
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const id = nav.dataset.nav;
        if (id === 'home') { UI.showHome(); document.body.classList.remove('nav-open'); return; }

        const group = DATA.nav.find(g => g.items.some(i => i.id === id));
        if (!group) return;
        const item = group.items.find(i => i.id === id);

        if (item.add) { UTIL.toast('Alta de nueva compañía · disponible al conectar la consolidación societaria'); return; }
        if (item.ai)  { AI.open(item.q || null); document.body.classList.remove('nav-open'); return; }

        UI.showModule(group.id, id);
        document.body.classList.remove('nav-open');
        return;
      }

      /* Disparadores de IA */
      const ai = e.target.closest('[data-ai]');
      if (ai) { AI.open(ai.dataset.ai); return; }

      /* Chips de sugerencia */
      const chip = e.target.closest('[data-ask]');
      if (chip) {
        if (chip.classList.contains('kpi')) { AI.open(chip.dataset.ask); return; }
        AI.open(chip.dataset.ask);
        return;
      }

      /* Ir a un módulo desde un botón secundario */
      const goto = e.target.closest('[data-goto]');
      if (goto) {
        const group = DATA.nav.find(g => g.items.some(i => i.id === goto.dataset.goto));
        if (group) UI.showModule(group.id, goto.dataset.goto);
        $('#notifPanel').classList.remove('is-open');
        return;
      }

      /* Filtro de alertas */
      const pill = e.target.closest('#alertFilters .pill');
      if (pill) {
        $$('#alertFilters .pill').forEach(p => p.classList.toggle('is-active', p === pill));
        STATE.alertFilter = pill.dataset.filter;
        UI.renderAlerts();
        return;
      }

      /* Notificación leída */
      const notif = e.target.closest('[data-notif]');
      if (notif) {
        DATA.notifications[+notif.dataset.notif].unread = false;
        UI.renderNotifications();
        return;
      }
    });
  },

  /* ---------- Selectores período / perímetro ---------- */
  selects() {
    const wire = (id, key) => {
      const root = $(id);
      root.querySelector('.select__btn').addEventListener('click', ev => {
        ev.stopPropagation();
        $$('.select').forEach(s => s !== root && s.classList.remove('is-open'));
        root.classList.toggle('is-open');
      });
      root.addEventListener('click', ev => {
        const opt = ev.target.closest('[data-opt]');
        if (!opt) return;
        STATE[key] = opt.dataset.opt;
        root.classList.remove('is-open');
        UI.renderAll();
        UTIL.toast(key === 'period'
          ? `Período: ${UTIL.period().label}`
          : `Perímetro: ${UTIL.entity().label}`);
      });
    };
    wire('#selPeriod', 'period');
    wire('#selEntity', 'entity');

    /* Cierre por clic fuera. El panel de notificaciones sólo se cierra si el
       clic ocurrió fuera de él, para no bloquear sus propias acciones. */
    document.addEventListener('click', ev => {
      $$('.select').forEach(s => s.classList.remove('is-open'));
      if (!ev.target.closest('#notifPanel') && !ev.target.closest('#btnBell')) {
        $('#notifPanel').classList.remove('is-open');
      }
    });
  },

  /* ---------- Sidebar ---------- */
  sidebar() {
    $('#nav').addEventListener('click', e => {
      const t = e.target.closest('[data-toggle-group]');
      if (!t) return;
      const g = t.closest('.nav__group');
      if (document.body.classList.contains('collapsed')) {
        document.body.classList.remove('collapsed');
        STATE.collapsed = false;
        setTimeout(() => g.classList.add('is-open'), 60);
        return;
      }
      g.classList.toggle('is-open');
    });

    $('#btnCollapse').addEventListener('click', () => {
      STATE.collapsed = !STATE.collapsed;
      document.body.classList.toggle('collapsed', STATE.collapsed);
      setTimeout(() => CHARTS.instance && CHARTS.instance.resize(), 460);
    });

    $('#btnMobileNav').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  },

  /* ---------- Panel IA ---------- */
  ai() {
    $('#fab').addEventListener('click', () => AI.open());
    $('#btnCloseAi').addEventListener('click', AI.close);
    $('#aiScrim').addEventListener('click', AI.close);

    $('#aiForm').addEventListener('submit', e => {
      e.preventDefault();
      AI.send($('#aiInput').value);
    });

    $('#askInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { AI.open($('#askInput').value); $('#askInput').value = ''; }
    });
    $('#btnAsk').addEventListener('click', () => {
      const v = $('#askInput').value.trim();
      AI.open(v || '¿Qué está pasando hoy?');
      $('#askInput').value = '';
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { AI.close(); document.body.classList.remove('nav-open'); }
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#askInput').focus(); }
    });
  },

  /* ---------- Métricas del gráfico ---------- */
  chartTabs() {
    $('#chartMetrics').addEventListener('click', e => {
      const b = e.target.closest('.seg');
      if (!b) return;
      $$('#chartMetrics .seg').forEach(s => s.classList.toggle('is-active', s === b));
      STATE.chartMetric = b.dataset.metric;
      CHARTS.update();
    });
  },

  /* ---------- Otros ---------- */
  misc() {
    $('#btnBell').addEventListener('click', e => {
      e.stopPropagation();
      $('#notifPanel').classList.toggle('is-open');
    });
    $('#btnReadAll').addEventListener('click', () => {
      DATA.notifications.forEach(n => n.unread = false);
      UI.renderNotifications();
      UTIL.toast('Notificaciones marcadas como leídas');
    });

    $('#btnPrivacy').addEventListener('click', () => {
      STATE.privacy = !STATE.privacy;
      document.body.classList.toggle('privacy', STATE.privacy);
      $('#btnPrivacy').classList.toggle('is-on', STATE.privacy);
      UTIL.toast(STATE.privacy ? 'Modo privacidad activado' : 'Modo privacidad desactivado');
    });

    $('#btnNetWorth').addEventListener('click', () => {
      STATE.wealthVisible = !STATE.wealthVisible;
      UI.renderWealth();
    });

    $('#btnPrepDay').addEventListener('click', () => AI.open('Prepárame el día de hoy'));

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (!window.Chart) CHARTS.update(); }, 220);
    });
  }
};

/* ==========================================================================
   8. BOOT
   ========================================================================== */
(function boot() {
  UI.renderStatic();
  UI.renderAll();
  EVENTS.init();
  AI.welcome();

  /* Latido de datos: simula la llegada de información en vivo desde las fuentes.
     Al conectar APIs reales, reemplazar por polling/websocket sobre DATA. */
  setInterval(() => {
    if (DATA.real) return;                        // con datos reales no se simula nada
    if (STATE.view !== 'home' || document.hidden) return;
    const k = DATA.kpis[2];                       // Ventas del mes
    k.value = +(k.value + (Math.random() - 0.42) * 0.05).toFixed(2);
    UI.renderKPIs();
  }, 22000);

  console.log('%cORQUESTADOR PACO', 'color:#3B82F6;font-weight:700;letter-spacing:.2em');
  console.log('%cExecutive Command Center · v1.0 · datos simulados', 'color:#8FA3B8');
})();
