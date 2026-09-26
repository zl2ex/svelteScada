import type { DeviceOptions } from "$lib/server/drivers/driver";
import { deviceManager } from "../../../../hooks.server";

export async function load() {
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
      {} as Record<string, DeviceOptions>,
    ),
  };
}
