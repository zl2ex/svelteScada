import type { DeviceConfigInput } from "$lib/server/drivers/driver";
import { deviceManager } from "../../../../hooks.server";
import { assertCan } from "$lib/server/auth/authorize";

/**
 * Load all device options for the devices editor.
 *
 * @param locals - the request locals containing the user's ability
 * @returns a device-options map keyed by device id
 */
export async function load({ locals }) {
  assertCan(locals.ability, "read", "Device");
  const devices = deviceManager.getAllDevices();

  const deviceOptions = devices.map((d) => {
    if (d.isErr()) return d.error.options;
    return d.value.options;
  });

  return {
    deviceOptions: deviceOptions.reduce(
      (map, device) => {
        map[device.id] = device;
        return map;
      },
      {} as Record<string, DeviceConfigInput>,
    ),
  };
}
