import { live } from "svelte-realtime/server";

export const tagFolderPatches = live.stream(
  "tag-folder-patches",
  async () => null,
  {
    merge: "latest",
    replay: true, // optional: gap-fills missed patches on reconnect instead of a cold start
  },
);

export const applyTagFolderPatches = live(async (ctx, patches) => {
  //const versions = await applyAndPersistTagPatches(patches);
  ctx.publish("tag-folder-patches", { patches });
});
