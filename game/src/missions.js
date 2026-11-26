// The sorties of Kestrel Isles: where each starts, its goals, fuel, wind, time of day and medal times.
import { airfieldById, runwayWorld } from './airfields.js';
import { heightAt } from './terrain.js';

/** A ring placed at (x, z), at least `agl` metres over the ground and never below `minY`. */
function ring(x, z, agl, radius = 22, minY = 0) {
  return { x, z, y: Math.max(heightAt(x, z) + agl, minY, agl), radius };
}

/** A ring placed in a field's runway frame (u along the landing heading, v to the right), y above field. */
function fieldRing(fieldId, u, v, above, radius = 24) {
  const af = airfieldById(fieldId);
  const p = runwayWorld(af, u, v);
  return { x: p.x, z: p.z, y: Math.max(af.elevation + above, heightAt(p.x, p.z) + 40), radius };
}

function runwayStart(fieldId, fromEnd = 30) {
  const af = airfieldById(fieldId);
  const p = runwayWorld(af, -af.length / 2 + fromEnd, 0);
  return { x: p.x, z: p.z, y: af.elevation, heading: af.heading, speed: 0, onGround: true };
}

export function buildMissions() {
  const valleyX = (z) => 300 + z * 0.25;
  return [
    {
      id: 'circuit', name: 'Morning Circuit', time: 'morning', tag: 'Training',
      brief: 'Take the Kestrel off Harbor Field, fly the five-ring circuit over the bay and land back on runway 35.',
      tips: 'Full throttle (Shift), rotate gently at 55 kt (S). On final: flaps 2, gear down, 65 kt, under 300 ft/min.',
      start: runwayStart('harbor'), fuel: 1, wind: { from: 80, speed: 2 },
      steps: [
        { type: 'takeoff' },
        { type: 'rings', points: [
          fieldRing('harbor', 1000, 0, 120), fieldRing('harbor', 1450, -650, 210), fieldRing('harbor', 500, -1150, 260),
          fieldRing('harbor', -700, -1150, 240), fieldRing('harbor', -1650, -560, 140), fieldRing('harbor', -1050, 0, 52, 26),
        ] },
        { type: 'land', field: 'harbor' },
      ],
      par: 260,
    },
    {
      id: 'valley', name: 'Spine Valley Run', time: 'noon', tag: 'Time trial',
      brief: 'Thread the rings up the valley that splits the northern ridge, then put down on the short Ridge Strip.',
      tips: 'Keep it low and fast through the gorge; bleed speed early — Ridge Strip is short and high.',
      start: { x: valleyX(2700), z: 2700, y: 180, heading: 352, speed: 58 }, fuel: 0.7, wind: { from: 200, speed: 3 },
      steps: [
        { type: 'rings', points: [1500, 950, 400, -150, -700, -1200, -1700].map((z, i) => ring(valleyX(z) + Math.sin(i * 1.3) * 60, z, 55 + (i % 2) * 25, 20)) },
        { type: 'land', field: 'ridge' },
      ],
      par: 200,
    },
    {
      id: 'mail', name: 'Lighthouse Mail', time: 'golden', tag: 'Delivery',
      brief: 'The keeper at Lighthouse Point is waiting on the mail. Fly east across the strait and land on runway 16 before sunset.',
      tips: 'Fuel is tight: climb to 1,500 ft, lean back to 70% throttle and let the crosswind drift you.',
      start: runwayStart('harbor'), fuel: 0.34, wind: { from: 60, speed: 7 },
      steps: [
        { type: 'takeoff' },
        { type: 'rings', points: [fieldRing('harbor', 1300, 120, 220, 40), ring(2300, 2300, 260, 45), fieldRing('light', -1500, 0, 160, 36)] },
        { type: 'land', field: 'light' },
      ],
      par: 300,
    },
    {
      id: 'supply', name: 'Ridge Supply Drop', time: 'morning', tag: 'Mountain',
      brief: 'Haul spares from Lighthouse Point up to Ridge Strip, a short field on the mountain shelf.',
      tips: 'Climb early: Ridge Strip sits on the shoulder of the range. Approach from the south-west, flaps 2.',
      start: runwayStart('light'), fuel: 0.55, wind: { from: 30, speed: 5 },
      steps: [
        { type: 'takeoff' },
        { type: 'rings', points: [ring(2400, 600, 260, 40), fieldRing('ridge', -1400, 0, 150, 34)] },
        { type: 'land', field: 'ridge' },
      ],
      par: 330,
    },
    {
      id: 'dusk', name: 'Dusk Patrol', time: 'dusk', tag: 'Night',
      brief: 'Check the three fishing beacons around the outer islets, then come home to Harbor Field by its runway lights.',
      tips: 'Watch the fuel gauge — this is a long loop. The green threshold lights mark the start of runway 35.',
      start: { x: -1500, z: 2900, y: 320, heading: 250, speed: 60 }, fuel: 0.5, wind: { from: 270, speed: 4 },
      steps: [
        { type: 'rings', points: [ring(-3900, 2900, 180, 55), ring(-3600, -2200, 240, 55), ring(-600, -3500, 650, 55), fieldRing('harbor', -1700, 0, 110, 40)] },
        { type: 'land', field: 'harbor' },
      ],
      par: 520,
    },
    {
      id: 'free', name: 'Free Flight', time: 'noon', tag: 'Sandbox',
      brief: 'No clock and no rings. Explore the Kestrel Isles, practise landings at all three fields.',
      tips: 'Press C to switch between chase and cockpit views. R restarts on the runway.',
      start: runwayStart('harbor'), fuel: 1, wind: { from: 90, speed: 2 },
      steps: [{ type: 'free' }],
      par: 0,
    },
  ];
}

/** Medal for a finished sortie: gold needs par time and a smooth landing. */
export function medalFor(mission, seconds, landing) {
  if (!mission.par) return null;
  const grade = landing ? landing.grade : 'none';
  const smooth = grade === 'butter' || grade === 'smooth';
  if (seconds <= mission.par && smooth) return 'gold';
  if (seconds <= mission.par * 1.35 && grade !== 'hard') return 'silver';
  return 'bronze';
}
