import * as L from 'leaflet';

export class MapUtils {
  /**
   * Retorna las opciones de un marcador personalizado con color
   */
  static getCustomMarkerOptions(
    color: string = '#e3192f',
    markerType: 'pin' | 'circle' = 'pin'
  ): L.DivIconOptions {
    if (markerType === 'circle') {
      return {
        html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
        className: 'custom-marker-circle',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      };
    }

    // Pin marker (default)
    return {
      html: `
        <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z"
                fill="${color}"
                stroke="white"
                stroke-width="1.5"/>
          <circle cx="12.5" cy="12.5" r="4" fill="white"/>
        </svg>
      `,
      className: 'custom-marker-pin',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
    };
  }

  /**
   * Convierte coordenadas de rings (formato ArcGIS) a formato LatLng de Leaflet
   */
  static parseRingsToLatLng(rings: number[][][]): L.LatLngExpression[] {
    if (!rings || rings.length === 0) {
      console.error('Rings vacíos o inválidos');
      return [];
    }

    const mainRing = rings[0];
    return mainRing.map((coord: number[]) => [coord[1], coord[0]] as L.LatLngExpression);
  }

  /**
   * Calcula el centro de un polígono dado sus coordenadas
   */
  static getPolygonCenter(coordinates: L.LatLngExpression[]): L.LatLng {
    const polygon = L.polygon(coordinates);
    return polygon.getBounds().getCenter();
  }
}
