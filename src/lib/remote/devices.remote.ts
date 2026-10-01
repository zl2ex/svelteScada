import { prerender } from "$app/server";
import { avalibeDrivers } from "$lib/server/drivers/driver";

export const getAvalibleDrivers = prerender(async () => {
  return avalibeDrivers;
});
