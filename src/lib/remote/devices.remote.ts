import { prerender } from "$app/server";
import { availableDrivers } from "$lib/server/drivers/driver";

/**
 * Prerendered list of available device drivers.
 *
 * @returns the available drivers.
 */
export const getAvalibleDrivers = prerender(async () => {
  return availableDrivers;
});
