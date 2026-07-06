# Documentación de mapas

## Objetivo del proyecto

El proyecto es una aplicación Angular que muestra un mapa de Bogotá usando Leaflet y servicios ArcGIS públicos. Su objetivo principal es permitir consultar un predio por dirección o CHIP, obtener su geometría, dibujarlo en el mapa y mostrar información adicional alrededor del lote, como puntos de interés cercanos.

La aplicación usa dos librerías principales:

- `leaflet`: pinta el mapa, polígonos, marcadores, popups y calcula distancias.
- `esri-leaflet`: conecta Leaflet con servicios ArcGIS como tiles, capas dinámicas y consultas geográficas.

## Fuentes principales de información

| Uso | Fuente | Endpoint base |
| --- | --- | --- |
| Buscar dirección o CHIP y obtener `LOTEID` | Catastro Bogotá - SIIC | `https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC` |
| Obtener geometría del predio | Catastro Bogotá - Capa de lotes | `https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query` |
| Mapa base y subcapas urbanas | Catastro Bogotá - mapa base 3857 | `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer` |
| Puntos de interés generales | Catastro Bogotá - Nombre Geográfico | `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0` |
| Estaciones TransMilenio | TransMilenio - estaciones troncales | `https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0` |

## Caso 1: obtener coordenadas y dibujar el predio

Este caso ocurre cuando el usuario busca un predio por dirección o por CHIP. El sistema no dibuja el predio directamente desde el texto ingresado; primero debe resolver ese texto a un identificador de lote.

### Flujo funcional

1. El usuario ingresa una dirección o un CHIP.
2. La aplicación consulta SIIC.
3. SIIC responde información del predio, incluyendo `LOTEID`.
4. Con ese `LOTEID`, la aplicación consulta la capa de lotes.
5. La capa de lotes retorna la geometría del predio.
6. La geometría llega como coordenadas de polígono en formato ArcGIS.
7. El frontend convierte esas coordenadas al formato que entiende Leaflet.
8. Leaflet dibuja el polígono, ubica un marcador en el centro y ajusta el zoom al predio.

### Búsqueda inicial por dirección o CHIP

La consulta inicial usa el endpoint SIIC:

```text
https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC
```

Para dirección se envía:

```text
Opcion=2
Identificador=<direccion>
f=json
```

Para CHIP se envía:

```text
Opcion=3
Identificador=<chip>
f=json
```

El dato clave de esta respuesta es `LOTEID`, porque con ese identificador se consulta la geometría real del lote.

### Consulta de geometría del predio

La geometría se obtiene desde:

```text
https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query
```

La aplicación envía:

```text
where=LOTLOTE_ID IN ('<LOTEID>')
outFields=*
returnGeometry=true
outSR=4326
f=json
```

`returnGeometry=true` indica que se necesitan las coordenadas del predio. `outSR=4326` indica que la respuesta debe venir en WGS84, que es el sistema de coordenadas usado habitualmente para latitud y longitud.

### Formato de coordenadas

ArcGIS entrega los polígonos como `rings`. Un ring es una lista de puntos que forman el contorno del polígono.

Ejemplo simplificado:

```json
{
  "geometry": {
    "rings": [
      [
        [-74.0817, 4.6097],
        [-74.0815, 4.6099],
        [-74.0813, 4.6096],
        [-74.0817, 4.6097]
      ]
    ]
  }
}
```

En ArcGIS el orden del punto es:

```text
[longitud, latitud]
```

En Leaflet el orden esperado para pintar en el mapa es:

```text
[latitud, longitud]
```

Por eso el frontend invierte cada punto antes de dibujar:

```text
ArcGIS: [-74.0817, 4.6097]
Leaflet: [4.6097, -74.0817]
```

La conversión está en `src/app/shared/utils/map.utils.ts`, en el método `parseRingsToLatLng`.

### Dibujo del predio

Cuando ya se tienen las coordenadas convertidas:

- Se crea un `L.polygon`.
- Se agrega a una capa independiente llamada `geometryLayer`.
- Se calcula el centro visual del predio.
- Se agrega un marcador en ese centro.
- Se ejecuta `fitBounds` para acercar el mapa al polígono.

El polígono se pinta con borde rojo y relleno amarillo semitransparente. El marcador puede mostrar información del lote en un popup, como CHIP, dirección y área, si esos campos vienen en la respuesta.

## Tiles y capas del mapa base

El mapa base viene del servicio:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer
```

Este servicio se usa de dos formas distintas.

### Opción 1: tiles completos cacheados

En el modo `Mapa Base`, la app usa:

```text
esri.tiledMapLayer
```

Un tile es una imagen pequeña del mapa. El servidor divide el mapa en muchas imágenes por nivel de zoom. Cuando el usuario navega, Leaflet solo descarga las imágenes necesarias para el área visible.

Este modo es el más conveniente para una visualización general porque:

- Las imágenes ya están precalculadas en el servidor.
- La navegación es más rápida.
- No hay que pedir capa por capa.
- El servicio ya trae el mapa completo según el zoom.
- La app no decide qué subcapa mostrar; lo decide el caché del servicio.

En este escenario, las tiles ya vienen listas con todas las capas que el servicio considera visibles para ese nivel de zoom. Esto es mejor para rendimiento porque el navegador recibe imágenes ya renderizadas, en lugar de pedir que el servidor genere una imagen nueva para cada combinación de capas.

### Opción 2: subcapas individuales filtrables

En el modo `Filtrar Capas`, la app usa:

```text
esri.dynamicMapLayer
```

Aquí ya no se usa el caché completo de tiles. La aplicación envía al MapServer una lista de IDs de subcapas que quiere ver. Por ejemplo:

```text
Parques: 17, 41, 65, 87, 120...
Lote / Manzana: 19, 43, 67, 91, 122...
Malla Vial: 9, 33, 58, 80, 114...
```

El servidor genera una imagen dinámica con solo esas subcapas. Esto permite prender y apagar temas como parques, lotes, vías, localidades, hidrografía, vegetación o municipios.

La ventaja es el control. La desventaja es que puede ser menos rápido que el caché completo, porque el servidor debe renderizar la combinación solicitada.

### Por qué las subcapas dependen del zoom

El servicio `mapa_base_3857` está organizado por niveles de escala. Una misma temática puede existir varias veces, con IDs distintos, porque cada ID corresponde a una escala diferente.

Ejemplo conceptual:

```text
Lote en zoom cercano: ID 19
Lote en otro nivel: ID 43
Manzana en zoom más alejado: ID 91
```

Por eso la app no guarda un solo ID por tema. Guarda varios IDs por grupo, cubriendo diferentes niveles. Si solo se activara un ID individual, la capa podría verse en un zoom, pero desaparecer al acercarse o alejarse. Para que una temática se mantenga visible a diferentes escalas, se activan todos los IDs equivalentes de ese grupo.

La app tiene grupos como:

- Parques.
- Lote / Manzana.
- Malla Vial.
- Sector Catastral.
- Localidad.
- Construccion.
- Hidrografia.
- Area Urbana.
- Vegetacion / NDVI.
- Municipio.

## Caso 2: capas extra y puntos cercanos

El segundo caso corresponde a información adicional que se pinta encima del mapa y del predio. Estas capas no hacen parte del polígono del lote; son overlays o resultados calculados a partir de otras fuentes.

Hay dos tipos principales:

- Capas adicionales globales: muestran puntos o estaciones completas según lo que active el usuario.
- Puntos cercanos al predio: se calculan automáticamente después de buscar un lote.

## Capas adicionales globales

### Nombre Geográfico

Fuente:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0
```

Esta capa trae puntos de interés clasificados por categoría. La app permite activar categorías como:

| Código | Categoría |
| --- | --- |
| `AMBI` | Ambiente |
| `COM-IND-TURI` | Comercio, Industria y Turismo |
| `CULT` | Cultura |
| `DEP-REC` | Deporte y Recreación |
| `EDUC` | Educación |
| `FUN-PUB` | Función Pública |
| `SALUD` | Salud |
| `SEG-JUS` | Seguridad y Justicia |
| `TRANS` | Transporte |
| `UNADM` | Unidad Administrativa |

La consulta se hace por categoría:

```text
where=NGECLASIFI = '<CODIGO>'
fields=OBJECTID,NGEIDENTIF,NGENOMBRE,NGECLASIFI,NGECPOSTAL,NGENALTERN
returnGeometry=true
```

La información que se usa de cada punto es:

- Identificador: `OBJECTID` o `NGEIDENTIF`.
- Nombre: `NGENOMBRE`.
- Categoría: `NGECLASIFI`.
- Código postal: `NGECPOSTAL`, si existe.
- Nombre alterno: `NGENALTERN`, si existe.
- Coordenadas del punto.

Estos puntos se renderizan como marcadores de Leaflet. Cuando existe ícono para la categoría, se usa un PNG en base64 definido en el proyecto. Si no existe ícono válido, se muestra un marcador circular con color de categoría.

### Estaciones troncales de TransMilenio

Fuente:

```text
https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0
```

La app consulta todas las estaciones con:

```text
where=1=1
returnGeometry=true
limit=200
```

Campos usados:

- `objectid`.
- `nombre_estacion`.
- `numero_estacion`.
- `troncal_estacion`.
- `ubicacion_estacion`.
- `tipo_estacion`.
- `numero_vagones_estacion`.
- `numero_accesos_estacion`.
- `biciestacion_estacion`.
- `componente_wifi`.

Cada estación se pinta como un marcador. El popup muestra nombre, troncal, número, tipo, ubicación, vagones, accesos, biciestación y WiFi cuando esa información está disponible.

## Puntos cercanos al predio

Después de dibujar el predio, la aplicación calcula el centro del lote y usa ese punto como origen para buscar servicios cercanos.

Categorías calculadas:

| Resultado | Fuente | Filtro |
| --- | --- | --- |
| Hospital | Nombre Geográfico | `NGECLASIFI = 'SALUD' AND UPPER(NGENOMBRE) LIKE '%HOSPITAL%'` |
| Clínica | Nombre Geográfico | `NGECLASIFI = 'SALUD' AND (UPPER(NGENOMBRE) LIKE '%CLINICA%' OR UPPER(NGENOMBRE) LIKE '%CLÍNICA%')` |
| CAI | Nombre Geográfico | `NGECLASIFI = 'SEG-JUS' AND (UPPER(NGENOMBRE) LIKE 'CAI %' OR UPPER(NGENALTERN) LIKE 'CAI%')` |
| Centro comercial | Nombre Geográfico | `NGECLASIFI = 'COM-IND-TURI' AND (UPPER(NGENOMBRE) LIKE '%CENTRO COMERCIAL%' OR UPPER(NGENOMBRE) LIKE '%C.C.%' OR UPPER(NGENOMBRE) LIKE '% CC %')` |
| Estación TM | TransMilenio | `tipo_estacion <> 1 AND UPPER(nombre_estacion) NOT LIKE '%PORTAL%'` |
| Portal TM | TransMilenio | `tipo_estacion = 1 OR UPPER(nombre_estacion) LIKE '%PORTAL%'` |

La búsqueda se hace por radios crecientes:

```text
5 km -> 10 km -> 20 km
```

Para cada categoría:

1. Se consulta ArcGIS alrededor del centro del lote.
2. Si hay candidatos dentro de 5 km, se calcula la distancia exacta y se toma el más cercano.
3. Si no hay candidatos, se intenta con 10 km.
4. Si sigue sin resultados, se intenta con 20 km.
5. Si no hay resultados dentro de 20 km, la categoría queda como `Sin datos`.

La distancia se calcula en el cliente con Leaflet:

```text
center.distanceTo(L.latLng(poi.lat, poi.lng))
```

El resultado se muestra en metros si es menor a 1000 m, o en kilómetros si supera ese valor. En el mapa se pinta un marcador por categoría encontrada, con código corto:

| Categoría | Código visual |
| --- | --- |
| Hospital | `H` |
| Clínica | `CL` |
| CAI | `CAI` |
| Centro comercial | `CC` |
| Estación TM | `TM` |
| Portal TM | `P` |

## Diferencia entre capas globales y puntos cercanos

| Aspecto | Capas globales | Puntos cercanos |
| --- | --- | --- |
| Quién las activa | Usuario con checkboxes | Se calculan después de buscar un predio |
| Origen | Categorías completas de servicios externos | Centro del lote consultado |
| Volumen | Puede traer muchos puntos | Solo busca candidatos por radio |
| Objetivo | Explorar información sobre el mapa | Responder qué servicio queda más cerca |
| Resultado visual | Marcadores por categoría o estaciones | Un marcador por categoría cercana |

## Resumen para presentar

El proyecto integra información geográfica de Catastro Bogotá y TransMilenio. Para dibujar un predio, primero convierte una dirección o CHIP en `LOTEID`, luego consulta la geometría del lote en WGS84, transforma las coordenadas de `[longitud, latitud]` a `[latitud, longitud]` y pinta el polígono en Leaflet.

El mapa base puede funcionar con tiles completos cacheados, que es la opción más rápida porque el servidor ya entrega imágenes listas por zoom, o con subcapas individuales, donde la app envía IDs específicos para filtrar temas. Esas subcapas dependen del zoom porque el servicio ArcGIS maneja IDs diferentes por escala.

Como segundo caso, el proyecto agrega capas extra de puntos de interés. Algunas se activan manualmente, como Nombre Geográfico o estaciones de TransMilenio. Otras se calculan automáticamente desde el centro del predio, buscando hospitales, clínicas, CAI, centros comerciales, estaciones y portales cercanos por radios de 5, 10 y 20 km.
