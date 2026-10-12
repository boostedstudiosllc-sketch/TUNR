// Turns what the flyer reader found (api/read-flyer.js) into the post-a-meet
// form's fields. Only fields the flyer actually gave are replaced, so
// anything the host typed first, or anything the flyer doesn't say, stays.
export function flyerToDraft(flyer, draft) {
  const next = { ...draft };
  const filled = [];
  const put = (field, value) => {
    if (value) {
      next[field] = value;
      filled.push(field);
    }
  };

  put("title", flyer.title);
  const location = [flyer.venue, flyer.address].filter(Boolean).join(", ");
  put("location", location);
  put("city", flyer.city);
  put("date", flyer.date);
  put("time", flyer.startTime);
  put("vibe", flyer.vibe);
  put("description", flyer.description);
  return { draft: next, filled };
}
