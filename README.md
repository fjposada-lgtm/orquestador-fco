# ORQUESTADOR PACO
### Executive Command Center · Grupo TX

Centro de comando ejecutivo para la dirección de Grupo TX. No es un dashboard de
administración genérico: la Home está diseñada para que en menos de 30 segundos
quede claro **cuánto vendimos, cuánto ganamos, cómo vamos contra presupuesto,
cuánta caja tenemos, dónde hay problemas, dónde hay oportunidades, qué decisiones
requieren atención y qué hay que hacer hoy**.

Construido en HTML, CSS y JavaScript puro. Sin frameworks, sin build, sin
dependencias que instalar.

---

## Cómo ejecutarlo

Abrir `index.html` en el navegador. Nada más.

Para desarrollo con recarga o para evitar restricciones de origen al conectar
APIs, se puede servir por HTTP:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Optimizado para monitor de 1440 px o superior; responsive hasta móvil.

---

## Estructura

```
index.html    Shell de la aplicación, sprite de iconos SVG y estructura de la Home
styles.css    Sistema visual completo, controlado por CSS variables
script.js     Lógica de la aplicación, separada en capas
```

`script.js` está dividido en ocho capas explícitas:

| Capa | Responsabilidad |
|------|-----------------|
| `DATA`   | Datos simulados. **Punto único de reemplazo por APIs.** |
| `STATE`  | Estado de la aplicación: vista, período, perímetro, privacidad |
| `UTIL`   | Formateo de cifras, fechas y helpers |
| `UI`     | Render de cada bloque de interfaz |
| `CHARTS` | Gráficos (Chart.js vía CDN, con renderer nativo de respaldo) |
| `AI`     | Motor conversacional simulado de Paco AI |
| `EVENTS` | Cableado de interacciones |
| `BOOT`   | Arranque |

---

## Qué incluye la Home

- **Seis KPIs ejecutivos**: ventas grupo, EBITDA, ventas del mes, caja,
  cuentas por cobrar y cumplimiento de producción.
- **Ventas y EBITDA** a 12 meses, con cinco métricas conmutables:
  ventas, EBITDA, margen, presupuesto y forecast.
- **Ventas por línea de negocio** con participación y margen.
- **Semáforo de empresas**: ocho sociedades con cumplimiento presupuestario,
  variación anual y estado verde / amarillo / rojo.
- **Alertas ejecutivas** priorizadas por impacto financiero, filtrables,
  cada una con su acción de análisis.
- **Agenda del gerente** con la reunión en curso destacada según la hora real.
- **Paco AI · Resumen ejecutivo** generado sobre el estado del grupo.
- **Mapa del grupo**: operación en Chile y Perú, expansión y mercados en evaluación.
- **Proyectos estratégicos**: avance, responsable, fecha objetivo, estado y riesgo.
- **Patrimonio**, oculto por defecto tras un botón explícito.
- **Módulos personales**: agenda, correo, tareas, documentos, viajes,
  entrenamiento, objetivos y familia.

### Controles transversales

- **Selector de período**: Hoy · Mes · Trimestre · YTD · Año.
- **Selector de perímetro**: Grupo Consolidado · Grupo TX · Hormigones ·
  Chile · Perú · Otras Empresas. Ambos recalculan KPIs, gráfico, tabla y
  distribución por negocio.
- **Modo privacidad**: difumina toda cifra monetaria de la interfaz.
- **Paco AI**: panel lateral conversacional. Cada KPI, empresa, alerta,
  proyecto y reunión abre la consulta correspondiente ya cargada.
- **Sidebar contraíble** con doce secciones y cerca de noventa módulos.
- Atajos: `Ctrl/Cmd + K` enfoca la barra de consulta, `Esc` cierra los paneles.

---

## Datos reales desde Power BI

La Home puede mostrar datos reales del modelo semántico
**Reporte_de_Ventas_Corporativo_TX** (área de trabajo *Gerencia*).

```powershell
powershell -ExecutionPolicy Bypass -File tools\actualizar-powerbi.ps1
```

El script pide iniciar sesión con un código de dispositivo de Microsoft, ejecuta
consultas DAX **de sólo lectura** y escribe `data-real/powerbi.json`. No
actualiza, publica ni modifica nada en Power BI ni en sus fuentes, y no guarda
el token. `data-real/` está excluido de git: las cifras reales no se versionan.

Al recargar, `js/powerbi.js` detecta el archivo y reemplaza los bloques que
tienen equivalente real. Si el archivo no existe, la Home sigue con los datos
simulados.

| Bloque de la Home | Origen con datos reales |
|-------------------|-------------------------|
| KPIs, gráfico de 12 meses, ventas por sociedad, semáforo | Medidas `Despachado Total Corporativo`, `Costo Total Corporativo` y `Proyeccion de Despacho Corporativo` |
| Alertas, resumen ejecutivo, notificaciones | Calculados sobre esas cifras |
| Paco AI: ventas, margen y sociedades | Calculado sobre esas cifras; el resto de sus respuestas se rotula como demostración |
| Agenda, mapa, proyectos, patrimonio, personal | Siguen simulados y se rotulan **Simulado** |

Definiciones: los montos van en millones de pesos (MM$). **Margen bruto** es
venta menos costo directo; no es EBITDA. **A terceros** es la venta menos lo
despachado a empresas relacionadas del grupo. Las variaciones del consolidado
se calculan en base comparable: excluyen las sociedades sin datos recientes.
Caja, cuentas por cobrar, producción y presupuesto no están en ese modelo y
por eso no aparecen en la Home con datos reales.

## Estado de los datos

**Todas las cifras del repositorio son simuladas.** Son internamente coherentes
—los totales, márgenes y participaciones cuadran entre sí— para que el sistema
se vea y se comporte como en operación real, pero no corresponden a información
financiera de Grupo TX.

## Cómo conectar datos reales

Toda la información vive en el objeto `DATA`, al inicio de `script.js`. Cada
bloque está escrito como el contrato de respuesta de un endpoint. Para conectar
una fuente basta con sustituir el bloque y volver a renderizar:

```js
const resumen = await fetch('/api/grupo/kpis').then(r => r.json());
DATA.kpis = resumen.kpis;
DATA.series = resumen.series;
UI.renderAll();
```

Ninguna función de render lee variables fuera de `DATA` y `STATE`, de modo que
la interfaz no requiere cambios al pasar de datos simulados a producción.

Integraciones previstas: Microsoft Power BI, ERP, CRM, sistemas contables,
bases SQL, APIs internas, Google Workspace, Microsoft 365, correo, calendario,
gestión documental, motores de IA, sistemas de producción y logística, e
información financiera y patrimonial.

---

## Seguridad

Este repositorio contiene únicamente la interfaz y datos ficticios. Al conectar
fuentes reales, las credenciales, cadenas de conexión y tokens **no deben
versionarse**: `.gitignore` ya excluye `.env`, `config.local.js`, `secrets.json`
y llaves. La información financiera y patrimonial real debe servirse desde un
backend autenticado, nunca embebida en el cliente.

---

## Licencia

Software propietario de Grupo TX. Todos los derechos reservados.
Uso interno. Prohibida su distribución sin autorización expresa.
