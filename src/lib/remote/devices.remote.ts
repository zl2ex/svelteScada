import { command, form, prerender, query } from "$app/server";
import {
  avalibeDrivers,
  getDefaultOptions,
  z_DeviceOptions,
} from "$lib/server/drivers/driver";
import { z } from "zod";
import { error, redirect } from "@sveltejs/kit";
import { err } from "neverthrow";
import { OpcuaClientDriver } from "$lib/server/drivers/opcua/opcuaClient";
import { deviceManager } from "../../hooks.server";
import { attempt } from "$lib/util/attempt";
import { errorToString, type NeverThrowError } from "$lib/util/neverThrow";

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

  const options = attempt(() => device.getOptionsAndStatus());
  if (options.error) {
    const failure = err({
      reason: "DEVICE_STATUS_FAILED",
      cause: `[devices.remote.ts] getDevice() failed to read status of device ${deviceName}: ${errorToString(
        options.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  return options.data;
});

export const getDevices = query("unchecked", async () => {
  return deviceManager.getAllDevices().map((device) => {
    const options = attempt(() => device.getOptionsAndStatus());
    if (options.error) {
      const failure = err({
        reason: "DEVICE_STATUS_FAILED",
        cause: `[devices.remote.ts] getDevices() failed to read device status: ${errorToString(
          options.error,
        )}`,
      } as const satisfies NeverThrowError);
      error(500, `${failure.error.reason}: ${failure.error.cause}`);
    }
    return options.data;
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

export const updateDevice = form(z_DeviceOptions, async (deviceOptions) => {
  const updated = attempt(() => deviceManager.updateDevice(deviceOptions));
  if (updated.error) {
    const failure = err({
      reason: "DEVICE_UPDATE_FAILED",
      cause: `[devices.remote.ts] updateDevice() failed to update device ${deviceOptions.name}: ${errorToString(
        updated.error,
      )}`,
    } as const satisfies NeverThrowError);
    error(500, `${failure.error.reason}: ${failure.error.cause}`);
  }

  const result = updated.data;
  if (result.isErr()) {
    error(500, result.error.reason);
  }
  redirect(308, "/editor/devices");
});

export const deleteDevice = command(
  z.string().nonempty(),
  async (deviceName) => {
    const attempted = attempt(() => deviceManager.removeDevice(deviceName));
    if (attempted.error) {
      const failure = err({
        reason: "DEVICE_REMOVE_FAILED",
        cause: `[devices.remote.ts] deleteDevice() failed to remove device ${deviceName}: ${errorToString(
          attempted.error,
        )}`,
      } as const satisfies NeverThrowError);
      error(500, `${failure.error.reason}: ${failure.error.cause}`);
    }

    const removed = attempted.data;
    if (removed.isErr()) {
      error(500, removed.error.cause);
    }
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

    const attempted = await attempt(() => device.driver.browse(x.nodeId));
    if (attempted.error) {
      const failure = err({
        reason: "OPCUA_BROWSE_FAILED",
        cause: `[devices.remote.ts] browseOpcua() failed to browse node ${x.nodeId} on device ${x.deviceName}: ${errorToString(
          attempted.error,
        )}`,
      } as const satisfies NeverThrowError);
      error(500, `${failure.error.reason}: ${failure.error.cause}`);
    }

    const browse = attempted.data;
    if (browse.isErr()) {
      error(500, browse.error.cause);
    }

    let nodes: TagNode[] = [];
    const references = browse.value.references ?? [];
    references.forEach((ref: (typeof references)[number]) => {
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
