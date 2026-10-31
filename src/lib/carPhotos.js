import { supabase } from "./supabase.js";
import { withReason, friendlyWriteError } from "./errors.js";
import { uploadVehiclePhoto } from "./store.js";
import { compressImage } from "./image.js";

// Each car's photo gallery (vehicle_photos, 111): up to 24, anyone can look,
// only the owner adds or removes. The car's cover photo is vehicles.photo_url.

export const MAX_CAR_PHOTOS = 24;

export async function loadCarPhotos(vehicleId) {
  if (!supabase || !vehicleId) return [];
  const { data, error } = await supabase.from("vehicle_photos").select("id, url, caption, sort, created_at").eq("vehicle_id", vehicleId).order("sort").order("created_at");
  if (error) throw new Error(withReason("Couldn't load this car's photos.", error));
  return data || [];
}

// Uploads the picked photos to a car, in order. The first photo a car gets
// becomes its cover. Returns how many were added.
export async function addCarPhotos(vehicle, files, userId, have = 0) {
  if (!supabase || !userId) throw new Error("Sign in first.");
  const room = MAX_CAR_PHOTOS - have;
  if (room <= 0) throw new Error(`That's ${MAX_CAR_PHOTOS} photos, the most a car can have. Remove one to add another.`);
  const picked = [...files].filter((f) => f.type.startsWith("image/")).slice(0, room);
  if (!picked.length) throw new Error("Pick photos.");
  let added = 0;
  for (const file of picked) {
    const url = await uploadVehiclePhoto(await compressImage(file), userId);
    const { error } = await supabase.from("vehicle_photos").insert({ vehicle_id: vehicle.id, url, sort: have + added });
    if (error) throw new Error(friendlyWriteError(error, "Couldn't add that photo."));
    if (!vehicle.photo_url && added === 0) await setCarCover(vehicle.id, url);
    added += 1;
  }
  return added;
}

export async function setCarCover(vehicleId, url) {
  const { error } = await supabase.from("vehicles").update({ photo_url: url }).eq("id", vehicleId);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't make that the cover photo."));
}

export async function setCarPhotoCaption(photoId, caption) {
  const { error } = await supabase.from("vehicle_photos").update({ caption: caption.trim() || null }).eq("id", photoId);
  if (error) throw new Error(friendlyWriteError(error, "Couldn't save the caption."));
}

// Removes a photo; if it was the cover, the next photo becomes the cover.
export async function removeCarPhoto(photo, vehicle, rest = []) {
  const { error } = await supabase.from("vehicle_photos").delete().eq("id", photo.id);
  if (error) throw new Error(withReason("Couldn't remove that photo.", error));
  if (vehicle.photo_url === photo.url) await setCarCover(vehicle.id, rest.find((p) => p.id !== photo.id)?.url || null);
}
