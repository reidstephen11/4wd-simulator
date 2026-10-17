import type { CreekDef, GullyDef, TrackDef } from './mapTypes';
import type { DensePolyline } from './polyline';

/** A track after generation: dense centreline and its final height profile. */
export interface TrackInfo {
  def: TrackDef;
  poly: DensePolyline;
  /** Ground height along the centreline, one value per dense point. */
  profile: Float32Array;
}

export interface CreekInfo {
  def: CreekDef;
  poly: DensePolyline;
  /** Water surface height per dense point. */
  water: Float32Array;
  halfWidth: Float32Array;
}

/** An oriented static box (granite ledge, gully lip). Yaw in radians about +y. */
export interface StaticBox {
  kind: 'ledge' | 'gullyLip';
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  /** Tilt about the box's local z axis (radians), applied after yaw. */
  roll?: number;
  /** Chamfered granite hull; rendering and collision share the same vertices. */
  bevel?: number;
}

export interface GullyInfo {
  def: GullyDef;
  /** Unit direction along the gully. */
  dirX: number;
  dirZ: number;
  /** Bottom height of the trench at its centre. */
  bottom: number;
}

export interface TerrainFeatures {
  tracks: TrackInfo[];
  creek: CreekInfo;
  boxes: StaticBox[];
  gullies: GullyInfo[];
  /** Distance (m, clamped to 255) from each sample to the nearest track edge (0 = on a track). */
  trackDistance: Uint8Array;
  /** Distance (m, clamped to 255) from each sample to the creek's water edge (0 = in water). */
  creekDistance: Uint8Array;
}
