# Maps Catastro

Mapa Leaflet + Esri para buscar predios de Bogotá por Dirección o CHIP usando los servicios públicos de Catastro. Dibuja polígono, centra y marca el predio.

## Requisitos

- Node.js 18+ (LTS recomendado).
- npm (incluido con Node). No necesitas Angular CLI global; usamos `npx`.

## Instalación

```bash
npm install
```

## Correr en desarrollo

```bash
npm start
# o
ng serve
```

Abre `http://localhost:4200/`.

## Flujo de búsqueda

1. Selecciona Dirección o CHIP, escribe el valor y pulsa Buscar.
2. Dirección: SIIC (CalcularAreaCons) `Opcion=2&Identificador=<direccion>` → devuelve `LOTEID` (y CHIP si existe).
3. CHIP: SIIC `Opcion=3&Identificador=<chip>` → devuelve `LOTEID` y dirección real.
4. Geometría: con `LOTEID` se consulta `catastro1/MapServer/2/query` (`apiUrlQuery`) en WGS84 (`outSR=4326`). `where` busca en `LOTLOTE_ID`.
5. Render: Leaflet + esri-leaflet dibuja polígono, ajusta límites y coloca marcador custom (popup con CHIP/dirección/área si viene).

## Capa base (Catastro)

- Tiled layer: `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer`
- Opacidad baja al iniciar zoom y vuelve al terminar.

## Servicios usados

- SIIC (CalcularAreaCons):
  - Dirección → `.../consultaSIIC?Opcion=2&Identificador=<direccion>&f=json`
  - CHIP → `.../consultaSIIC?Opcion=3&Identificador/<chip>&f=json`
- Geometría por LOTE: `catastro1/MapServer/2/query`
  - Params: `where=LOTLOTE_ID IN (...)`, `outFields=*`, `returnGeometry=true`, `outSR=4326`, `f=json`.

## Comandos útiles

- Lint: `npx ng lint`
- Build prod: `npx ng build --configuration production`

## Notas

- Íconos Leaflet copiados en `public/`.
- Si el servicio no devuelve geometría para el LOTEID, verás mensaje de error y no se pinta el polígono.
