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

export interface StaticLog {
  a: [number, number, number];
  b: [number, number, number];
  radius: number;
}

/**
 * A static granite hull. Vertices are relative to (x, y, z) with orientation baked in;
 * rendering draws these triangles and the collider is the convex hull of the same vertices.
 */
export interface StaticRock {
  x: number;
  y: number;
  z: number;
  vertices: Float32Array;
  indices: Uint32Array;
}

/** A bridge timber; `deck` parts carry `top`, the four corners of their running surface. */
export interface StaticTimber extends StaticRock {
  part: 'deck' | 'kerb' | 'post' | 'beam';
  /** Start-left, start-right, end-right, end-left, relative to (x, y, z). */
  top?: [number, number, number][];
}

/** A gate's two flag posts (left and right of the way through) and its numbered heading. */
export interface GateInfo {
  n: number;
  trackId: string;
  /** Direction of travel through the gate (degrees, 0 = north). */
  headingDeg: number;
  left: { x: number; y: number; z: number };
  right: { x: number; y: number; z: number };
}

export interface TerrainFeatures {
  tracks: TrackInfo[];
  creek: CreekInfo;
  boxes: StaticBox[];
  rocks: StaticRock[];
  logs: StaticLog[];
  /** Bridge decks, kerbs, posts and beams. */
  timbers: StaticTimber[];
  gates: GateInfo[];
  gullies: GullyInfo[];
  /** Distance (m, clamped to 255) from each sample to the nearest track edge (0 = on a track). */
  trackDistance: Uint8Array;
  /** Distance (m, clamped to 255) from each sample to the creek's water edge (0 = in water). */
  creekDistance: Uint8Array;
}
