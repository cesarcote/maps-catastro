import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import * as esri from 'esri-leaflet';
import { SearchService } from '../../services/search';
import { MapUtils } from '../../shared/utils/map.utils';

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

  private map!: L.Map;
  private geometryLayer = L.layerGroup();

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

  setExample(example: string): void {
    this.searchValue = example;
  }

  constructor(private searchService: SearchService) {}

  ngOnInit(): void {}

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
      minZoom: 12,
      maxZoom: 20,
      preferCanvas: true,
      zoomControl: true,
      attributionControl: true,
    });

    this.initMarkerIcons();
    this.addCatastroTileLayer();
    this.geometryLayer.addTo(this.map);
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

  private addCatastroTileLayer(): void {
    const catastroLayer = esri.tiledMapLayer({
      url: this.CATASTRO_TILE_URL,
      opacity: 0.8,
      maxZoom: 20,
      attribution:
        'Powered by <a href="https://www.esri.com">Esri</a> | IDECA - UAECD, Secretaría General de la Alcaldía Mayor de Bogotá D.C.',
    });

    this.map.on('zoomstart', () => catastroLayer.setOpacity(0.3));
    this.map.on('zoomend', () => catastroLayer.setOpacity(0.8));

    catastroLayer.addTo(this.map);
  }

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
