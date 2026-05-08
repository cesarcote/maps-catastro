# Endpoint backend para puntos cercanos

Este documento resume la implementacion esperada para un endpoint backend que reciba un CHIP y retorne los puntos cercanos al predio.

La idea es que el frontend llame un solo endpoint propio del backend. El backend debe resolver el predio asociado al CHIP, calcular el centro del predio y usar ese centro para buscar los lugares cercanos.

## Endpoint propuesto

```http
GET /api/puntos-cercanos?chip=AAA0000ABCD
```

Tambien puede ser `POST` si se prefiere enviar JSON:

```http
POST /api/puntos-cercanos
Content-Type: application/json
```

```json
{
  "chip": "AAA0000ABCD"
}
```

## Que recibe

El backend recibe el CHIP del predio.

| Campo | Tipo | Descripcion |
| --- | --- | --- |
| `chip` | `string` | CHIP del predio a consultar |

Ejemplo:

```json
{
  "chip": "AAA0000ABCD"
}
```

## Que hace internamente

El backend debe:

1. Consultar la informacion del CHIP para obtener el `LOTEID`.
2. Consultar la geometria del predio usando el `LOTEID`.
3. Calcular el centro del predio.
4. Usar ese centro como origen para buscar puntos cercanos.
5. Consultar cada categoria por radio.
6. Calcular la distancia exacta en metros.
7. Retornar el punto mas cercano por categoria.

La distancia se calcula desde el centro del predio, no desde una coordenada enviada por el usuario.

## Salida esperada

Debe devolver una lista con el lugar mas cercano por cada categoria.

Categorias esperadas:

- Hospital
- Clinica
- CAI
- Centro comercial
- Estacion TM
- Portal TM

Respuesta sugerida:

```json
{
  "chip": "AAA0000ABCD",
  "lot": {
    "loteId": "008213033003",
    "center": {
      "lat": 4.6401,
      "lng": -74.0636
    }
  },
  "results": [
    {
      "type": "cai",
      "label": "CAI",
      "id": "cai:12345",
      "name": "CAI Chapinero",
      "lat": 4.645764,
      "lng": -74.062216,
      "distanceMeters": 665,
      "source": "Nombre Geografico"
    },
    {
      "type": "clinic",
      "label": "Clinica",
      "id": "clinic:98765",
      "name": "Clinica de Marly S.A",
      "lat": 4.636612,
      "lng": -74.065062,
      "distanceMeters": 401,
      "source": "Nombre Geografico"
    },
    {
      "type": "tmStation",
      "label": "Estacion TM",
      "id": "tmStation:57",
      "name": "Temporal Calle 57",
      "lat": 4.642982,
      "lng": -74.065822,
      "distanceMeters": 387,
      "source": "TransMilenio"
    }
  ]
}
```

Si una categoria no tiene datos dentro del radio maximo:

```json
{
  "type": "tmPortal",
  "label": "Portal TM",
  "status": "EMPTY",
  "distanceMeters": null
}
```

## Endpoints para obtener el predio

### 1. Consultar CHIP y obtener LOTEID

Endpoint:

```text
https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC
```

Parametros:

```text
Opcion=3
Identificador=<CHIP>
f=json
```

Resultado esperado:

- Debe retornar informacion del CHIP.
- Se debe extraer `LOTEID`.

### 2. Consultar geometria del predio por LOTEID

Endpoint:

```text
https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query
```

Parametros:

```text
where=LOTLOTE_ID IN ('<LOTEID>')
outFields=*
returnGeometry=true
outSR=4326
f=json
```

Resultado esperado:

- Debe retornar la geometria del predio.
- Normalmente llega como poligono con `rings`.
- Con esa geometria se calcula el centro del predio.

## Como calcular el centro del predio

El origen para las distancias debe ser el centro del poligono del predio.

Opciones:

- Calcular el centroide del poligono.
- Usar el centro del bounding box del poligono si se quiere una implementacion mas simple.

Recomendacion:

- Usar centroide si el backend ya tiene libreria geometrica.
- Usar bounding box center si se necesita una primera version simple.

En Java se puede usar:

- JTS Topology Suite, recomendado para geometria.
- Calculo manual de bounding box si solo se necesita aproximacion.

## Endpoints ArcGIS para buscar puntos cercanos

El frontend no deberia llamar directamente estos endpoints para calcular cercanos. Los llama el backend.

### 1. Nombre Geografico

Se usa para:

- Hospital
- Clinica
- CAI
- Centro comercial

Endpoint ArcGIS:

```text
https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0/query
```

Campos necesarios:

```text
OBJECTID,NGENOMBRE,NGENALTERN,NGECLASIFI
```

### 2. Estaciones TransMilenio

Se usa para:

- Estacion TM
- Portal TM

Endpoint ArcGIS:

```text
https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0/query
```

Campos necesarios:

```text
objectid,nombre_estacion,tipo_estacion,latitud_estacion,longitud_estacion
```

## Filtros por categoria

Cada categoria se consulta con un `where` diferente.

| Categoria | Fuente | Filtro `where` |
| --- | --- | --- |
| Hospital | Nombre Geografico | `NGECLASIFI = 'SALUD' AND UPPER(NGENOMBRE) LIKE '%HOSPITAL%'` |
| Clinica | Nombre Geografico | `NGECLASIFI = 'SALUD' AND (UPPER(NGENOMBRE) LIKE '%CLINICA%' OR UPPER(NGENOMBRE) LIKE '%CLÍNICA%')` |
| CAI | Nombre Geografico | `NGECLASIFI = 'SEG-JUS' AND (UPPER(NGENOMBRE) LIKE 'CAI %' OR UPPER(NGENALTERN) LIKE 'CAI%')` |
| Centro comercial | Nombre Geografico | `NGECLASIFI = 'COM-IND-TURI' AND (UPPER(NGENOMBRE) LIKE '%CENTRO COMERCIAL%' OR UPPER(NGENOMBRE) LIKE '%C.C.%' OR UPPER(NGENOMBRE) LIKE '% CC %')` |
| Estacion TM | TransMilenio | `tipo_estacion <> 1 AND UPPER(nombre_estacion) NOT LIKE '%PORTAL%'` |
| Portal TM | TransMilenio | `tipo_estacion = 1 OR UPPER(nombre_estacion) LIKE '%PORTAL%'` |

## Consulta por cercania

La consulta a ArcGIS debe usar el centro del predio y un radio.

Parametros importantes:

```text
f=json
where=<filtro de categoria>
outFields=<campos necesarios>
returnGeometry=true
outSR=4326
inSR=4326
geometry=<lng>,<lat>
geometryType=esriGeometryPoint
spatialRel=esriSpatialRelIntersects
distance=<radio en metros>
units=esriSRUnit_Meter
resultOffset=<pagina>
resultRecordCount=<cantidad por pagina>
```

Ejemplo conceptual:

```text
GET <ARCGIS_QUERY_URL>
  ?f=json
  &where=<WHERE>
  &outFields=<FIELDS>
  &returnGeometry=true
  &outSR=4326
  &inSR=4326
  &geometry=-74.0636,4.6401
  &geometryType=esriGeometryPoint
  &spatialRel=esriSpatialRelIntersects
  &distance=5000
  &units=esriSRUnit_Meter
  &resultOffset=0
  &resultRecordCount=2000
```

Importante: ArcGIS recibe la geometria como `lng,lat`, no como `lat,lng`.

## Logica de radios

No se debe traer todo Bogota para calcular puntos cercanos.

Se recomienda buscar por radios crecientes:

```text
5 km -> 10 km -> 20 km
```

Flujo por categoria:

1. Consultar candidatos dentro de `5000` metros.
2. Si hay candidatos, calcular distancias y tomar el mas cercano.
3. Si no hay candidatos, consultar dentro de `10000` metros.
4. Si sigue vacio, consultar dentro de `20000` metros.
5. Si no hay candidatos dentro de `20000` metros, retornar `EMPTY`.

Cada categoria puede resolverse de forma independiente.

## Calculo de distancia

Aunque ArcGIS filtre por radio, el backend debe recalcular la distancia.

Motivos:

- Confirmar que el punto realmente cae dentro del radio.
- Ordenar correctamente los candidatos.
- Retornar la distancia exacta en metros.

La formula recomendada es Haversine.

Resultado:

```text
distanceMeters = distancia entre centro del predio y coordenada del punto cercano
```

Luego:

1. Descartar candidatos con distancia mayor al radio usado.
2. Ordenar por `distanceMeters`.
3. Tomar el primero.

## Paginacion

ArcGIS puede limitar los resultados.

Por eso cada consulta debe soportar paginacion:

```text
resultOffset=0
resultRecordCount=2000
```

Si la respuesta indica que hay mas resultados, consultar:

```text
resultOffset=2000
resultRecordCount=2000
```

Regla simple:

- Si la pagina llega vacia, terminar.
- Si llega menos que el limite, terminar.
- Si ArcGIS indica `exceededTransferLimit`, seguir paginando.

Valores sugeridos:

| Fuente | `resultRecordCount` |
| --- | --- |
| Nombre Geografico | `2000` |
| TransMilenio | `200` |

## Implementacion Spring Boot sugerida

Componentes minimos:

```text
PuntoCercanoController
PuntoCercanoService
PredioClient
ArcgisClient
DistanceCalculator
```

### Controller

Expone:

```text
GET /api/puntos-cercanos?chip=<chip>
```

Valida:

- `chip` requerido
- `chip` no vacio
- longitud/formato esperado segun reglas del sistema

### Service

Orquesta:

- busqueda del `LOTEID` por CHIP
- busqueda de geometria del predio
- calculo del centro del predio
- categorias de puntos cercanos
- filtros `where`
- radios crecientes
- calculo de distancia
- respuesta final

### PredioClient

Hace las llamadas HTTP a:

- `consultaSIIC` para obtener `LOTEID`
- `catastro1/MapServer/2/query` para obtener geometria

### ArcgisClient

Hace las llamadas HTTP a:

- Nombre Geografico `/query`
- TransMilenio `/query`

En Spring Boot puede usarse:

- `WebClient`, recomendado si se quieren ejecutar categorias en paralelo.
- `RestClient`, suficiente si se quiere algo mas simple y bloqueante.

Dependencias utiles:

- `spring-boot-starter-web`
- `spring-boot-starter-validation`
- `spring-boot-starter-webflux`, si se usa `WebClient`
- JTS Topology Suite, si se quiere calcular centroide con libreria geometrica

## Resumen

El backend deberia exponer un solo endpoint:

```text
GET /api/puntos-cercanos?chip=<chip>
```

Ese endpoint debe:

1. Recibir el CHIP.
2. Obtener el `LOTEID`.
3. Obtener la geometria del predio.
4. Calcular el centro del predio.
5. Consultar ArcGIS por cada categoria.
6. Usar filtros `where` para traer solo lo necesario.
7. Buscar por radio creciente: `5000`, `10000`, `20000` metros.
8. Paginar si ArcGIS limita resultados.
9. Calcular distancia exacta en Java desde el centro del predio.
10. Retornar el mas cercano por categoria con:
    - tipo
    - nombre
    - identificador
    - latitud
    - longitud
    - distancia en metros
    - fuente

El frontend solo consume la respuesta lista para pintar el panel y los marcadores en el mapa.
