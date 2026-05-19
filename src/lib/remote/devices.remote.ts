import { command, form, prerender, query } from "$app/server";
import {
  avalibeDrivers,
  getDefaultOptions,
  Z_DeviceOptions,
} from "$lib/server/drivers/driver";
import { z } from "zod";
import { deviceManager } from "../../server";
import { error, redirect } from "@sveltejs/kit";
import { OpcuaClientDriver } from "$lib/server/drivers/opcua/opcuaClient";
import { TagNode } from "$lib/client/tag/clientTag.svelte";
import { attempt } from "$lib/util/attempt";

export const getAvalibleDrivers = prerender(async () => {
  return avalibeDrivers;
});

export const getDefaultDriverOptions = prerender(async () => {
  return getDefaultOptions();
});

export const getDevice = query(z.string(), async (deviceName) => {
  const device = deviceManager.getDevice(deviceName);
  if (!device) {
    error(404, `device name ${deviceName} not found`);
  }
  return device.getOptionsAndStatus();
});

export const getDevices = query("unchecked", async () => {
  return deviceManager.getAllDevices().map((device) => {
    return device.getOptionsAndStatus();
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

export const updateDevice = form(Z_DeviceOptions, async (deviceOptions) => {
  await deviceManager.updateDevice(deviceOptions);
  redirect(308, "/editor/devices");
});

export const deleteDevice = command(
  z.string().nonempty(),
  async (deviceName) => {
    await deviceManager.removeDevice(deviceName);
  },
);

export const browseOpcua = query(
  z.object({ deviceName: z.string(), nodeId: z.string() }),
  async (x) => {
    const device = deviceManager.getDevice(x.deviceName);
    console.debug(device);
    // WIP What is going on withg the instance of check being reversed ???
    if (!(device?.driver instanceof OpcuaClientDriver)) {
      error(
        500,
        `device ${x.deviceName} driver requested to browse is not an instance of opucaClientDriver`,
      );
    }

    const browse = await attempt(device.driver.browse(x.nodeId));
    if("error" in browse) {
      error(500, browse.error.message);
    }

    let nodes: TagNode[] = [];
    browse.data.references?.forEach((ref) => {
      let type = undefined;
      if (ref.nodeClass.valueOf() === 1) type = "Folder";
      if (ref.nodeClass.valueOf() === 2) type = "Tag";

      if (type) {
        nodes.push(
          new TagNode({
            name: ref.browseName.toString(),
            parentPath: "/",
            type: type,
          }),
        );
      }
    });
    return nodes.map((n) => {
      let { children, ...node } = n;
      console.debug(node);
      return node;
    });
  },
);
