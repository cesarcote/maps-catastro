# Endpoints, tiles y subcapas del mapa

Este documento describe las fuentes ArcGIS usadas por la aplicacion, como se consultan, como se renderizan los tiles y como se manejan las subcapas filtrables.

## Resumen de librerias

- `leaflet`: render principal del mapa, marcadores, poligonos, `fitBounds` y calculo de distancia con `L.LatLng.distanceTo`.
- `esri-leaflet`: consumo de servicios ArcGIS en Leaflet:
  - `esri.tiledMapLayer` para mapa base cacheado por tiles.
  - `esri.dynamicMapLayer` para render dinamico de subcapas seleccionadas.
  - `esri.query` para consultas a Feature Layers y MapServer layers.
- `HttpClient`: usado solo para los servicios de busqueda de direccion/CHIP y geometria de lote.

## Busqueda de direccion, CHIP y geometria de lote

### Consulta SIIC por direccion o CHIP

Endpoint:

```text
https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC
```

Uso en codigo:

- Archivo: `src/app/services/search.ts`
- Metodo direccion: `searchByAddress(address)`
- Metodo CHIP: `searchChipInfo(chip)`

Parametros:

| Caso | Parametro | Valor |
| --- | --- | --- |
| Direccion | `Opcion` | `2` |
| CHIP | `Opcion` | `3` |
| Ambos | `Identificador` | Direccion o CHIP ingresado |
| Ambos | `f` | `json` |

Flujo:

1. El usuario busca por direccion o CHIP.
2. El servicio retorna datos SIIC, incluyendo `LOTEID` cuando encuentra resultado.
3. Con ese `LOTEID` se consulta la geometria del lote.

### Consulta de geometria por LOTEID

Endpoint:

```text
https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query
```

Uso en codigo:

- Archivo: `src/app/services/search.ts`
- Metodo: `searchByLoteId(loteIds)`

Parametros:

| Parametro | Valor |
| --- | --- |
| `where` | `LOTLOTE_ID IN ('<LOTEID>')` |
| `outFields` | `*` |
| `returnGeometry` | `true` |
| `outSR` | `4326` |
| `f` | `json` |

Render:

- La geometria llega como poligono ArcGIS (`rings`).
- Se convierte a coordenadas Leaflet con `MapUtils.parseRingsToLatLng`.
- Se dibuja un `L.polygon` con estilo rojo/amarillo.
- Se calcula el centro del lote y se agrega un marcador.
- El mapa hace `fitBounds` al lote con `maxZoom: 19`.

## Mapa base por tiles cacheados

Endpoint:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer
```

Uso en codigo:

- Archivo: `src/app/components/map/map.ts`
- Constante: `CATASTRO_TILE_URL`
- Metodo: `addTiledBaseLayer()`

Implementacion:

```ts
esri.tiledMapLayer({
  url: CATASTRO_TILE_URL,
  maxZoom: 20,
  attribution: 'Powered by Esri | IDECA - UAECD, Secretaria General de la Alcaldia Mayor de Bogota D.C.',
})
```

Comportamiento:

- Este modo usa el cache de tiles del servicio ArcGIS.
- Es el modo mas rapido para navegar porque las imagenes ya estan precalculadas en el servidor.
- No se seleccionan subcapas desde la app.
- El servicio decide que capas aparecen segun el nivel de zoom/escala del tile.
- En la UI corresponde al modo `Mapa Base`.

## Modo filtro por subcapas dinamicas

Endpoint:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer
```

Uso en codigo:

- Archivo: `src/app/components/map/map.ts`
- Metodo: `addDynamicLayer(layerIds)`
- Metodo: `applyFilteredLayers()`
- UI: modo `Filtrar Capas`

Implementacion:

```ts
const dynamicLayer = esri.dynamicMapLayer({
  url: CATASTRO_TILE_URL,
  opacity: 0.85,
  maxZoom: 20,
  attribution: 'Powered by Esri | IDECA - UAECD',
});

dynamicLayer.setLayers(layerIds);
```

Comportamiento:

- La app no usa tiles cacheados en este modo.
- Usa un `dynamicMapLayer` y envia al MapServer la lista de IDs de subcapas activas.
- `applyFilteredLayers()` toma todos los grupos marcados, junta sus `ids`, elimina duplicados y llama `setLayers`.
- Al cambiar de zoom, se reduce temporalmente la opacidad a `0.4` durante `zoomstart` y vuelve a `0.85` en `zoomend`.
- Al volver a `Mapa Base`, se remueve el dynamic layer y se reestablece el tiled layer.

### Rangos de niveles del servicio base

El servicio `mapa_base_3857` organiza las capas por escala. En el codigo se mapean IDs equivalentes de una misma tematica en varios niveles para que una categoria siga apareciendo al navegar entre escalas.

| Nivel | Escala aproximada | Rango de IDs |
| --- | --- | --- |
| Nivel 11 | 0.5K | `0-23` |
| Nivel 10 | 1K | `24-47` |
| Nivel 9 | 2K | `48-71` |
| Nivel 8 | 4.5K | `72-95` |
| Nivel 7 | 9K | `96-129` |
| Nivel 6 | 18K | `130-161` |
| Nivel 5 | 36K | `162-348` |
| Nivel 4 | 72K | `349-385` |
| Nivel 3 | 144K | `386-415` |
| Nivel 2 | 288K | `416-432` |
| Nivel 1 | 577K | `433-444` |
| Nivel 0 | 1155K | `445-453` |

### Grupos filtrables y subcapas usadas

| Grupo UI | Key | IDs de subcapas |
| --- | --- | --- |
| Parques | `parques` | `17, 41, 65, 87, 120, 151, 338, 377, 408, 423` |
| Lote / Manzana | `lote` | `19, 43, 67, 91, 122, 154, 341, 379, 409, 426, 440` |
| Malla Vial | `mallaVial` | `9, 33, 58, 80, 114, 146, 333, 368, 400, 421, 353, 354, 355, 392, 393, 394, 376, 404, 427, 438, 450` |
| Sector Catastral | `sectorCatastral` | `3, 27, 51, 75, 108, 109, 139, 140, 327, 366` |
| Localidad | `localidad` | `4, 28, 52, 76, 99, 100, 141, 142, 362, 361, 357, 390, 391, 372, 389, 396, 397, 399, 420` |
| Construccion | `construccion` | `7, 8, 31, 32, 55, 56, 81, 82, 112, 113, 144, 331` |
| Hidrografia | `hidrografia` | `12, 36, 59, 85, 116, 147, 334, 370, 402, 425, 437, 449, 13, 37, 60, 86, 117, 148, 335, 371, 403, 101, 102, 103, 133, 134, 165, 364, 360, 328, 329, 104, 105, 106, 107, 135, 136, 137, 138, 365, 358, 359, 398, 363, 324, 325, 326, 395, 320, 321, 322` |
| Arbolado Urbano | `arboladoUrbano` | `5, 29, 53, 77, 110, 143, 330, 367` |
| Curva de Nivel | `curvaNivel` | `16, 40, 64, 89, 118, 150, 337, 374, 407` |
| Area Urbana | `areaUrbana` | `23, 47, 71, 95, 128, 160, 347, 384, 414, 430, 443` |
| Vegetacion / NDVI | `vegetacion` | `20, 21, 22, 44, 45, 46, 68, 69, 70, 92, 93, 94, 125, 126, 127, 157, 158, 159, 344, 345, 346, 380, 381, 382, 411, 412, 413` |
| Area Protegida | `areaProtegida` | `129, 161, 348, 385, 415, 432, 444, 453` |
| Separador | `separador` | `14, 38, 61, 79, 115, 149, 336` |
| Cicloruta | `cicloruta` | `10, 34, 57, 83` |
| Anden | `anden` | `11, 35, 62, 84` |
| Puente | `puente` | `6, 30, 54, 78, 111, 145, 332` |
| Punto Geodesico | `puntoGeodesico` | `1, 25, 49, 73, 97, 131, 163, 350, 387, 417` |
| Sitio de Interes | `sitioInteres` | `2, 26, 50, 74, 98, 132, 164, 351, 388, 18, 42, 66, 90, 121, 153, 340, 378, 405, 424` |
| Lote Bode / Manzana Bode | `loteBode` | `15, 39, 63, 88, 119, 152, 339, 375` |
| Departamento | `departamento` | `123, 155, 342, 369, 401, 422, 418, 419, 436, 434, 435, 448, 446, 447` |
| Municipio | `municipio` | `124, 156, 343, 373, 406, 428, 439, 451` |

## Overlay Nombre Geografico

Endpoint:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0
```

Uso en codigo:

- Archivo: `src/app/components/map/map.ts`
- Constante: `NOMBRE_GEO_URL`
- Metodo principal: `applyNombreGeoOverlay()`
- Query helper: `queryFeaturePage()`

Campos consultados:

```text
OBJECTID, NGEIDENTIF, NGENOMBRE, NGECLASIFI, NGECPOSTAL, NGENALTERN
```

Categorias disponibles:

| Codigo | Label |
| --- | --- |
| `AMBI` | Ambiente |
| `COM-IND-TURI` | Comercio, Industria y Turismo |
| `CULT` | Cultura |
| `DEP-REC` | Deporte y Recreacion |
| `EDUC` | Educacion |
| `FUN-PUB` | Funcion Publica |
| `SALUD` | Salud |
| `SEG-JUS` | Seguridad y Justicia |
| `TRANS` | Transporte |
| `UNADM` | Unidad Administrativa |

Consulta global por categoria:

```text
where: NGECLASIFI = '<CODIGO>'
fields: OBJECTID,NGEIDENTIF,NGENOMBRE,NGECLASIFI,NGECPOSTAL,NGENALTERN
returnGeometry: true
offset: <pagina>
limit: 2000
```

Comportamiento:

- No se usa `esri.featureLayer` para esta capa porque ese enfoque consulta por viewport y cambia con zoom/pan.
- Se usa `esri.query` paginado y se agregan resultados a un `L.LayerGroup`.
- La capa se renderiza con markers estaticos de Leaflet.
- Los iconos vienen de `src/app/components/map/service-icons.ts` como PNG base64.
- Si un base64 no es valido o no existe, se usa un marcador circular fallback.
- El cache de features es por categoria y vive solo dentro de `MapComponent`.
- En `ngOnDestroy()` se limpia el cache para que no quede memoria ocupada al navegar a otra ruta.

Comportamiento despues de buscar CHIP/direccion:

- Al iniciar una busqueda se cancela la carga visual de POIs completos de Nombre Geografico.
- Tambien se remueve visualmente la capa global de Troncales si estaba activa.
- Primero se renderiza el lote.
- Luego se calculan los POIs cercanos por radio.
- Despues de la busqueda no se reactiva automaticamente la carga global de Nombre Geografico.
- El mapa queda enfocado en el lote y los tags/punteros de cercanos calculados.
- Si el usuario quiere volver a ver todos los POIs de una categoria, debe activar manualmente los checkboxes de overlays.

## Overlay Estaciones Troncales TransMilenio

Endpoint:

```text
https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0
```

Uso en codigo:

- Archivo: `src/app/components/map/map.ts`
- Constante: `TRONCALES_URL`
- Metodo: `addTroncalesLayer()`

Consulta:

```text
where: 1=1
returnGeometry: true
limit: 200
```

Campos consultados:

```text
objectid,
nombre_estacion,
numero_estacion,
troncal_estacion,
ubicacion_estacion,
tipo_estacion,
numero_vagones_estacion,
numero_accesos_estacion,
biciestacion_estacion,
componente_wifi
```

Render:

- Se consulta todo el dataset porque el volumen es bajo.
- Se transforma a `L.geoJSON`.
- `pointToLayer` crea `L.marker` con icono PNG base64 de estaciones troncales.
- Los popups muestran nombre, troncal, numero, tipo, ubicacion, vagones, accesos, biciestacion y WiFi si existen.

## Distancias a POIs cercanos

Servicio:

- Archivo: `src/app/services/nearest-poi.ts`
- Clase: `NearestPoiService`
- Provider: se registra en `MapComponent`, no en `root`, para que el cache viva solo mientras vive el mapa.
- La implementacion actual no precarga todos los POIs de Bogota. Cada busqueda de CHIP/direccion dispara consultas delimitadas por radio alrededor del centro del lote.
- El estado del panel se maneja con Angular Signals:
  - `nearestPoiRows = signal<NearestPoiDistanceRow[]>(...)`
  - `showNearestPoiPanel = computed(...)`
- Las respuestas de Esri/Leaflet entran por `NgZone.run(...)` para que las actualizaciones externas actualicen la UI.

Endpoints usados:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0
https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0
```

Categorias calculadas:

| Resultado | Fuente | Filtro |
| --- | --- | --- |
| Hospital | Nombre Geografico | `NGECLASIFI = 'SALUD' AND UPPER(NGENOMBRE) LIKE '%HOSPITAL%'` |
| Clinica | Nombre Geografico | `NGECLASIFI = 'SALUD' AND (UPPER(NGENOMBRE) LIKE '%CLINICA%' OR UPPER(NGENOMBRE) LIKE '%CLÍNICA%')` |
| CAI | Nombre Geografico | `NGECLASIFI = 'SEG-JUS' AND (UPPER(NGENOMBRE) LIKE 'CAI %' OR UPPER(NGENALTERN) LIKE 'CAI%')` |
| Centro comercial | Nombre Geografico | `NGECLASIFI = 'COM-IND-TURI' AND (UPPER(NGENOMBRE) LIKE '%CENTRO COMERCIAL%' OR UPPER(NGENOMBRE) LIKE '%C.C.%' OR UPPER(NGENOMBRE) LIKE '% CC %')` |
| Estacion TM | Troncales | `tipo_estacion !== 1` y nombre sin `PORTAL` |
| Portal TM | Troncales | `tipo_estacion === 1` o nombre contiene `PORTAL` |

Consulta:

```text
where: <filtro>
fields: campos necesarios por categoria
returnGeometry: true
nearby: centro del lote + radio en metros
offset: <pagina dentro del radio>
limit: 2000 para Nombre Geografico, 200 para Troncales
```

Radios usados:

```text
5000 m -> 10000 m -> 20000 m
```

Comportamiento por categoria:

- Cada fila del panel consulta su categoria de forma independiente.
- Primero intenta buscar candidatos dentro de 5 km.
- Si no encuentra candidatos validos, amplia a 10 km.
- Si sigue vacia, amplia a 20 km.
- Si no hay resultados dentro de 20 km, la fila queda en `Sin datos`.
- Si una consulta falla, solo esa fila queda en `No disponible`; las demas siguen resolviendose.
- La consulta usa `esri.query(...).nearby(center, radiusMeters)`, lo que envia al ArcGIS Server parametros de distancia en metros.
- Las filas que siguen pendientes se muestran con skeleton compacto.
- Cada fila terminada actualiza el panel sin esperar a que terminen las demas categorias.

Calculo:

- El origen es el centro del lote buscado.
- Se calcula despues de pintar la geometria del lote.
- Para cada categoria se recorren solo los candidatos devueltos por la consulta delimitada por radio.
- Se usa `center.distanceTo(L.latLng(poi.lat, poi.lng))` para calcular la distancia exacta en cliente.
- Se filtran defensivamente candidatos cuya distancia exacta sea mayor que el radio consultado.
- Se toma solo el candidato mas cercano por categoria.
- El resultado se redondea a metros.
- Si la distancia es menor a 1000 se muestra en metros.
- Si es igual o mayor a 1000 se muestra en kilometros.

Render en mapa:

- Los resultados cercanos no dependen de los checkboxes de POIs.
- Se dibujan en una capa Leaflet independiente: `nearestPoiLayer`.
- Cada resultado `ready` crea un `L.marker` con `L.divIcon`.
- El marcador aparece como pin con codigo corto dentro.
- Al pasar el mouse sobre el pin se muestra un tooltip con la forma `Categoria · distancia`.
- Codigos usados en el pin: `H`, `CL`, `CAI`, `CC`, `TM`, `P`.
- Cada categoria usa un color distinto:

| Resultado | Color |
| --- | --- |
| Hospital | Rojo |
| Clinica | Fucsia |
| CAI | Azul |
| Centro comercial | Naranja |
| Estacion TM | Verde |
| Portal TM | Morado |

- El popup del marcador muestra categoria, nombre y distancia.
- Al iniciar una busqueda nueva se limpian los tags anteriores.
- Al destruir el componente tambien se limpia la capa de cercanos.

Cache:

- `NearestPoiService` no mantiene un cache global de POIs para distancias.
- Las consultas son por busqueda, categoria y radio.
- El componente usa tokens internos para ignorar resultados obsoletos cuando el usuario busca otro CHIP/direccion.
- En `ngOnDestroy()` se llama `nearestPoiService.clear()` y se limpian las filas del panel.
- Tambien se limpia `nearestPoiLayer`, para que los punteros no queden en memoria al navegar a otra ruta.

## Estados y persistencia

Persistencia en `localStorage`:

- Modo del mapa: `map_layer_mode`
- Grupos de subcapas seleccionados: `map_checked_groups`
- Overlays activos: `map_overlays`

No se persiste:

- Cache de Nombre Geografico.
- Cache de distancias a POIs.
- Resultados calculados de distancias.
- Features consultados desde ArcGIS.

Esto evita que al navegar a otra ruta queden caches pesados ocupando memoria.
