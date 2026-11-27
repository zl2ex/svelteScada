import { guard, getPlatform, live, LiveError } from "svelte-realtime/server";
import { type Result } from "neverthrow";
import { logger } from "$lib/server/pino/logger";
import type { PatchOp, PatchPayload } from "$lib/client/live/patchCollection.svelte";
import { wireErr, wireOk, type NeverThrowError, type WireResult } from "$lib/util/neverThrow";
import { deviceManager } from "../hooks.server";
import {
  type DeviceConfigInput,
  type DeviceStatus,
  type FailedDevice,
} from "$lib/server/drivers/driver";
import { assertLiveCan } from "$lib/server/auth/authorize";

/**
 * Guard that requires an authenticated user who can read devices.
 *
 * @param ctx - The live request context.
 * @throws {LiveError} when no user is authenticated.
 */
export const _guard = guard((ctx) => {
  if (!ctx.user) throw new LiveError("UNAUTHENTICATED", "Must be logged in");
  assertLiveCan(ctx.user, "read", "Device");
});

/**
 * Live stream of device patch batches.
 *
 * Replays prior patches on subscribe so late clients converge.
 *
 * @returns an empty initial patch payload.
 */
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
/**
 * Live stream of a single device's status, keyed by device id.
 *
 * @param ctx - The live request context.
 * @param id - The device id to watch.
 * @returns Ok with the device status, or Err when the device is missing or failed.
 */
export const deviceStatus = live.stream(
  (ctx, id: string) => `device-status:${id}`,
  async (
    ctx,
    id: string,
  ): Promise<
    WireResult<DeviceStatus, NeverThrowError | { reason: "DEVICE_NOT_FOUND"; cause: string }>
  > => {
    assertLiveCan(ctx.user, "read", "Device");
    const device = deviceManager.getDevice(id);
    if (!device) {
      return wireErr({
        reason: "DEVICE_NOT_FOUND",
        cause: `device at ${id} not found`,
      } as const satisfies NeverThrowError);
    }
    if (device.isErr()) return wireErr(device.error);
    if (device.value.status.isErr()) return wireErr(device.value.status.error);
    return wireOk(device.value.status.value);
  },
  { merge: "set" },
);

// DeviceManager subscribes to Device.onStatusChange() and calls this whenever the
// status really changed, so the only work here is fanning the value out.
/**
 * Publishes a device status change to the device-status stream.
 *
 * @param id - The device id whose status changed.
 * @param status - The new status wrapped in a neverthrow Result.
 * @param [ctx] - Publish context; when omitted the global platform is used.
 */
export function publishDeviceStatus(
  id: string,
  status: Result<DeviceStatus, NeverThrowError>,
  ctx?: { publish: (topic: string, event: string, data: unknown) => void },
) {
  let wireStatus: WireResult<DeviceStatus, NeverThrowError>;

  if (status.isErr()) wireStatus = wireErr(status.error);
  else wireStatus = wireOk(status.value);

  if (ctx) {
    ctx.publish(`device-status:${id}`, "set", wireStatus);
    return;
  }

  // production evaluates SvelteKit's init() before the adapter captures the
  // platform, so startup publishes always land here. no client can subscribe
  // before it exists and this stream re-reads live status on subscribe.
  const platform = getPlatform();
  if (!platform) {
    logger.debug(`[publishDeviceStatus] ${id} skipped, realtime platform not captured yet`);
    return;
  }
  platform.publish(`device-status:${id}`, "set", wireStatus);
}

// One op per call: the client batches ops by calling this once per op, so a
// failed op is rolled back individually instead of leaving the server
// mid-way through an array.

/**
 * Applies a single device patch (add, replace, or remove).
 *
 * @param ctx - The live request context.
 * @param patch - The patch operation to apply.
 * @returns Ok with `{ ok: true }` on success, or Err when the manager rejects it.
 * @throws {LiveError} when the patch is malformed or an unexpected manager error occurs.
 */
export const applyDevicePatches = live(
  async (ctx, patch: PatchOp): Promise<WireResult<{ ok: true }, NeverThrowError>> => {
    logger.trace(patch);
    if (patch.path.length !== 1) {
      throw new LiveError(
        "INVALID_PATCH",
        `applyTagPatches() must update the entire object from the front end not single properties ${patch}`,
      );
    }

    const id = patch.path[0].toString();
    const value = patch.value as DeviceConfigInput;
    const action = patch.op === "add" ? "create" : patch.op === "remove" ? "delete" : "update";
    assertLiveCan(ctx.user, action, "Device");

    if (patch.op === "add") {
      const result = await deviceManager.addDevice(value);
      if (result.isErr()) {
        logger.error(result.error);
        const reason = result.error.reason;
        switch (reason) {
          case "DB_ERROR":
          case "DEVICE_ALREADY_EXISTS":
          case "OPTIONS_PARSE_ERROR":
            return wireErr(result.error);
          case "DRIVER_CONFIG_ERROR":
            // the device was created and synced, it just cannot build its
            // driver - #trackStatus() already published the error on the
            // device-status stream, so dont fail the patch
            break;

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
          case "OPTIONS_PARSE_ERROR":
            return wireErr(result.error);
          case "DRIVER_CONFIG_ERROR":
            // the device was updated and synced, it just cannot build its
            // driver - #trackStatus() already published the error on the
            // device-status stream, so dont fail the patch
            break;

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
