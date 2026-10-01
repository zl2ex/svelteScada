import { prerender } from "$app/server";
import { availableDrivers } from "$lib/server/drivers/driver";

export const getAvalibleDrivers = prerender(async () => {
  return availableDrivers;
});
