import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import * as esri from 'esri-leaflet';

export type NearestPoiKind =
  | 'hospital'
  | 'clinic'
  | 'cai'
  | 'mall'
  | 'tmStation'
  | 'tmPortal';

export interface NearestPoi {
  id: string;
  kind: NearestPoiKind;
  name: string;
  lat: number;
  lng: number;
  source: string;
}

export interface NearestPoiDistance extends NearestPoi {
  distanceMeters: number;
  formattedDistance: string;
}

type ArcGisFeature = {
  properties?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  geometry?: {
    coordinates?: number[];
    x?: number;
    y?: number;
  };
};

type ArcGisQueryResponse = {
  features?: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: {
    message?: string;
    details?: string[];
  };
};

type PoiQueryDefinition = {
  kind: NearestPoiKind;
  url: string;
  where: string;
  fields: string[];
  pageSize: number;
  source: string;
};

export const NEAREST_POI_KINDS: readonly NearestPoiKind[] = [
  'hospital',
  'clinic',
  'cai',
  'mall',
  'tmStation',
  'tmPortal',
];

export const NEAREST_POI_LABELS: Record<NearestPoiKind, string> = {
  hospital: 'Hospital',
  clinic: 'Clínica',
  cai: 'CAI',
  mall: 'Centro comercial',
  tmStation: 'Estación TM',
  tmPortal: 'Portal TM',
};

@Injectable()
export class NearestPoiService {
  private readonly debugDistances = true;
  private readonly nombreGeoUrl =
    'https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0';
  private readonly troncalesUrl =
    'https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0';
  private readonly searchRadiiMeters = [5000, 10000, 20000];
  private readonly nombreGeoFields = ['OBJECTID', 'NGENOMBRE', 'NGENALTERN', 'NGECLASIFI'];
  private readonly troncalesFields = [
    'objectid',
    'nombre_estacion',
    'tipo_estacion',
    'latitud_estacion',
    'longitud_estacion',
  ];

  private readonly definitions: Record<NearestPoiKind, PoiQueryDefinition> = {
    hospital: {
      kind: 'hospital',
      url: this.nombreGeoUrl,
      where: "NGECLASIFI = 'SALUD' AND UPPER(NGENOMBRE) LIKE '%HOSPITAL%'",
      fields: this.nombreGeoFields,
      pageSize: 2000,
      source: 'Nombre Geográfico',
    },
    clinic: {
      kind: 'clinic',
      url: this.nombreGeoUrl,
      where:
        "NGECLASIFI = 'SALUD' AND (UPPER(NGENOMBRE) LIKE '%CLINICA%' OR UPPER(NGENOMBRE) LIKE '%CLÍNICA%')",
      fields: this.nombreGeoFields,
      pageSize: 2000,
      source: 'Nombre Geográfico',
    },
    cai: {
      kind: 'cai',
      url: this.nombreGeoUrl,
      where:
        "NGECLASIFI = 'SEG-JUS' AND (UPPER(NGENOMBRE) LIKE 'CAI %' OR UPPER(NGENALTERN) LIKE 'CAI%')",
      fields: this.nombreGeoFields,
      pageSize: 2000,
      source: 'Nombre Geográfico',
    },
    mall: {
      kind: 'mall',
      url: this.nombreGeoUrl,
      where:
        "NGECLASIFI = 'COM-IND-TURI' AND (UPPER(NGENOMBRE) LIKE '%CENTRO COMERCIAL%' OR UPPER(NGENOMBRE) LIKE '%C.C.%' OR UPPER(NGENOMBRE) LIKE '% CC %')",
      fields: this.nombreGeoFields,
      pageSize: 2000,
      source: 'Nombre Geográfico',
    },
    tmStation: {
      kind: 'tmStation',
      url: this.troncalesUrl,
      where: "tipo_estacion <> 1 AND UPPER(nombre_estacion) NOT LIKE '%PORTAL%'",
      fields: this.troncalesFields,
      pageSize: 200,
      source: 'TransMilenio',
    },
    tmPortal: {
      kind: 'tmPortal',
      url: this.troncalesUrl,
      where: "tipo_estacion = 1 OR UPPER(nombre_estacion) LIKE '%PORTAL%'",
      fields: this.troncalesFields,
      pageSize: 200,
      source: 'TransMilenio',
    },
  };

  async findNearestByKind(
    kind: NearestPoiKind,
    center: L.LatLng,
  ): Promise<NearestPoiDistance | null> {
    const definition = this.definitions[kind];
    const label = NEAREST_POI_LABELS[kind];

    this.debugLog('inicio categoria', {
      kind,
      label,
      center: this.formatCenter(center),
      radiiMeters: this.searchRadiiMeters,
      where: definition.where,
      url: definition.url,
    });

    for (const radiusMeters of this.searchRadiiMeters) {
      this.debugLog('intento radio', {
        kind,
        label,
        radiusMeters,
        radiusKilometers: radiusMeters / 1000,
      });

      const features = await this.queryNearbyFeatures(definition, center, radiusMeters);
      const nearest = this.getNearestPoi(definition, features, center, radiusMeters);

      if (nearest) {
        this.debugLog('resultado categoria', {
          kind,
          label,
          radiusMeters,
          nearest,
        });
        return nearest;
      }

      this.debugLog('sin candidatos en radio', {
        kind,
        label,
        radiusMeters,
        receivedFeatures: features.length,
      });
    }

    this.debugLog('sin datos categoria', { kind, label, maxRadiusMeters: 20000 });
    return null;
  }

  clear(): void {
    // Intentionally empty: distance lookups are request-scoped and do not keep a global cache.
  }

  private async queryNearbyFeatures(
    definition: PoiQueryDefinition,
    center: L.LatLng,
    radiusMeters: number,
  ): Promise<ArcGisFeature[]> {
    const features: ArcGisFeature[] = [];
    let offset = 0;

    while (true) {
      this.debugLog('request pagina', {
        kind: definition.kind,
        source: definition.source,
        radiusMeters,
        offset,
        limit: definition.pageSize,
        center: this.formatCenter(center),
        where: definition.where,
      });

      const response = await this.queryFeaturePage(definition, center, radiusMeters, offset);

      if (response.error) {
        this.debugLog('error arcgis', {
          kind: definition.kind,
          radiusMeters,
          offset,
          error: response.error,
        });
        throw new Error(response.error.message || 'ArcGIS nearby query failed');
      }

      const pageFeatures = response.features || [];
      this.debugLog('respuesta pagina', {
        kind: definition.kind,
        radiusMeters,
        offset,
        pageFeatures: pageFeatures.length,
        exceededTransferLimit: Boolean(response.exceededTransferLimit),
      });

      if (pageFeatures.length === 0) break;

      features.push(...pageFeatures);
      offset += pageFeatures.length;

      if (!response.exceededTransferLimit && pageFeatures.length < definition.pageSize) break;
    }

    this.debugLog('fin query radio', {
      kind: definition.kind,
      radiusMeters,
      totalFeatures: features.length,
    });
    return features;
  }

  private queryFeaturePage(
    definition: PoiQueryDefinition,
    center: L.LatLng,
    radiusMeters: number,
    offset: number,
  ): Promise<ArcGisQueryResponse> {
    return new Promise((resolve, reject) => {
      esri
        .query({ url: definition.url })
        .where(definition.where)
        .nearby(center, radiusMeters)
        .fields(definition.fields)
        .returnGeometry(true)
        .offset(offset)
        .limit(definition.pageSize)
        .run((error: any, featureCollection: ArcGisQueryResponse, response: any) => {
          if (error) {
            this.debugLog('error request pagina', {
              kind: definition.kind,
              radiusMeters,
              offset,
              error,
            });
            reject(error);
            return;
          }

          resolve({
            features: featureCollection?.features || [],
            exceededTransferLimit: Boolean(
              response?.exceededTransferLimit || response?.properties?.exceededTransferLimit,
            ),
          });
        });
    });
  }

  private getNearestPoi(
    definition: PoiQueryDefinition,
    features: ArcGisFeature[],
    center: L.LatLng,
    radiusMeters: number,
  ): NearestPoiDistance | null {
    const candidates: NearestPoiDistance[] = [];
    let invalidGeometryOrName = 0;
    let outsideRadius = 0;

    features.forEach((feature) => {
      const poi = this.createPoi(definition, feature);
      if (!poi) {
        invalidGeometryOrName++;
        return;
      }

      const distanceMeters = Math.round(center.distanceTo(L.latLng(poi.lat, poi.lng)));
      if (distanceMeters > radiusMeters) {
        outsideRadius++;
        return;
      }

      candidates.push({
        ...poi,
        distanceMeters,
        formattedDistance: this.formatDistance(distanceMeters),
      });
    });

    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);

    this.debugLog('calculo distancias', {
      kind: definition.kind,
      radiusMeters,
      receivedFeatures: features.length,
      validCandidatesInRadius: candidates.length,
      invalidGeometryOrName,
      outsideRadius,
      nearest: candidates[0] || null,
    });

    this.debugTable(
      'top candidatos',
      definition.kind,
      radiusMeters,
      candidates.slice(0, 10).map((candidate) => ({
        name: candidate.name,
        distanceMeters: candidate.distanceMeters,
        formattedDistance: candidate.formattedDistance,
        lat: candidate.lat,
        lng: candidate.lng,
        source: candidate.source,
      })),
    );

    return candidates[0] || null;
  }

  private createPoi(definition: PoiQueryDefinition, feature: ArcGisFeature): NearestPoi | null {
    const attributes = this.getFeatureAttributes(feature);
    const coordinates = this.getFeatureCoordinates(feature);
    const lat = coordinates?.lat ?? null;
    const lng = coordinates?.lng ?? null;
    const objectId = attributes['OBJECTID'] ?? attributes['objectid'];
    const name =
      this.toText(attributes['NGENOMBRE']) ||
      this.toText(attributes['NGENALTERN']) ||
      this.toText(attributes['nombre_estacion']);

    if (lat === null || lng === null || !name) return null;

    return {
      id: `${definition.kind}:${String(objectId ?? name)}`,
      kind: definition.kind,
      name,
      lat,
      lng,
      source: definition.source,
    };
  }

  private getFeatureAttributes(feature: ArcGisFeature): Record<string, unknown> {
    return feature.properties || feature.attributes || {};
  }

  private getFeatureCoordinates(feature: ArcGisFeature): { lat: number; lng: number } | null {
    const coordinates = feature.geometry?.coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const lng = this.toFiniteNumber(coordinates[0]);
      const lat = this.toFiniteNumber(coordinates[1]);
      return lat === null || lng === null ? null : { lat, lng };
    }

    const lat = this.toFiniteNumber(feature.geometry?.y);
    const lng = this.toFiniteNumber(feature.geometry?.x);
    return lat === null || lng === null ? null : { lat, lng };
  }

  private formatDistance(distanceMeters: number): string {
    if (distanceMeters < 1000) {
      return `${distanceMeters} m`;
    }

    const kilometers = distanceMeters / 1000;
    return `${kilometers.toFixed(kilometers < 10 ? 1 : 0)} km`;
  }

  private toFiniteNumber(value: unknown): number | null {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private toText(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private formatCenter(center: L.LatLng): { lat: number; lng: number } {
    return {
      lat: Number(center.lat.toFixed(7)),
      lng: Number(center.lng.toFixed(7)),
    };
  }

  private debugLog(message: string, payload: Record<string, unknown>): void {
    if (!this.debugDistances) return;
    console.log(`[nearest-poi] ${message}`, payload);
  }

  private debugTable(
    message: string,
    kind: NearestPoiKind,
    radiusMeters: number,
    rows: Record<string, unknown>[],
  ): void {
    if (!this.debugDistances || rows.length === 0) return;
    console.log(`[nearest-poi] ${message}`, { kind, radiusMeters, count: rows.length });
    console.table(rows);
  }
}
