/**
 * Where a moving head points, from its pan and tilt: for the preview's view
 * from above and its view from the audience. Needs the head's calibration
 * (how far it pans and tilts, and which pan faces the audience), measured
 * once on the real rig, because none of that is in the DMX values.
 */
import { mountOf, type RigFixture } from "./model";

/** Typical budget moving heads: 540° pan, 270° tilt. */
export const DEFAULT_PAN_RANGE = 540;
export const DEFAULT_TILT_RANGE = 270;

export interface HeadCalibration {
  panRange: number;
  tiltRange: number;
  panFront: number;
  panTurns: "left" | "right";
  hung: boolean;
}

/** A head's calibration, or undefined until its front-facing pan has been measured. */
export function calibrationOf(f: RigFixture): HeadCalibration | undefined {
  if (f.panFront === undefined) return undefined;
  return {
    panRange: f.panRange ?? DEFAULT_PAN_RANGE,
    tiltRange: f.tiltRange ?? DEFAULT_TILT_RANGE,
    panFront: f.panFront,
    panTurns: f.panTurns ?? "left",
    hung: mountOf(f) === "truss",
  };
}

/**
 * The beam's direction as a unit vector: x towards stage left (the
 * audience's right, screen right in both views), up, and z towards the
 * audience. Tilt below 128 leans the beam the way the head faced when its
 * front pan was measured; above 128, the other way.
 */
export function beamDirection(cal: HeadCalibration, pan: number, tilt: number): { x: number; up: number; z: number } {
  const rad = Math.PI / 180;
  const tiltDeg = ((tilt - 128) / 255) * cal.tiltRange;
  const el = Math.min(180, Math.abs(tiltDeg)) * rad; // away from straight up (or down, hung)
  let az = ((pan - cal.panFront) / 255) * cal.panRange * (cal.panTurns === "left" ? 1 : -1);
  if (tiltDeg > 0) az += 180;
  const a = az * rad;
  const across = Math.sin(el);
  return { x: across * Math.sin(a), up: (cal.hung ? -1 : 1) * Math.cos(el), z: across * Math.cos(a) };
}
