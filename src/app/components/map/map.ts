import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import * as esri from 'esri-leaflet';
import { SearchService } from '../../services/search';
import { MapUtils } from '../../shared/utils/map.utils';
import { NOMBRE_GEO_ICON_BASE64_BY_CODE, TRONCALES_ICON_BASE64 } from './service-icons';

/**
 * Thematic layer group definition.
 * Each group contains the ArcGIS sublayer IDs for that theme across ALL
 * zoom levels (Nivel 0-11) of the mapa_base_3857 MapServer.
 * This ensures the layer renders at every scale, not just specific zooms.
 */
interface LayerGroup {
  key: string;
  label: string;
  ids: number[];
  checked: boolean;
}

/** Category for the Nombre Geográfico overlay (POI categories) */
interface OverlayCategory {
  code: string;
  label: string;
  color: string;
  emoji: string;
  checked: boolean;
}

type EsriFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.html',
  styleUrl: './map.css',
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: false }) mapContainer!: ElementRef;

  searchType: 'address' | 'chip' = 'address';
  searchValue: string = '';
  results: any = null;
  errorMessage: string = '';
  resultInfo: { chip?: string; loteId?: string; address?: string } | null = null;

  addressExamples = ['KR 119B 73B 15', 'KR 21 9A 50 LC 278'];
  chipExamples = ['AAA0036YERJ', 'AAA0091PPTO'];

  /** Current layer mode: 'base' uses tiled cache, 'filter' uses dynamic with group selection */
  layerMode: 'base' | 'filter' = 'base';

  /** Count of active sublayer IDs in filter mode */
  selectedLayerCount: number = 0;

  /**
   * Thematic layer groups with sublayer IDs mapped across ALL zoom levels.
   *
   * The mapa_base_3857 service organizes layers into scale-based groups (Nivel 0-11).
   * Each "Nivel" contains the SAME thematic categories (Parques, Lote, Malla Vial, etc.)
   * but at a different scale. To see a theme at EVERY zoom, we must include its ID from
   * every Nivel where it exists.
   *
   * Structure per Nivel:
   *   Nivel 11 (0.5K)  → IDs 0-23
   *   Nivel 10 (1K)    → IDs 24-47
   *   Nivel 9  (2K)    → IDs 48-71
   *   Nivel 8  (4.5K)  → IDs 72-95
   *   Nivel 7  (9K)    → IDs 96-129
   *   Nivel 6  (18K)   → IDs 130-161
   *   Nivel 5  (36K)   → IDs 162-348
   *   Nivel 4  (72K)   → IDs 349-385
   *   Nivel 3  (144K)  → IDs 386-415
   *   Nivel 2  (288K)  → IDs 416-432
   *   Nivel 1  (577K)  → IDs 433-444
   *   Nivel 0  (1155K) → IDs 445-453
   */
  layerGroups: LayerGroup[] = [
    {
      key: 'parques',
      label: 'Parques',
      // Nivel 11→17, 10→41, 9→65, 8→87, 7→120, 6→151, 5→338, 4→377, 3→408, 2→423
      ids: [17, 41, 65, 87, 120, 151, 338, 377, 408, 423],
      checked: false,
    },
    {
      key: 'lote',
      label: 'Lote / Manzana',
      // Lote en Niveles 11-9, luego Manzana en Niveles 8-1
      // Nivel 11→19, 10→43, 9→67, 8→91, 7→122, 6→154, 5→341, 4→379, 3→409, 2→426, 1→440
      ids: [19, 43, 67, 91, 122, 154, 341, 379, 409, 426, 440],
      checked: false,
    },
    {
      key: 'mallaVial',
      label: 'Malla Vial',
      // Malla Vial + etiquetas en niveles bajos + Via en niveles aún más bajos
      // Nivel 11→9, 10→33, 9→58, 8→80, 7→114, 6→146, 5→333, 4→368(+353-355),
      // 3→400(+392-394), 2→421, 1→438(Via), 0→450(Via)
      ids: [
        9, 33, 58, 80, 114, 146, 333, 368, 400, 421,
        353, 354, 355, 392, 393, 394,
        376, 404, 427, 438, 450,
      ],
      checked: false,
    },
    {
      key: 'sectorCatastral',
      label: 'Sector Catastral',
      // Nivel 11→3, 10→27, 9→51, 8→75, 7→(108,109), 6→(139,140), 5→(327,366)
      ids: [3, 27, 51, 75, 108, 109, 139, 140, 327, 366],
      checked: false,
    },
    {
      key: 'localidad',
      label: 'Localidad',
      // Nivel 11→4, 10→28, 9→52, 8→76, 7→(99,100), 6→(141,142), 5→(362,361),
      // 4→(357,390,391,372), 3→(389,396,397,399), 2→420
      ids: [
        4, 28, 52, 76,
        99, 100, 141, 142, 362, 361,
        357, 390, 391, 372,
        389, 396, 397, 399, 420,
      ],
      checked: false,
    },
    {
      key: 'construccion',
      label: 'Construcción',
      // Construccion + Construccion Sombra
      // Nivel 11→(7,8), 10→(31,32), 9→(55,56), 8→(81,82), 7→(112,113), 6→144, 5→331
      ids: [7, 8, 31, 32, 55, 56, 81, 82, 112, 113, 144, 331],
      checked: false,
    },
    {
      key: 'hidrografia',
      label: 'Hidrografía',
      // Cuerpo de agua + Corriente de Agua + etiquetas + subtipos (Canal-Rio, Pantano, Embalse)
      ids: [
        // Cuerpo de agua: N11→12, N10→36, N9→59, N8→85, N7→116, N6→147, N5→334, N4→370, N3→402, N2→425, N1→437, N0→449
        12, 36, 59, 85, 116, 147, 334, 370, 402, 425, 437, 449,
        // Corriente de Agua: N11→13, N10→37, N9→60, N8→86, N7→117, N6→148, N5→335, N4→371, N3→403
        13, 37, 60, 86, 117, 148, 335, 371, 403,
        // Etiquetas Corriente: N7→(101,102,103), N6→(133,134), N5→(165,364), N4→(360,328,329)
        101, 102, 103, 133, 134, 165, 364, 360, 328, 329,
        // Etiquetas Cuerpo: N7→(104,105,106,107), N6→(135,136,137,138), N5→(365,358,359,398),
        // N4→(363,324,325,326), N3→(395,320,321,322)
        104, 105, 106, 107, 135, 136, 137, 138, 365, 358, 359, 398,
        363, 324, 325, 326, 395, 320, 321, 322,
      ],
      checked: false,
    },
    {
      key: 'arboladoUrbano',
      label: 'Arbolado Urbano',
      // Nivel 11→5, 10→29, 9→53, 8→77, 7→110, 6→143, 5→330, 4→367
      ids: [5, 29, 53, 77, 110, 143, 330, 367],
      checked: false,
    },
    {
      key: 'curvaNivel',
      label: 'Curva de Nivel',
      // Nivel 11→16, 10→40, 9→64, 8→89, 7→118, 6→150, 5→337, 4→374, 3→407
      ids: [16, 40, 64, 89, 118, 150, 337, 374, 407],
      checked: false,
    },
    {
      key: 'areaUrbana',
      label: 'Área Urbana',
      // Nivel 11→23, 10→47, 9→71, 8→95, 7→128, 6→160, 5→347, 4→384, 3→414, 2→430, 1→443
      ids: [23, 47, 71, 95, 128, 160, 347, 384, 414, 430, 443],
      checked: false,
    },
    {
      key: 'vegetacion',
      label: 'Vegetación / NDVI',
      // Vegetation + NDVI + NVDI per level
      ids: [
        20, 21, 22, 44, 45, 46, 68, 69, 70, 92, 93, 94,
        125, 126, 127, 157, 158, 159, 344, 345, 346,
        380, 381, 382, 411, 412, 413,
      ],
      checked: false,
    },
    {
      key: 'areaProtegida',
      label: 'Área Protegida',
      // Nivel 7→129, 6→161, 5→348, 4→385, 3→415, 2→432, 1→444, 0→453
      ids: [129, 161, 348, 385, 415, 432, 444, 453],
      checked: false,
    },
    {
      key: 'separador',
      label: 'Separador',
      // Nivel 11→14, 10→38, 9→61, 8→79, 7→115, 6→149, 5→336
      ids: [14, 38, 61, 79, 115, 149, 336],
      checked: false,
    },
    {
      key: 'cicloruta',
      label: 'Cicloruta',
      // Nivel 11→10, 10→34, 9→57, 8→83
      ids: [10, 34, 57, 83],
      checked: false,
    },
    {
      key: 'anden',
      label: 'Andén',
      // Nivel 11→11, 10→35, 9→62, 8→84
      ids: [11, 35, 62, 84],
      checked: false,
    },
    {
      key: 'puente',
      label: 'Puente',
      // Nivel 11→6, 10→30, 9→54, 8→78, 7→111, 6→145, 5→332
      ids: [6, 30, 54, 78, 111, 145, 332],
      checked: false,
    },
    {
      key: 'puntoGeodesico',
      label: 'Punto Geodésico',
      // Nivel 11→1, 10→25, 9→49, 8→73, 7→97, 6→131, 5→163, 4→350, 3→387, 2→417
      ids: [1, 25, 49, 73, 97, 131, 163, 350, 387, 417],
      checked: false,
    },
    {
      key: 'sitioInteres',
      label: 'Sitio de Interés',
      // Sitio de Interes + Lote Sitio de Interes combined
      ids: [
        // Sitio de Interes: N11→2, N10→26, N9→50, N8→74, N7→98, N6→132, N5→164, N4→351, N3→388
        2, 26, 50, 74, 98, 132, 164, 351, 388,
        // Lote Sitio de Interes: N11→18, N10→42, N9→66, N8→90, N7→121, N6→153, N5→340, N4→378, N3→405, N2→424
        18, 42, 66, 90, 121, 153, 340, 378, 405, 424,
      ],
      checked: false,
    },
    {
      key: 'loteBode',
      label: 'Lote Bode / Manzana Bode',
      // Lote Bode N11→15, N10→39, N9→63; Manzana Bode N8→88, N7→119, N6→152, N5→339, N4→375
      ids: [15, 39, 63, 88, 119, 152, 339, 375],
      checked: false,
    },
    {
      key: 'departamento',
      label: 'Departamento',
      // N7→123, N6→155, N5→342, N4→369, N3→401, N2→422(+418,419), N1→436(+434,435), N0→448(+446,447)
      ids: [123, 155, 342, 369, 401, 422, 418, 419, 436, 434, 435, 448, 446, 447],
      checked: false,
    },
    {
      key: 'municipio',
      label: 'Municipio',
      // N7→124, N6→156, N5→343, N4→373, N3→406, N2→428, N1→439, N0→451
      ids: [124, 156, 343, 373, 406, 428, 439, 451],
      checked: false,
    },
  ];

  // ─── Overlay Layers (independent of base/filter mode) ──────────────

  /** Nombre Geográfico: POI categories from IDECA (Feature Layer, EPSG:4326) */
  nombreGeoCategories: OverlayCategory[] = [
    { code: 'AMBI',         label: 'Ambiente',                     color: '#2e7d32', emoji: '🌿', checked: false },
    { code: 'COM-IND-TURI', label: 'Comercio, Industria y Turismo', color: '#e65100', emoji: '🏪', checked: false },
    { code: 'CULT',         label: 'Cultura',                      color: '#7b1fa2', emoji: '🎭', checked: false },
    { code: 'DEP-REC',      label: 'Deporte y Recreación',         color: '#1565c0', emoji: '⚽', checked: false },
    { code: 'EDUC',         label: 'Educación',                    color: '#283593', emoji: '🎓', checked: false },
    { code: 'FUN-PUB',      label: 'Función Pública',              color: '#546e7a', emoji: '🏛️', checked: false },
    { code: 'SALUD',        label: 'Salud',                        color: '#c62828', emoji: '🏥', checked: false },
    { code: 'SEG-JUS',      label: 'Seguridad y Justicia',         color: '#1a237e', emoji: '🛡️', checked: false },
    { code: 'TRANS',        label: 'Transporte',                   color: '#f9a825', emoji: '🚌', checked: false },
    { code: 'UNADM',       label: 'Unidad Administrativa',         color: '#00838f', emoji: '📍', checked: false },
  ];

  /** TransMilenio Troncal stations toggle */
  showTroncales: boolean = false;

  get checkedNombreGeoCount(): number {
    return this.nombreGeoCategories.filter((c) => c.checked).length;
  }

  private readonly STORAGE_KEY_MODE = 'map_layer_mode';
  private readonly STORAGE_KEY_GROUPS = 'map_checked_groups';
  private readonly STORAGE_KEY_OVERLAYS = 'map_overlays';

  private map!: L.Map;
  private geometryLayer = L.layerGroup();
  private tiledLayer: any;
  private dynamicLayer: any;

  /** Static GeoJSON layer for Nombre Geográfico POIs */
  private nombreGeoLayer: L.GeoJSON | null = null;
  /** Static GeoJSON layer for TransMilenio Troncal stations */
  private troncalesLayer: L.GeoJSON | null = null;
  private nombreGeoLoadId = 0;
  private troncalesLoadId = 0;

  private readonly NOMBRE_GEO_URL =
    'https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0';
  private readonly TRONCALES_URL =
    'https://gis.transmilenio.gov.co/arcgis/rest/services/Troncal/consulta_estaciones_troncales/MapServer/0';

  private readonly DEFAULT_POLYGON_STYLE = {
    color: '#e3192f',
    weight: 3,
    fillColor: '#FEB400',
    fillOpacity: 0.3,
  };

  private readonly CATASTRO_TILE_URL =
    'https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/Mapa_Referencia/mapa_base_3857/MapServer';

  get currentExamples(): string[] {
    return this.searchType === 'address' ? this.addressExamples : this.chipExamples;
  }

  get checkedGroupCount(): number {
    return this.layerGroups.filter((g) => g.checked).length;
  }

  setExample(example: string): void {
    this.searchValue = example;
  }

  constructor(private searchService: SearchService) {}

  ngOnInit(): void {
    this.restoreState();
  }

  ngAfterViewInit(): void {
    this.initMap();
    // Leaflet needs a post-render size check when created after view init
    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    if (this.map) return;
    if (!this.mapContainer?.nativeElement) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [4.6097, -74.0817],
      zoom: 14,
      minZoom: 5,
      maxZoom: 20,
      preferCanvas: true,
      zoomControl: true,
      attributionControl: true,
    });

    this.initMarkerIcons();

    // Initialize in the restored mode (base or filter)
    if (this.layerMode === 'filter') {
      this.applyFilteredLayers();
    } else {
      this.addTiledBaseLayer();
    }

    this.geometryLayer.addTo(this.map);

    // Restore overlay layers (these are independent of base/filter mode)
    this.applyNombreGeoOverlay();
    if (this.showTroncales) {
      this.addTroncalesLayer();
    }
  }

  private initMarkerIcons(): void {
    const iconDefault = L.icon({
      iconRetinaUrl: 'assets/marker-icon-2x.png',
      iconUrl: 'assets/marker-icon.png',
      shadowUrl: 'assets/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      tooltipAnchor: [16, -28],
      shadowSize: [41, 41],
    });

    L.Marker.prototype.options.icon = iconDefault;
  }

  // ─── Layer Mode Management ──────────────────────────────────────────

  /** Add the tiled (cached) base layer — shows all layers at all zoom levels */
  private addTiledBaseLayer(): void {
    this.tiledLayer = esri.tiledMapLayer({
      url: this.CATASTRO_TILE_URL,
      maxZoom: 20,
      attribution:
        'Powered by <a href="https://www.esri.com">Esri</a> | IDECA - UAECD, Secretaría General de la Alcaldía Mayor de Bogotá D.C.',
    });
    this.tiledLayer.addTo(this.map);
  }

  /** Remove the tiled base layer */
  private removeTiledLayer(): void {
    if (this.tiledLayer && this.map.hasLayer(this.tiledLayer)) {
      this.map.removeLayer(this.tiledLayer);
    }
  }

  /** Add a dynamic layer for filtering specific sublayer groups */
  private addDynamicLayer(layerIds: number[]): void {
    this.removeDynamicLayer();

    if (layerIds.length === 0) {
      this.selectedLayerCount = 0;
      return;
    }

    this.dynamicLayer = esri.dynamicMapLayer({
      url: this.CATASTRO_TILE_URL,
      opacity: 0.85,
      maxZoom: 20,
      attribution:
        'Powered by <a href="https://www.esri.com">Esri</a> | IDECA - UAECD',
    });
    this.dynamicLayer.setLayers(layerIds);

    this.map.on('zoomstart', () => this.dynamicLayer?.setOpacity(0.4));
    this.map.on('zoomend', () => this.dynamicLayer?.setOpacity(0.85));

    this.dynamicLayer.addTo(this.map);
    this.selectedLayerCount = layerIds.length;
  }

  /** Remove the dynamic overlay layer */
  private removeDynamicLayer(): void {
    if (this.dynamicLayer && this.map.hasLayer(this.dynamicLayer)) {
      this.map.removeLayer(this.dynamicLayer);
      this.dynamicLayer = null;
    }
  }

  /** Switch between base (tiled cache) and filter (dynamic) modes */
  setLayerMode(mode: 'base' | 'filter'): void {
    if (this.layerMode === mode) return;
    this.layerMode = mode;

    if (mode === 'base') {
      this.removeDynamicLayer();
      this.addTiledBaseLayer();
      // Uncheck all groups when switching back to base
      this.layerGroups.forEach((g) => (g.checked = false));
      this.selectedLayerCount = 0;
    } else {
      this.removeTiledLayer();
      this.applyFilteredLayers();
    }

    this.saveState();
  }

  /** Called when a group checkbox changes — recalculate active layers */
  onGroupToggle(): void {
    this.applyFilteredLayers();
    this.saveState();
  }

  /** Select all thematic groups */
  selectAllGroups(): void {
    this.layerGroups.forEach((g) => (g.checked = true));
    this.applyFilteredLayers();
    this.saveState();
  }

  /** Deselect all thematic groups */
  clearAllGroups(): void {
    this.layerGroups.forEach((g) => (g.checked = false));
    this.applyFilteredLayers();
    this.saveState();
  }

  // ─── Overlay Layers Management ────────────────────────────────────

  /** Called when a Nombre Geográfico category checkbox changes */
  onNombreGeoToggle(): void {
    this.applyNombreGeoOverlay();
    this.saveState();
  }

  /** Select all Nombre Geográfico categories */
  selectAllNombreGeo(): void {
    this.nombreGeoCategories.forEach((c) => (c.checked = true));
    this.applyNombreGeoOverlay();
    this.saveState();
  }

  /** Deselect all Nombre Geográfico categories */
  clearAllNombreGeo(): void {
    this.nombreGeoCategories.forEach((c) => (c.checked = false));
    this.applyNombreGeoOverlay();
    this.saveState();
  }

  /** Toggle TransMilenio Troncal stations */
  onTroncalesToggle(): void {
    if (this.showTroncales) {
      this.addTroncalesLayer();
    } else {
      this.removeTroncalesLayer();
    }
    this.saveState();
  }

  /** Create/update the Nombre Geográfico overlay with a global paginated query */
  private async applyNombreGeoOverlay(): Promise<void> {
    this.removeNombreGeoLayer();

    const checkedCodes = this.nombreGeoCategories
      .filter((c) => c.checked)
      .map((c) => c.code);

    if (checkedCodes.length === 0 || !this.map) return;

    const loadId = ++this.nombreGeoLoadId;

    // Build WHERE clause: NGECLASIFI IN ('AMBI','TRANS',...)
    const whereClause = `NGECLASIFI IN (${checkedCodes.map((c) => `'${c}'`).join(',')})`;

    try {
      const features = await this.queryAllFeatures(
        this.NOMBRE_GEO_URL,
        whereClause,
        ['OBJECTID', 'NGEIDENTIF', 'NGENOMBRE', 'NGECLASIFI', 'NGECPOSTAL', 'NGENALTERN'],
        2000,
      );

      if (loadId !== this.nombreGeoLoadId || !this.map) return;

      const featureCollection: EsriFeatureCollection = {
        type: 'FeatureCollection',
        features,
      };

      this.nombreGeoLayer = L.geoJSON(featureCollection as any, {
        pointToLayer: (feature: any, latlng: L.LatLng) => {
          const clasif = feature.properties?.NGECLASIFI || '';
          const icon = this.createNombreGeoIcon(clasif);

          if (icon) {
            return L.marker(latlng, { icon });
          }

          return this.createNombreGeoFallbackMarker(feature, latlng);
        },
        onEachFeature: (feature: any, layer: L.Layer) => {
          layer.bindPopup(this.createNombreGeoPopup(feature.properties || {}));
        },
      }).addTo(this.map);
    } catch (error) {
      if (loadId === this.nombreGeoLoadId) {
        console.error('Error loading Nombre Geográfico features', error);
      }
    }
  }

  /** Remove the Nombre Geográfico layer */
  private removeNombreGeoLayer(): void {
    this.nombreGeoLoadId++;
    if (this.nombreGeoLayer) {
      if (this.map?.hasLayer(this.nombreGeoLayer)) {
        this.map.removeLayer(this.nombreGeoLayer);
      }
      this.nombreGeoLayer = null;
    }
  }

  /** Add TransMilenio Troncal stations with a global paginated query */
  private async addTroncalesLayer(): Promise<void> {
    this.removeTroncalesLayer();
    if (!this.map) return;

    const loadId = ++this.troncalesLoadId;

    try {
      const features = await this.queryAllFeatures(
        this.TRONCALES_URL,
        '1=1',
        [
          'objectid',
          'nombre_estacion',
          'numero_estacion',
          'troncal_estacion',
          'ubicacion_estacion',
          'tipo_estacion',
          'numero_vagones_estacion',
          'numero_accesos_estacion',
          'biciestacion_estacion',
          'componente_wifi',
        ],
        200,
      );

      if (loadId !== this.troncalesLoadId || !this.map || !this.showTroncales) return;

      const featureCollection: EsriFeatureCollection = {
        type: 'FeatureCollection',
        features,
      };

      this.troncalesLayer = L.geoJSON(featureCollection as any, {
        pointToLayer: (_feature: any, latlng: L.LatLng) =>
          L.marker(latlng, { icon: this.createServiceIcon(TRONCALES_ICON_BASE64, 14, 'troncal-icon') }),
        onEachFeature: (feature: any, layer: L.Layer) => {
          layer.bindPopup(this.createTroncalesPopup(feature.properties || {}));
        },
      }).addTo(this.map);
    } catch (error) {
      if (loadId === this.troncalesLoadId) {
        console.error('Error loading TransMilenio Troncal features', error);
      }
    }
  }

  /** Remove the TransMilenio Troncal layer */
  private removeTroncalesLayer(): void {
    this.troncalesLoadId++;
    if (this.troncalesLayer) {
      if (this.map?.hasLayer(this.troncalesLayer)) {
        this.map.removeLayer(this.troncalesLayer);
      }
      this.troncalesLayer = null;
    }
  }

  private async queryAllFeatures(
    url: string,
    where: string,
    fields: string[],
    pageSize: number,
  ): Promise<any[]> {
    const features: any[] = [];
    let offset = 0;

    while (true) {
      const { featureCollection, response } = await this.runFeatureQuery(
        url,
        where,
        fields,
        pageSize,
        offset,
      );
      const pageFeatures = featureCollection?.features || [];

      if (pageFeatures.length === 0) break;

      features.push(...pageFeatures);
      offset += pageFeatures.length;

      const exceededTransferLimit = Boolean(
        response?.exceededTransferLimit || response?.properties?.exceededTransferLimit,
      );

      if (!exceededTransferLimit && pageFeatures.length < pageSize) break;
    }

    return features;
  }

  private runFeatureQuery(
    url: string,
    where: string,
    fields: string[],
    pageSize: number,
    offset: number,
  ): Promise<{ featureCollection: EsriFeatureCollection; response: any }> {
    return new Promise((resolve, reject) => {
      esri
        .query({ url })
        .where(where)
        .fields(fields)
        .returnGeometry(true)
        .offset(offset)
        .limit(pageSize)
        .run((error: any, featureCollection: EsriFeatureCollection, response: any) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({ featureCollection, response });
        });
    });
  }

  private createNombreGeoIcon(clasif: string): L.DivIcon | null {
    const base64 = NOMBRE_GEO_ICON_BASE64_BY_CODE[clasif];
    return base64 ? this.createServiceIcon(base64, 38, 'nombre-geo-icon') : null;
  }

  private createServiceIcon(base64: string, size: number, extraClassName: string): L.DivIcon {
    const halfSize = size / 2;

    return L.divIcon({
      className: `service-poi-icon ${extraClassName}`,
      html: `<img src="data:image/png;base64,${base64}" alt="" />`,
      iconSize: [size, size],
      iconAnchor: [halfSize, halfSize],
      popupAnchor: [0, -halfSize],
    });
  }

  private createNombreGeoFallbackMarker(feature: any, latlng: L.LatLng): L.CircleMarker {
    const clasif = feature.properties?.NGECLASIFI || '';
    const cat = this.nombreGeoCategories.find((c) => c.code === clasif);

    return L.circleMarker(latlng, {
      radius: 7,
      fillColor: cat?.color || '#888',
      color: '#fff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    });
  }

  private createNombreGeoPopup(props: any): string {
    const cat = this.nombreGeoCategories.find((c) => c.code === props.NGECLASIFI);

    return `<div style="max-width:220px;font-size:13px">
      <strong>${cat?.emoji || '📍'} ${props.NGENOMBRE || 'Sin nombre'}</strong><br>
      <span style="color:#666">${cat?.label || props.NGECLASIFI || ''}</span>
      ${props.NGECPOSTAL ? `<br><strong>C.P.:</strong> ${props.NGECPOSTAL}` : ''}
      ${props.NGENALTERN ? `<br><strong>Alt.:</strong> ${props.NGENALTERN}` : ''}
    </div>`;
  }

  private createTroncalesPopup(props: any): string {
    const tipoEstacionMap: Record<number, string> = {
      1: 'Cabecera',
      2: 'Intermedia',
      3: 'Intercambio',
    };
    const tipo = tipoEstacionMap[props.tipo_estacion] || props.tipo_estacion || '';

    return `<div style="max-width:240px;font-size:13px">
      <strong>🚉 ${props.nombre_estacion || 'Estación'}</strong><br>
      <span style="color:#666">${props.troncal_estacion || ''}</span>
      ${props.numero_estacion ? `<br><strong>N°:</strong> ${props.numero_estacion}` : ''}
      ${tipo ? `<br><strong>Tipo:</strong> ${tipo}` : ''}
      ${props.ubicacion_estacion ? `<br><strong>Ubicación:</strong> ${props.ubicacion_estacion}` : ''}
      ${props.numero_vagones_estacion ? `<br><strong>Vagones:</strong> ${props.numero_vagones_estacion}` : ''}
      ${props.numero_accesos_estacion ? `<br><strong>Accesos:</strong> ${props.numero_accesos_estacion}` : ''}
      ${props.biciestacion_estacion ? `<br><strong>Biciestación:</strong> ${props.biciestacion_estacion}` : ''}
      ${props.componente_wifi ? `<br><strong>WiFi:</strong> ${props.componente_wifi}` : ''}
    </div>`;
  }

  // ─── State Persistence ────────────────────────────────────────────

  /** Save current layer mode, checked groups, and overlay state to localStorage */
  private saveState(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_MODE, this.layerMode);
      const checkedKeys = this.layerGroups
        .filter((g) => g.checked)
        .map((g) => g.key);
      localStorage.setItem(this.STORAGE_KEY_GROUPS, JSON.stringify(checkedKeys));

      // Save overlay state
      const overlayState = {
        nombreGeo: this.nombreGeoCategories
          .filter((c) => c.checked)
          .map((c) => c.code),
        troncales: this.showTroncales,
      };
      localStorage.setItem(this.STORAGE_KEY_OVERLAYS, JSON.stringify(overlayState));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }

  /** Restore layer mode, checked groups, and overlay state from localStorage */
  private restoreState(): void {
    try {
      const savedMode = localStorage.getItem(this.STORAGE_KEY_MODE) as 'base' | 'filter' | null;
      if (savedMode === 'base' || savedMode === 'filter') {
        this.layerMode = savedMode;
      }

      const savedGroups = localStorage.getItem(this.STORAGE_KEY_GROUPS);
      if (savedGroups) {
        const checkedKeys: string[] = JSON.parse(savedGroups);
        this.layerGroups.forEach((g) => {
          g.checked = checkedKeys.includes(g.key);
        });
      }

      // Restore overlay state
      const savedOverlays = localStorage.getItem(this.STORAGE_KEY_OVERLAYS);
      if (savedOverlays) {
        const overlayState = JSON.parse(savedOverlays);
        if (overlayState.nombreGeo) {
          this.nombreGeoCategories.forEach((c) => {
            c.checked = overlayState.nombreGeo.includes(c.code);
          });
        }
        if (typeof overlayState.troncales === 'boolean') {
          this.showTroncales = overlayState.troncales;
        }
      }
    } catch {
      // localStorage unavailable or corrupt — use defaults
    }
  }

  /** Collect IDs from checked groups and update the dynamic layer */
  private applyFilteredLayers(): void {
    const allIds: number[] = [];
    this.layerGroups
      .filter((g) => g.checked)
      .forEach((g) => allIds.push(...g.ids));

    const uniqueIds = Array.from(new Set(allIds)).sort((a, b) => a - b);
    this.addDynamicLayer(uniqueIds);
  }

  // ─── Search ─────────────────────────────────────────────────────────

  search(): void {
    const value = this.searchValue.trim();
    if (!value) return;

    this.errorMessage = '';
    this.resultInfo = null;
    this.clearAll();

    const chipLike = /^[A-Za-z0-9]{8,15}$/;
    const shouldSearchByChip = this.searchType === 'chip' || chipLike.test(value);

    if (shouldSearchByChip) {
      const chip = value.toUpperCase();
      this.searchService.searchChipInfo(chip).subscribe({
        next: (res) => {
          this.results = res;
          console.log('SIIC CHIP info', res);

          const loteId = res?.LOTEID || res?.loteId || res?.LOTLOTE_ID;
          if (!loteId) {
            this.errorMessage = 'No se encontró LOTEID para el CHIP ingresado.';
            return;
          }

          this.resultInfo = {
            chip: chip,
            loteId: String(loteId),
            address: res?.DIRECCION_REAL || res?.DIRECCION,
          };

          this.fetchGeometryByLote(String(loteId), true);
        },
        error: (err) => {
          this.errorMessage = 'Error buscando CHIP';
          console.error(err);
        },
      });
      return;
    }

    this.searchService.searchByAddress(value).subscribe({
      next: (res) => {
        this.results = res;
        console.log('SIIC dirección', res);

        if (res?.Error) {
          this.errorMessage = res.Error;
          return;
        }

        const loteId = res?.LOTEID || res?.loteId || res?.LOTLOTE_ID;
        if (loteId) {
          this.resultInfo = {
            chip: res?.CHIP || loteId,
            loteId: String(loteId),
            address: res?.DIRECCION_REAL || res?.DIRECCION || value,
          };
          this.fetchGeometryByLote(String(loteId));
        } else {
          this.errorMessage = 'No se encontró LOTEID para la dirección ingresada.';
        }
      },
      error: (err) => {
        this.errorMessage = 'Error buscando dirección';
        console.error(err);
      },
    });
  }

  private fetchGeometryByLote(loteId: string, isChipSearch: boolean = false): void {
    this.searchService.searchByLoteId([loteId]).subscribe({
      next: (res) => {
        this.results = res;
        console.log('Lote geometry', res);
        const features = res.features && res.features.length > 0 ? res.features : [];

        if (features.length > 0) {
          this.updateResultInfoFromFeature(features[0]);
          this.displayFeatures(features);
        } else {
          this.errorMessage = isChipSearch
            ? 'No se encontraron resultados para el CHIP ingresado.'
            : 'No se encontraron resultados para el LOTEID obtenido de la dirección.';
        }
      },
      error: (err) => {
        this.errorMessage = isChipSearch ? 'Error buscando CHIP' : 'Error consultando geometría';
        console.error(err);
      },
    });
  }

  private updateResultInfoFromFeature(feature: any, fallbackChip?: string): void {
    const attrs = feature?.attributes || {};
    const chip =
      attrs.CHIP || attrs.LOTLOTE_ID || attrs.LOTLSIMBOL || attrs.LOTLSIMBOL1 || fallbackChip;
    const loteId =
      attrs.LOTLOTE_ID ||
      attrs.loteId ||
      attrs.LOTLSIMBOL ||
      attrs.LOTLSIMBOL1 ||
      attrs.CHIP ||
      fallbackChip;
    const address =
      attrs.LOTNOMBRE_P || attrs.DIRECCION_REAL || attrs.DIRECCION || this.resultInfo?.address;

    this.resultInfo = {
      chip: chip ?? this.resultInfo?.chip,
      loteId: loteId ?? this.resultInfo?.loteId,
      address: address ?? this.resultInfo?.address,
    };
  }

  private displayFeatures(features: any[]): void {
    if (!this.map || !features || features.length === 0) return;

    this.geometryLayer.clearLayers();

    const allBounds: L.LatLngExpression[] = [];

    features.forEach((feature) => {
      const geometry = feature.geometry;

      if (geometry?.rings && geometry.rings.length > 0) {
        const coordinates = MapUtils.parseRingsToLatLng(geometry.rings);
        const polygon = this.addPolygon(coordinates);

        const center = MapUtils.getPolygonCenter(coordinates);
        this.addMarker(center.lat, center.lng, feature.attributes);

        if (polygon) {
          allBounds.push(...coordinates);
        }
      }
    });

    if (allBounds.length) {
      const bounds = L.latLngBounds(allBounds as any);
      this.map.fitBounds(bounds, {
        maxZoom: 19,
        paddingTopLeft: [20, 20],
        paddingBottomRight: [80, 20],
      });
    }
  }

  private addPolygon(coordinates: L.LatLngExpression[]): L.Polygon | undefined {
    if (!this.map) return;

    const polygon = L.polygon(coordinates, this.DEFAULT_POLYGON_STYLE);
    polygon.addTo(this.geometryLayer);
    return polygon;
  }

  private addMarker(lat: number, lng: number, attributes?: any): void {
    if (!this.map) return;

    const iconOptions = MapUtils.getCustomMarkerOptions('#e3192f', 'pin');
    const customIcon = L.divIcon(iconOptions);

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(this.geometryLayer);

    if (attributes) {
      const popupContent = this.buildPopupContent(attributes);
      marker.bindPopup(popupContent).openPopup();
    }
  }

  private buildPopupContent(attributes: any): string {
    let content = '<div style="max-width: 200px;">';

    if (attributes.LOTLOTE_ID) {
      content += `<strong>CHIP:</strong> ${attributes.LOTLOTE_ID}<br>`;
    }
    if (attributes.LOTNOMBRE_P) {
      content += `<strong>Dirección:</strong> ${attributes.LOTNOMBRE_P}<br>`;
    }
    if (attributes.LOTAREA) {
      content += `<strong>Área:</strong> ${attributes.LOTAREA} m²<br>`;
    }

    content += '</div>';
    return content;
  }

  private clearAll(): void {
    this.geometryLayer.clearLayers();
  }
}
