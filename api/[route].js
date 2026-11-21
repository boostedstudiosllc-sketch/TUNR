// Every /api/<name> request comes through here and goes to api/_routes/<name>.js.
//
// Why one file: Vercel's free (Hobby) plan deploys at most 12 server
// functions, and each file directly in api/ is one. With 13 or more, every
// deploy fails. Routes live in api/_routes/ (folders starting with "_" aren't
// deployed as functions), so new routes never count against the limit.
// api/m/[slug].js is the only other function.
//
// Add a route: put it in api/_routes/<name>.js (default export (req, res))
// and add a line below.

const ROUTES = {
  "confirm-email": () => import("./_routes/confirm-email.js"),
  daily: () => import("./_routes/daily.js"),
  hosts: () => import("./_routes/hosts.js"),
  "instagram-sync": () => import("./_routes/instagram-sync.js"),
  join: () => import("./_routes/join.js"),
  membership: () => import("./_routes/membership.js"),
  password: () => import("./_routes/password.js"),
  promote: () => import("./_routes/promote.js"),
  push: () => import("./_routes/push.js"),
  "read-flyer": () => import("./_routes/read-flyer.js"),
  reminders: () => import("./_routes/reminders.js"),
  "rush-finish": () => import("./_routes/rush-finish.js"),
  shop: () => import("./_routes/shop.js"),
  "sign-in": () => import("./_routes/sign-in.js"),
  "stripe-webhook": () => import("./_routes/stripe-webhook.js"),
  turn: () => import("./_routes/turn.js"),
  vin: () => import("./_routes/vin.js"),
};

export const ROUTE_NAMES = Object.keys(ROUTES);

export default async function handler(req, res) {
  const name = String(req.query?.route || "");
  const load = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!load) return res.status(404).json({ error: "not_found" });
  const mod = await load();
  return mod.default(req, res);
}
