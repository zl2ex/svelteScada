import { guard, live, LiveError, publish } from "svelte-realtime/server";
import { type Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type {
  PatchOp,
  PatchPayload,
} from "$lib/client/live/patchCollection.svelte";
import {
  wireErr,
  wireOk,
  type NeverThrowError,
  type WireResult,
} from "$lib/util/neverThrow";
import { deviceManager } from "../hooks.server";
import {
  type DeviceConfigInput,
  type DeviceStatus,
  type FailedDevice,
} from "$lib/server/drivers/driver";

export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
});

export const devicePatches = live.stream(
  "device-patches",
  async (): Promise<PatchPayload> => ({ patches: [] }),
  {
    merge: "set",
    replay: true,
  },
);

// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - the svelte-realtime codegen parses the stream
// value type textually from its return annotation.
export const deviceStatus = live.stream(
  (ctx, id: string) => `device-status:${id}`,
  async (
    ctx,
    id: string,
  ): Promise<
    WireResult<
      DeviceStatus,
      FailedDevice | { reason: "DEVICE_NOT_FOUND"; cause: string }
    >
  > => {
    const device = deviceManager.getDevice(id);
    if (!device) {
      return wireErr({
        reason: "DEVICE_NOT_FOUND",
        cause: `device at ${id} not found`,
      } as const satisfies NeverThrowError);
    }
    if (device.isErr()) return wireErr(device.error);
    return wireOk(device.value.status);
  },
  { merge: "set" },
);

// DeviceManager subscribes to Device.onStatusChange() and calls this whenever the
// status really changed, so the only work here is fanning the value out.
export function publishDeviceStatus(
  id: string,
  status: Result<DeviceStatus, FailedDevice>,
  ctx?: { publish: (topic: string, event: string, data: unknown) => void },
) {
  let wireStatus: WireResult<DeviceStatus, FailedDevice>;

  if (status.isErr()) wireStatus = wireErr(status.error);
  else wireStatus = wireOk(status.value);

  if (ctx) {
    ctx.publish(`device-status:${id}`, "set", wireStatus);
    return;
  }
  publish(`device-status:${id}`, "set", wireStatus);
}

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.

export const applyDevicePatches = live(
  async (
    ctx,
    patch: PatchOp,
  ): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch);
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as DeviceConfigInput;

    if (patch.op === "add") {
      const result = await deviceManager.addDevice(value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DEVICE_ALREADY_EXISTS":
          case "DRIVER_CREATE_ERROR":
          case "OPTIONS_PARSE_ERROR":
            return wireErr(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "remove") {
      const result = await deviceManager.removeDevice(id);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DEVICE_NOT_FOUND":
            return wireErr(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "replace") {
      const result = await deviceManager.updateDevice(id, value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DEVICE_NOT_FOUND":
          case "DRIVER_CREATE_ERROR":
          case "OPTIONS_PARSE_ERROR":
            return wireErr(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    }

    ctx.publish("device-patches", "created", { patches: [patch] });

    return wireOk({ ok: true });
  },
);
