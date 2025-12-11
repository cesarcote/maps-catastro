import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly apiUrlAddress =
    'https://serviciosgis.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/Construcciones/MapServer/exts/CalcularAreaCons/consultaSIIC';
  private readonly apiUrlQuery =
    'https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/2/query';

  constructor(private readonly http: HttpClient) {}

  searchByAddress(address: string): Observable<any> {
    return this.http.get(this.apiUrlAddress, {
      params: {
        Opcion: '2',
        Identificador: address,
        f: 'json',
      },
    });
  }

  searchChipInfo(chip: string): Observable<any> {
    return this.http.get(this.apiUrlAddress, {
      params: {
        Opcion: '3',
        Identificador: chip,
        f: 'json',
      },
    });
  }

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
}
