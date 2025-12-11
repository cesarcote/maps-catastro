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
  private readonly apiUrlChipQuery =
    'https://sig.catastrobogota.gov.co/otrosservicios/rest/services/Cartografia/catastro1/MapServer/0/query';

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

  searchByChip(chips: string[]): Observable<any> {
    const upper = chips.map((c) => c.toUpperCase());
    const quoted = upper.map((c) => `'${c}'`).join(',');
    const whereClause = `UPPER(CHIP) IN (${quoted})`;

    return this.http.get(this.apiUrlChipQuery, {
      params: {
        where: whereClause,
        outFields: '*',
        returnGeometry: 'true',
        outSR: '4326',
        f: 'json',
      },
    });
  }

  searchByLoteId(loteIds: string[]): Observable<any> {
    const upperIds = loteIds.map((id) => id.toUpperCase());
    const quoted = upperIds.map((id) => `'${id}'`).join(',');

    const clauses = [
      `LOTLOTE_ID IN (${quoted})`,
      `UPPER(LOTLSIMBOL) IN (${quoted})`,
      `UPPER(LOTLSIMBOL1) IN (${quoted})`,
    ];

    const whereClause = clauses.join(' OR ');
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
