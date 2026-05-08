
# Consulta de Coordenadas por LOTEID (Backend)

## Paso a paso completo

### 1. Consulta inicial a SIIC (CalcularAreaCons)

Para obtener las coordenadas de un lote, primero se debe conocer el `LOTEID`. Este dato se obtiene consultando el servicio SIIC, que permite buscar por dirección o por CHIP:

- **Por Dirección:**
  - Endpoint: `https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC`
  - Parámetros:
    - `Opcion=2`
    - `Identificador=<direccion>`
    - `f=json`
  - Ejemplo:
    ```http
    GET .../consultaSIIC?Opcion=2&Identificador=CRA 7 # 12-34&f=json
    ```

- **Por CHIP:**
  - Mismo endpoint, pero:
    - `Opcion=3`
    - `Identificador=<chip>`
    - `f=json`
  - Ejemplo:
    ```http
    GET .../consultaSIIC?Opcion=3&Identificador=AAA0001234&f=json
    ```

La respuesta contiene, entre otros datos, el campo `LOTEID` (y a veces también el CHIP y la dirección real).

### 2. Consulta de geometría por LOTEID

Con el `LOTEID` obtenido, se consulta el servicio de geometría para obtener las coordenadas del lote:

- **Endpoint:**
  - `https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query`
- **Parámetros principales:**
  - `where=LOTLOTE_ID IN ('<LOTEID>')`
  - `outFields=*`
  - `returnGeometry=true`
  - `outSR=4326` (coordenadas en WGS84)
  - `f=json`
- **Ejemplo:**
  ```http
  GET .../query?where=LOTLOTE_ID IN ('ABC123')&outFields=*&returnGeometry=true&outSR=4326&f=json
  ```

La respuesta es un objeto con un array `features`, cada uno con:
- `geometry`: contiene las coordenadas del lote (en formato ArcGIS rings)
- `attributes`: información adicional (CHIP, dirección, área, etc.)

### 3. Conversión y renderizado

El frontend convierte los `rings` de ArcGIS a formato LatLng de Leaflet para renderizar el polígono del lote en el mapa.

#### Ejemplo de conversión (TypeScript)
```typescript
// src/app/shared/utils/map.utils.ts
static parseRingsToLatLng(rings: number[][][]): L.LatLngExpression[] {
  if (!rings || rings.length === 0) return [];
  const mainRing = rings[0];
  return mainRing.map((coord: number[]) => [coord[1], coord[0]] as L.LatLngExpression);
}
```

### 4. Código relevante del servicio de búsqueda
```typescript
// src/app/services/search.ts
searchByLoteId(loteIds: string[]): Observable<any> {
  const upperIds = loteIds.map((id) => id.toUpperCase());
  const quoted = upperIds.map((id) => `'${id}'`).join(',');
  const whereClause = `LOTLOTE_ID IN (${quoted})`;
  return this.http.get(this.apiUrlQuery, {
    params: {
      where: whereClause,
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
    },
  });
}
```

### 5. Flujo resumido

1. El usuario ingresa una dirección o CHIP y pulsa buscar.
2. Se consulta SIIC para obtener el `LOTEID`.
3. Con el `LOTEID`, se consulta el servicio de geometría para obtener las coordenadas.
4. El frontend convierte y dibuja el polígono en el mapa.
5. Si no se encuentra geometría, se muestra un mensaje de error.

---

**Notas:**
- El sistema usa EPSG:4326 (WGS84) para las coordenadas.
- Si el servicio no devuelve geometría para el LOTEID, se muestra un mensaje de error y no se pinta el polígono.
- Ver también: [README.md](../../README.md) sección "Flujo de búsqueda" y "Servicios usados".

**Notas:**
- Si el servicio no devuelve geometría para el LOTEID, se muestra un mensaje de error y no se pinta el polígono.
- El sistema usa EPSG:4326 (WGS84) para las coordenadas.
