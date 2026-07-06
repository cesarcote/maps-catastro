# Maps Catastro

Aplicación Angular con Leaflet y Esri Leaflet para consultar predios de Bogotá por dirección o CHIP, obtener su geometría desde servicios públicos de Catastro, dibujar el polígono en el mapa y mostrar capas adicionales de puntos cercanos.

El proyecto integra información de Catastro Bogotá, IDECA y TransMilenio. El mapa puede trabajar con tiles cacheados para una vista base rápida o con subcapas filtrables cuando se necesita activar temas específicos como lotes, vías, parques, localidades o hidrografía.

Para más detalle sobre el origen de la información, coordenadas, tiles, subcapas y puntos cercanos, ver [documentación de mapas](documentacion/documentacion-mapas.md).

## Requisitos

- Node.js 18+ (LTS recomendado).
- npm (incluido con Node).

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

## Flujo resumido

1. El usuario busca por dirección o CHIP.
2. La app consulta SIIC para obtener el `LOTEID`.
3. Con el `LOTEID`, consulta la geometría del lote en `catastro1/MapServer/2/query`.
4. La geometría llega en WGS84 (`outSR=4326`) como `rings` de ArcGIS.
5. El frontend convierte las coordenadas al formato de Leaflet, dibuja el polígono, centra el mapa y calcula puntos cercanos.

## Documentación

- [Documentación de mapas](documentacion/documentacion-mapas.md): explicación principal para presentar el proyecto, incluyendo origen de información, coordenadas, tiles, subcapas y puntos cercanos.
- [Endpoints y capas](documentacion/endpoints-y-capas.md): detalle técnico de endpoints ArcGIS, capas, overlays y filtros.
- [Consulta de coordenadas por LOTEID](documentacion/consulta-coordenadas-por-loteid.md): flujo específico para obtener la geometría del predio.
- [Backend para POIs cercanos](documentacion/backend-pois-cercanos-simple.md): propuesta de endpoint backend para calcular puntos cercanos.

## Capa base

- Servicio: `https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer`
- Modo base: tiles cacheados completos.
- Modo filtro: subcapas individuales por IDs de ArcGIS.

## Servicios principales

- SIIC: búsqueda por dirección o CHIP para obtener `LOTEID`.
- Geometría por lote: consulta del polígono con `LOTLOTE_ID`.
- Mapa base 3857: tiles y subcapas urbanas.
- Nombre Geográfico: puntos de interés por categoría.
- TransMilenio troncales: estaciones y portales.

## Comandos útiles

- Lint: `npx ng lint`
- Build prod: `npx ng build --configuration production`

## Notas

- Íconos Leaflet copiados en `public/`.
- Si el servicio no devuelve geometría para el `LOTEID`, se muestra un mensaje de error y no se pinta el polígono.
