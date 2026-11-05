// The phone's compass, for the convoy map: GPS only knows which way you're
// going while you're moving, so when you're stopped (or GPS gives no
// heading) the compass points your arrow. Pure, tested in test/compass.test.js.

// Degrees clockwise from north, or null, from a deviceorientation event.
// iPhones give webkitCompassHeading; Android's deviceorientationabsolute
// gives alpha counter-clockwise from north.
export function compassHeading(e) {
  if (!e) return null;
  if (Number.isFinite(e.webkitCompassHeading)) return ((e.webkitCompassHeading % 360) + 360) % 360;
  if (e.absolute && Number.isFinite(e.alpha)) return ((360 - e.alpha) % 360 + 360) % 360;
  return null;
}

// GPS heading while moving (3 mph or more), else the compass, else nothing.
export function pickHeading(gpsHeading, speedMph, compass) {
  const moving = Number.isFinite(speedMph) && speedMph >= 3;
  if (moving && Number.isFinite(gpsHeading)) return gpsHeading;
  if (Number.isFinite(compass)) return Math.round(compass) % 360;
  return Number.isFinite(gpsHeading) ? gpsHeading : null;
}
