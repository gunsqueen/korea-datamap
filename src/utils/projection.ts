import proj4 from 'proj4';

// UTM-K (EPSG:5179) → WGS84 (EPSG:4326)
const UTMK =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 ' +
  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

proj4.defs('EPSG:5179', UTMK);
proj4.defs('EPSG:4326', WGS84);

/** UTM-K [x, y] → WGS84 [lng, lat] */
export function utmkToWgs84(x: number, y: number): [number, number] {
  const [lng, lat] = proj4('EPSG:5179', 'EPSG:4326', [x, y]);
  return [lng, lat];
}

/** GeoJSON coordinates 배열을 UTM-K → WGS84 변환 */
export function convertCoordinates(
  coordinates: number[][][] | number[][][][],
  type: 'Polygon' | 'MultiPolygon'
): number[][][] | number[][][][] {
  if (type === 'Polygon') {
    return (coordinates as number[][][]).map((ring) =>
      ring.map(([x, y]) => {
        const [lng, lat] = utmkToWgs84(x, y);
        return [lng, lat];
      })
    );
  } else {
    return (coordinates as number[][][][]).map((polygon) =>
      polygon.map((ring) =>
        ring.map(([x, y]) => {
          const [lng, lat] = utmkToWgs84(x, y);
          return [lng, lat];
        })
      )
    );
  }
}
