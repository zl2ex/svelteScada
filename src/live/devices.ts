import { guard, live, LiveError, publish } from "svelte-realtime/server";
import { err, ok, type Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type {
  PatchOp,
  PatchPayload,
} from "$lib/client/live/patchCollection.svelte";
import type { NeverThrowError } from "$lib/util/neverThrow";
import { deviceManager } from "../hooks.server";
import {
  type DeviceOptions,
  type DeviceStatus,
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

function getStatus(id: string): DeviceStatus {
  const device = deviceManager.getDevice(id);
  if (device && device.isOk()) return device.value.status;
  return "Error";
}

// NOTE: keep the init callback as the second argument with nothing but
// whitespace before it - the svelte-realtime codegen parses the stream
// value type textually from its return annotation.
export const deviceStatus = live.stream(
  (ctx, id: string) => `device-status:${id}`,
  async (ctx, id: string): Promise<DeviceStatus> => getStatus(id),
  { merge: "set" },
);

// DeviceManager subscribes to Device.onStatusChange() and calls this whenever the
// status really changed, so the only work here is fanning the value out.
export function publishDeviceStatus(
  id: string,
  status: DeviceStatus,
  ctx?: { publish: (topic: string, event: string, data: unknown) => void },
) {
  if (ctx) {
    ctx.publish(`device-status:${id}`, "set", status);
    return;
  }
  publish(`device-status:${id}`, "set", status);
}

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.

export const applyDevicePatches = live(
  async (
    ctx,
    patch: PatchOp,
  ): Promise<Result<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch);
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as DeviceOptions;

    if (patch.op === "add") {
      const result = deviceManager.addDevice(value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "INVALID_DRIVER_NAME":
          case "DEVICE_ALREADY_EXISTS":
          case "DRIVER_CREATE_ERROR":
          case "OPTIONS_PARSE_ERROR":
            return err(result.error);
          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "remove") {
      const result = deviceManager.removeDevice(id);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DEVICE_NOT_FOUND":
            return err(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    } else if (patch.op === "replace") {
      const result = deviceManager.updateDevice(id, value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DRIVER_CREATE_ERROR":
          case "INVALID_DRIVER_NAME":
          case "OPTIONS_PARSE_ERROR":
            return err(result.error);

          default:
            logger.error(reason satisfies never);
            throw new LiveError("SERVER_ERROR");
        }
      }
    }

    ctx.publish("device-patches", "created", { patches: [patch] });

    return ok({ ok: true });
  },
);
