import type { DeviceConfigInput } from "$lib/server/drivers/driver";
import { deviceManager } from "../../../../hooks.server";
import { assertCan } from "$lib/server/auth/authorize";

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
