// Boosted Karts' tracks: TUNR's own layouts, short and twisty (about half
// a minute a lap). Each is a handful of points (meters) that the game
// smooths into a curve and samples every 10 m, in the same form as Drift
// King's circuits (decimeters), so both games share the track code.

const LAYOUTS = [
  {
    id: "sunset",
    name: "Sunset Loop",
    blurb: "Wide and flowing, with one big hairpin. Start here.",
    look: "sunset",
    ctrl: [[0, 0], [0, -80], [12, -140], [50, -170], [100, -160], [120, -120], [100, -80], [110, -40], [160, -20], [200, -40], [230, -90], [270, -100], [300, -60], [290, 20], [240, 60], [160, 70], [80, 60], [20, 40]],
  },
  {
    id: "downtown",
    name: "Neon Downtown",
    blurb: "Square corners round the city blocks, at night.",
    look: "cityNight",
    ctrl: [[0, 0], [0, -100], [8, -125], [30, -140], [85, -140], [107, -125], [118, -100], [118, -80], [130, -58], [152, -48], [190, -48], [212, -36], [222, -12], [222, 45], [212, 68], [190, 78], [145, 78], [124, 90], [114, 112], [114, 128], [103, 150], [80, 160], [30, 160], [8, 150], [0, 128]],
  },
  {
    id: "pines",
    name: "Pine Valley",
    blurb: "Esses through the trees. Chain your drifts.",
    look: "day",
    ctrl: [[0, 0], [-22, -60], [8, -110], [-22, -160], [10, -210], [70, -232], [130, -205], [150, -145], [200, -115], [250, -132], [285, -80], [265, -18], [205, 10], [182, 62], [122, 92], [62, 72], [30, 40]],
  },
  {
    id: "dunes",
    name: "Dune Run",
    blurb: "A long straight, then tight bends in the sand.",
    look: "desert",
    ctrl: [[0, 0], [0, -150], [30, -205], [95, -220], [155, -202], [185, -150], [172, -100], [198, -62], [172, -18], [185, 42], [160, 95], [100, 115], [40, 98], [8, 60]],
  },
];

const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

// A smooth closed curve through the points, sampled every `step` meters,
// flattened to [x, z, x, z, …] in decimeters.
function sample(ctrl, step = 10) {
  const m = ctrl.length;
  const fine = [];
  for (let i = 0; i < m; i++) {
    const [a, b, c, d] = [ctrl[(i - 1 + m) % m], ctrl[i], ctrl[(i + 1) % m], ctrl[(i + 2) % m]];
    for (let k = 0; k < 40; k++) fine.push([cr(a[0], b[0], c[0], d[0], k / 40), cr(a[1], b[1], c[1], d[1], k / 40)]);
  }
  const out = [fine[0]];
  let run = 0;
  for (let i = 1; i < fine.length; i++) {
    run += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]);
    if (run >= step) {
      out.push(fine[i]);
      run = 0;
    }
  }
  return out.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
}

export const KART_TRACKS = LAYOUTS.map(({ ctrl, ...t }) => ({ ...t, points: sample(ctrl) }));
