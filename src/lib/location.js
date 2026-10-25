// Whether TUNR may use this device's location, and how to turn it on.
// TUNR reads location only when someone taps something that needs it
// (check-in, distances, alert home spot, "I'm here now"). It never tracks in
// the background, whatever the phone's setting ("Always" or "While Using"):
// a web app can't while closed, and TUNR doesn't ask to.

// granted | denied | prompt | unsupported. Browsers without the Permissions
// API (older Safari) report "prompt", so the first tap still asks.
export async function locationStatus() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
  try {
    if (!navigator.permissions?.query) return "prompt";
    const p = await navigator.permissions.query({ name: "geolocation" });
    return p.state;
  } catch {
    return "prompt";
  }
}

// Calls back whenever the setting changes (e.g. turned on in the browser).
export async function watchLocationStatus(onChange) {
  try {
    if (!navigator.permissions?.query) return () => {};
    const p = await navigator.permissions.query({ name: "geolocation" });
    const handler = () => onChange(p.state);
    p.addEventListener("change", handler);
    return () => p.removeEventListener("change", handler);
  } catch {
    return () => {};
  }
}

// Shows the phone's "Allow location?" prompt (only works while it hasn't
// been blocked). Resolves to the new status.
export function askForLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve("unsupported");
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (err) => resolve(err.code === 1 ? "denied" : "prompt"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

// Steps to turn location back on, for the device in hand.
export function enableSteps(ua = navigator.userAgent || "") {
  const homeScreen = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  if (/iPhone|iPad/.test(ua)) {
    return [
      "Open the Settings app → Privacy & Security → Location Services, and make sure it's on.",
      homeScreen
        ? "In that list, tap Safari Websites (TUNR from your Home Screen uses it) → choose While Using the App, and turn on Precise Location."
        : "In that list, tap Safari Websites → choose While Using the App, and turn on Precise Location.",
      "Back in Safari: tap the “aA” (or page menu) in the address bar → Website Settings → Location → Allow.",
      "Reopen TUNR and tap Turn on location.",
    ];
  }
  if (/Android/.test(ua)) {
    return [
      "Swipe down from the top of the screen and make sure Location is on.",
      "In Chrome, tap the icon left of the address (tune or lock) → Permissions → Location → Allow.",
      "Or: Chrome ⋮ menu → Settings → Site settings → Location → find TUNR under Blocked and set it to Allow.",
      "Reopen TUNR and tap Turn on location.",
    ];
  }
  return [
    "Click the icon to the left of the web address (lock or tune).",
    "Set Location to Allow, then reload the page.",
    "On a Mac, also check System Settings → Privacy & Security → Location Services for your browser.",
  ];
}

// What needs location, and what happens to it. All of these are switched
// off (shown locked) while location is off or blocked.
export const LOCATION_USES = [
  ["📍", "Checking in at meets for points", "Confirms you're within a quarter mile of the meet's pin"],
  ["🏁", "The stay-the-whole-meet bonus", "Same check, near the meet's end time"],
  ["📏", "Distances to meets", "Worked out on your phone; your location isn't sent to us"],
  ["🔔", "Linkup alerts near you", "Saved rounded to about half a mile, only if you set it"],
  ["🛣️", "“I'm here now” when posting a linkup", "Becomes the linkup's spot"],
];
