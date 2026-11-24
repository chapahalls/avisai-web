import brazilTopographyUrl from '../assets/rodar-brazil-topography.glb?url';
import worldWireframeUrl from '../assets/rodar-world-wireframe.glb?url';

/** Relevo brasileiro convertido offline do STL para pontos e curvas leves. */
export const HOME_BRAZIL_TOPOGRAPHY_URL = brazilTopographyUrl;

/** Esfera do pack fornecido, convertida offline para shell e wireframe leves. */
export const HOME_WORLD_WIREFRAME_URL = worldWireframeUrl;

/**
 * Projeção linear lon/lat → plano do mapa do Brasil gerado do STL.
 * Deve casar com TARGET_FRAME em scripts/generate-brazil-topography.mjs e com a
 * extensão geográfica do STL, para cidades caírem sobre o contorno.
 */
export const BRAZIL_EXTENT = { west: -73.99, east: -34.79, south: -33.75, north: 5.27 } as const;
export const BRAZIL_FRAME = { minX: -3.4, maxX: 3.46, minY: -4.43, maxY: 4.5 } as const;

const mapLinear = (value: number, a1: number, a2: number, b1: number, b2: number) =>
  b1 + ((value - a1) * (b2 - b1)) / (a2 - a1);

export function brazilLonLatToMap([longitude, latitude]: readonly [number, number]): [number, number] {
  return [
    mapLinear(longitude, BRAZIL_EXTENT.west, BRAZIL_EXTENT.east, BRAZIL_FRAME.minX, BRAZIL_FRAME.maxX),
    mapLinear(latitude, BRAZIL_EXTENT.south, BRAZIL_EXTENT.north, BRAZIL_FRAME.minY, BRAZIL_FRAME.maxY),
  ];
}

export function brazilMapToLonLat(x: number, y: number): [number, number] {
  return [
    mapLinear(x, BRAZIL_FRAME.minX, BRAZIL_FRAME.maxX, BRAZIL_EXTENT.west, BRAZIL_EXTENT.east),
    mapLinear(y, BRAZIL_FRAME.minY, BRAZIL_FRAME.maxY, BRAZIL_EXTENT.south, BRAZIL_EXTENT.north),
  ];
}
