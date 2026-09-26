import { Controller, Tag } from "st-ethernet-ip";
import { attempt } from "$lib/util/attempt";
import { logger } from "../../pino/logger";
import { errorToString } from "$lib/util/neverThrow";

function registerTagEventHandlers(plc: Controller) {
  // Catch the Tag "Changed" and "Initialized" Events
  const registered = attempt(() =>
    plc.forEach((tag) => {
      // Called on the First Successful Read from the Controller
      tag.on("Initialized", (tag) => {
        console.log("Initialized", tag.tagname, tag.value);
      });

      // Called if Tag.controller_value changes
      tag.on("Changed", (tag, oldValue) => {
        console.log("Changed:", tag.tagname, tag.value);
      });
    }),
  );
  if (registered.error) {
    logger.error(
      `[ethernetIp] failed to register the tag event handlers: ${errorToString(registered.error)}`,
    );
  }
}

async function start() {
  const created = attempt(() => new Controller());
  if (created.error) {
    logger.error(
      `[ethernetIp] failed to create the controller: ${errorToString(created.error)}`,
    );
    return;
  }
  const PLC = created.data;

  // Add some tags to group
  //PLC.subscribe(new Tag("progTag", "prog")); // Program Scope Tag in PLC Program "prog")
  const createdTag = attempt(() => new Tag("_20TT01"));
  if (createdTag.error) {
    logger.error(
      `[ethernetIp] failed to create the _20TT01 tag: ${errorToString(createdTag.error)}`,
    );
    return;
  }
  const subscribed = attempt(() => PLC.subscribe(createdTag.data));
  if (subscribed.error) {
    logger.error(
      `[ethernetIp] failed to subscribe the _20TT01 tag: ${errorToString(subscribed.error)}`,
    );
    return;
  }

  registerTagEventHandlers(PLC);

  const connected = await attempt(() => PLC.connect("172.16.2.10", 0));
  if (connected.error) {
    logger.error(
      `[ethernetIp] failed to connect to 172.16.2.10: ${errorToString(connected.error)}`,
    );
    return;
  }

  // Set Scan Rate of Subscription Group to 50 ms (defaults to 200 ms)
  PLC.scan_rate = 50;

  // Begin Scanning
  const scanned = await attempt(() => PLC.scan());
  if (scanned.error) {
    logger.error(
      `[ethernetIp] failed to scan: ${errorToString(scanned.error)}`,
    );
  }
}

void start();
