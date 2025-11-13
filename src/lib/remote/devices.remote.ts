import { command, form, prerender, query } from "$app/server";
import {
  avalibeDrivers,
  Device,
  Z_DeviceOptions,
} from "$lib/server/drivers/driver";
import { z } from "zod";
import { deviceManager } from "../../server";
import { error, redirect } from "@sveltejs/kit";

export const getAvalibleDrivers = prerender(async () => {
  return avalibeDrivers;
});

export const getDevice = query(z.string(), async (deviceName) => {
  const device = deviceManager.getDevice(deviceName);
  if (!device) {
    error(404, `device name ${deviceName} not found`);
  }
  const status = device.status;
  const { driver, ...withoutDriver } = device;
  return { ...withoutDriver, status };
});

export const getDevices = query("unchecked", async () => {
  return deviceManager.getAllDevices().map((device) => {
    const status = device.status;
    const { driver, ...withoutDriver } = device;
    return { ...withoutDriver, status };
  });
});

/*
export const updateDeviceEnabled = form(
  z.object({
    name: z.string().nonempty(),
    enabled: z.coerce.boolean<boolean>(),
  }),
  (data, invalid) => {
    let device = deviceManager.getDevice(data.name);
    if (!device) {
      invalid(invalid.name(`device name does not exist`));
      return;
    }
    if (data.enabled) device.enable();
    else device.disable();

    // TD WIP UPDATE DB
    return device.options.enabled;
  }
);*/

export const updateDevice = form(Z_DeviceOptions, async (data) => {
  if (!deviceManager.opcuaServer) {
    throw new Error(
      `[devices.remote.ts] updateDevice() Tag.opcuaServer undefined, please call Tag.initOpcuaServer() first`
    );
  }
  await deviceManager.updateDevice(new Device(deviceManager.opcuaServer, data));
  redirect(308, "/editor/devices");
});

export const deleteDevice = command(
  z.string().nonempty(),
  async (deviceName) => {
    await deviceManager.removeDevice(deviceName);
  }
);
