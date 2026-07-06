<script lang="ts">
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm/index";
  import SelectInput from "$lib/client/componets/remoteFormElements/SelectInput.svelte";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import {
    Copy,
    FileIcon,
    FolderIcon,
    FolderPlus,
    LoaderIcon,
    Scissors,
    TagIcon,
    TagPlus,
    Trash2,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    TreeView,
    createTreeViewCollection,
  } from "@skeletonlabs/skeleton-svelte";

  import type { ClosureTableNode } from "$lib/server/sqlite/tagClosureTable";
  import { tryCatch } from "$lib/util/tryCatch";
  import {
    z_shared_insertTag,
    z_shared_insertTagFolder,
  } from "$lib/validation/zod";
  import { browser } from "$app/env";

  let { data, children } = $props();

  // tags.svelte.ts — now just a thin instantiation of the generic class
  import { tagFolderPatches, applyTagFolderPatches } from "$live/tag-folder";
  import { PatchCollection } from "$lib/client/live/patchCollection.svelte";

  let folderPatches = $state(
    new PatchCollection<ClosureTableNode>({
      initial: data.tagFolders,
      applyPatch: applyTagFolderPatches,
      subscribePatches: (notify) => {
        // adapt tagPatches' store .subscribe() to the (payload) => void shape
        const unsubscribe = tagFolderPatches.subscribe(notify);
        return unsubscribe; // svelte stores' subscribe() already returns an unsubscribe fn
      },
      maxHistory: 50,
    }),
  );

  let collection = $state(
    createTreeViewCollection<ClosureTableNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: (node) => {
        if (node.id === "root") {
          return Object.values(folderPatches.state).filter(
            (f) => f.parentId == undefined,
          );
        }
        return Object.values(folderPatches.state).filter(
          (f) => f.parentId == node.id,
        );
      },
      rootNode: {
        id: "root",
        name: "",
        parentId: undefined,
        tags: [],
      },
    }),
  );

  // ── Keyboard shortcuts ────────────────────────────────

  if (browser) {
    document.addEventListener("keyup", (e) => {
      if (e.key == "z" && e.ctrlKey) folderPatches.undo();
      if (e.key == "y" && e.ctrlKey) folderPatches.redo();
    });
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }

  // ── Folder operations ─────────────────────────────────

  async function folderDelete(node: ClosureTableNode) {
    let children = Object.values(folderPatches.state).filter(
      (f) => f.parentId == node.id,
    );
    children.forEach((child) => folderDelete(child));
    folderPatches.remove(node.id);
  }

  async function folderCut(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify({ id: node.id, name: node.name }));
    folderDelete(node);
  }

  async function folderCopy(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify({ id: node.id, name: node.name }));
  }

  // ── Tag operations ────────────────────────────────────

  async function tagCopy(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify(node));
  }

  async function tagCut(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify(node));
  }

  async function tagDeleteNode(node: ClosureTableNode) {}

  // ── Paste ─────────────────────────────────────────────

  async function handlePaste(
    e: ClipboardEvent,
    parentNode: ClosureTableNode | undefined,
    indexPath: number[],
  ) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;

    let json = await tryCatch(JSON.parse, text);
    if (json.error) {
      throw Error(`handlePaste() `, { cause: json.error });
    }

    let tagResult = await tryCatch(z_shared_insertTag.parse, json.data);
    let folderResult = await tryCatch(
      z_shared_insertTagFolder.parse,
      json.data,
    );
    if (tagResult.error && folderResult.error) {
      throw Error(
        `handlePaste() parse into tag or folder failed, wrong format ${json.data}`,
      );
    }

    if (folderResult.data) {
      let name = folderResult.data.name;
      const newId = crypto.randomUUID();
      const children = Object.values(folderPatches.state).filter(
        (f) => f.parentId == parentNode?.id,
      );
      let count = 0;
      // incrimentally add a number to the end of pasted node if it already exists
      while (children.map((c) => c.name).includes(name)) {
        name = folderResult.data.name + count;
        count++;
      }

      folderPatches.add({ id: newId, name, parentId: parentNode?.id });
    } else if (tagResult.data) {
    }
  }
</script>

{#snippet treeNode(node: ClosureTableNode, indexPath: number[])}
  {@const children = Object.values(folderPatches.state).filter(
    (f) => f.parentId == node.id,
  )}

  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if children}
      <TreeView.Branch
        onpaste={(e) => {
          e.stopPropagation();
          handlePaste(e, node, indexPath);
        }}
        oncopy={(e) => {
          e.stopPropagation();
          folderCopy(node);
        }}
        oncut={(e) => {
          e.stopPropagation();
          folderCut(node);
        }}
        onkeyup={(e) => {
          e.stopPropagation();
          if (e.key === "Delete") folderDelete(node);
        }}
      >
        <Menu>
          <Menu.ContextTrigger>
            <TreeView.BranchControl>
              <TreeView.BranchIndicator class="data-loading:hidden" />
              <TreeView.BranchIndicator
                class="hidden data-loading:inline animate-spin"
              >
                <LoaderIcon class="size-4" />
              </TreeView.BranchIndicator>
              <TreeView.BranchText class="truncate">
                <FolderIcon class="size-4 shrink-0" />
                {node.name}
              </TreeView.BranchText>
            </TreeView.BranchControl>
          </Menu.ContextTrigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content class="min-w-auto">
                <Menu.Item value="newTag">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => {}}
                    >
                      <TagPlus class="size-4" />
                      <span>New Tag</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+N</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item value="newFolder">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => {}}
                    >
                      <FolderPlus class="size-4" />
                      <span>New Folder</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+Shft+N</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="cut">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderCut(node)}
                    >
                      <Scissors class="size-4" />
                      <span>Cut</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+X</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item value="copy">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderCopy(node)}
                    >
                      <Copy class="size-4" />
                      <span>Copy</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+C</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="delete">
                  <Menu.ItemText class="w-full">
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => folderDelete(node)}
                    >
                      <Trash2 class="size-4" />
                      Delete
                      <span class="text-xs text-neutral-500 ml-auto">Del</span
                      ></button
                    ></Menu.ItemText
                  >
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu>
        <TreeView.BranchContent>
          <TreeView.BranchIndentGuide />
          {#each children ?? [] as childNode, childIndex (childNode.id)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else if node.tags}
      <TreeView.Branch
        oncopy={(e) => {
          e.stopPropagation();
          tagCopy(node);
        }}
        oncut={(e) => {
          e.stopPropagation();
          tagCut(node);
        }}
        onkeyup={(e) => {
          e.stopPropagation();
          if (e.key == "Delete") tagDeleteNode(node);
        }}
      >
        <Menu>
          <Menu.ContextTrigger>
            <TreeView.BranchControl>
              <TreeView.BranchIndicator class="data-loading:hidden" />
              <TreeView.BranchIndicator
                class="hidden data-loading:inline animate-spin"
              >
                <LoaderIcon class="size-4" />
              </TreeView.BranchIndicator>
              <TreeView.BranchText class="flex-1">
                <TagIcon class="size-4 shrink-0" />
                <div class="flex justify-between items-center gap-2 flex-1">
                  {node.name}
                  {#if tag}
                    <TagInput
                      clientTag={tag}
                      label=""
                      clazz="py-0 px-1"
                      onclick={(ev) => ev.stopPropagation()}
                      onkeydown={(ev) => ev.stopPropagation()}
                    ></TagInput>
                  {/if}
                </div>
              </TreeView.BranchText>
            </TreeView.BranchControl>
          </Menu.ContextTrigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content class="min-w-auto">
                <Menu.Item value="cut">
                  <Menu.ItemText>
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => tagCut(node)}
                    >
                      <Scissors class="size-4" />
                      <span>Cut</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+X</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Item value="copy">
                  <Menu.ItemText>
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => tagCopy(node)}
                    >
                      <Copy class="size-4" />
                      <span>Copy</span>
                      <span class="text-xs text-neutral-500 ml-auto"
                        >Ctrl+C</span
                      >
                    </button>
                  </Menu.ItemText>
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item value="delete">
                  <Menu.ItemText>
                    <button
                      class="flex items-center gap-2 w-full"
                      onclick={() => tagDeleteNode(node)}
                    >
                      <Trash2 class="size-4" />
                      Delete
                      <span class="text-xs text-neutral-500 ml-auto">Del</span
                      ></button
                    ></Menu.ItemText
                  >
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu>
        <TreeView.BranchContent>
          <TreeView.BranchIndentGuide />
          {#if false && tag && update}
            <TreeView.Item class="bg-inherit text-inherit" tabindex={-1}>
              <form
                tabindex="-1"
                {...update.enhance(async ({ submit }) => {
                  alert("submit");
                  await submit();
                })}
              >
                <input {...update.fields.name.as("hidden", tag.options.name)} />

                <input {...update.fields.path.as("hidden", tag.path)} />
                <input
                  {...update.fields.parentPath.as(
                    "hidden",
                    tag.options.parentPath,
                  )}
                />

                <SelectInput
                  remoteFormFeild={update.fields.dataType}
                  defaultValue={tag.options.dataType}
                  label="Data Type"
                  divAttr={{ class: "flex items-center" }}
                >
                  {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} }, ) then options}
                    {#if options.error}
                      <span class="text-error-600-400"
                        >Error {options.error.message}</span
                      >
                    {:else}
                      {#each options.data as option}
                        <option value={option}>{option}</option>
                      {/each}
                    {/if}
                  {/await}
                </SelectInput>

                <RemoteForm
                  feild={update.fields.nodeId}
                  class="flex items-center"
                >
                  <RemoteForm.Label>Node ID</RemoteForm.Label>
                  <RemoteForm.Input
                    as="text"
                    value={tag.options.nodeId}
                    onfocusout={() => {
                      alert("test");
                      update.enhance(async ({ submit }) => {
                        await submit();
                      });
                    }}
                  />
                  <RemoteForm.Issue />
                </RemoteForm>

                <RemoteForm
                  feild={update.fields.exposeOverOpcua}
                  class="flex items-center"
                >
                  <RemoteForm.Label
                    >Expose on Internal OPCUA Server</RemoteForm.Label
                  >
                  <RemoteForm.Checkbox checked={tag.options.exposeOverOpcua} />
                  <RemoteForm.Issue />
                </RemoteForm>

                <RemoteForm
                  feild={update.fields.writeable}
                  class="flex items-center"
                >
                  <RemoteForm.Label></RemoteForm.Label>
                  <RemoteForm.Checkbox checked={tag.options.writeable} />
                  <RemoteForm.Issue />
                </RemoteForm>

                <div>
                  <button class="btn preset-filled">Save</button>
                </div>

                <div class="form-item">
                  {#each update.fields.issues() ?? [] as issue}
                    <span class="text-error-600-400">{issue.message}</span>
                  {/each}
                  {#if tag.errorMessage}
                    <span class="text-error-600-400">{tag.errorMessage}</span>
                  {/if}
                </div>
              </form>
            </TreeView.Item>
          {/if}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <TreeView.Item class="truncate">
        <FileIcon class="size-4 shrink-0" />
        {node.name}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex">
  <div class="text-xs w-100" onpaste={(e) => handlePaste(e, undefined, [0])}>
    <svelte:boundary>
      <TreeView {collection} selectionMode="multiple">
        <TreeView.Tree class="w-full">
          {#each Object.values(folderPatches.state).filter((f) => f.parentId == undefined) ?? [] as node, index (node.id)}
            {@render treeNode(node, [index])}
          {/each}
        </TreeView.Tree>
      </TreeView>

      {#snippet pending()}
        <LoaderIcon class="size-4 animate-spin" />
      {/snippet}
      {#snippet failed(error, reset)}
        <p class="text-error-700-300">{error}</p>
        <button onclick={reset} class="btn preset-filled">reset</button>
      {/snippet}
    </svelte:boundary>
  </div>

  {@render children?.()}
</div>
