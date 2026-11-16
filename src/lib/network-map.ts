/**
 * Hand-placed positions for the HQ network map (/ops/network). This is a
 * schematic drawing of Abuja and nearby towns, not a survey map. North is up,
 * and the city centre is drawn larger so that neighbouring districts stay
 * readable. Keyed by delivery-zone slug. A new zone without an entry appears
 * in the table under the map.
 */
export const MAP_WIDTH = 1080;
export const MAP_HEIGHT = 820;

export const ZONE_POSITIONS: Record<string, { x: number; y: number }> = {
  // Abuja districts
  kubwa: { x: 330, y: 150 }, dawaki: { x: 480, y: 150 },
  gwarinpa: { x: 380, y: 230 }, katampe: { x: 580, y: 230 },
  "life-camp": { x: 330, y: 310 }, kado: { x: 450, y: 310 }, jahi: { x: 570, y: 310 }, maitama: { x: 720, y: 310 },
  jabi: { x: 440, y: 390 }, utako: { x: 550, y: 390 }, "wuse-ii": { x: 660, y: 390 }, wuse: { x: 780, y: 390 },
  wuye: { x: 500, y: 460 }, "central-area": { x: 680, y: 460 }, asokoro: { x: 830, y: 480 },
  durumi: { x: 560, y: 530 }, garki: { x: 720, y: 530 },
  galadimawa: { x: 470, y: 600 }, gudu: { x: 610, y: 600 }, apo: { x: 750, y: 600 },
  "airport-road": { x: 180, y: 620 }, lugbe: { x: 300, y: 670 }, lokogoma: { x: 560, y: 680 },
  gwagwalada: { x: 70, y: 560 },
  // Nearby towns (minimum order applies)
  bwari: { x: 600, y: 60 }, suleja: { x: 90, y: 60 }, madalla: { x: 190, y: 120 }, zuba: { x: 140, y: 210 },
  nyanya: { x: 930, y: 400 }, mararaba: { x: 990, y: 470 }, karu: { x: 960, y: 550 }, masaka: { x: 1010, y: 630 },
  kuje: { x: 330, y: 770 },
};

/** Outline for areas only HQ serves. */
export const HQ_COLOUR = "#8a8a85";

/**
 * Coverage shading: one hue, light to dark, by how many stores besides HQ
 * deliver to an area. `ink` is the colour of the order count drawn on the dot.
 */
export const COVERAGE_STEPS: { label: string; fill: string | null; ink: string }[] = [
  { label: "HQ only", fill: null, ink: "#33332f" },
  { label: "1 store", fill: "#86b6ef", ink: "#0d366b" },
  { label: "2 stores", fill: "#3987e5", ink: "#ffffff" },
  { label: "3+ stores", fill: "#1c5cab", ink: "#ffffff" },
];
export const coverageStep = (stores: number) => COVERAGE_STEPS[Math.min(stores, 3)];

/** Dot radius grows with the square root of orders, so area ∝ orders. */
export const dotRadius = (orders: number) => Math.min(26, 9 + Math.sqrt(orders) * 4);
