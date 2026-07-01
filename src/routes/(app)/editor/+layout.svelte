<script lang="ts">
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm/index";
  import SelectInput from "$lib/client/componets/remoteFormElements/SelectInput.svelte";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import { ClientTag } from "$lib/client/tag/clientTag.svelte";
  import {
    updateTag,
    createFolder,
    deleteFolderCmd,
    deleteTagFromDb,
    insertTag,
  } from "$lib/remote/tags.remote";
  import {
    Copy,
    FileIcon,
    FolderIcon,
    LoaderIcon,
    Scissors,
    TagIcon,
    Trash2,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    TreeView,
    createTreeViewCollection,
  } from "@skeletonlabs/skeleton-svelte";
  import { tree } from "$live/counter";
  import type { ClosureTableNode } from "$lib/server/sqlite/tagClosureTable";
  import { tryCatch } from "$lib/util/tryCatch";
  import {
    z_shared_insertTag,
    z_shared_insertTagFolder,
  } from "$lib/validation/zod";
  import { configure } from "svelte-realtime/client";
  import { foldersStream } from "$live/editor";
  import { EditorState } from "$lib/client/versioning/editorState.svelte";
  import { createTravels } from "travels";
  import { browser } from "$app/env";

  let { children } = $props();

  // Offline queue — realtime-svelte
  configure({
    offline: {
      queue: true,
      maxQueue: 200,
      maxAge: 5 * 60 * 1000,
      beforeReplay: (call) => Date.now() - call.queuedAt < 5 * 60 * 1000,
      onReplayError: (call, err) => console.warn("Replay failed", call, err),
    },
  });

  // Svelte 5 rune views of each stream
  //let remoteTags = tagsStream.rune().current;
  //let remoteFolders = foldersStream.rune().current;

  // Editor is initialised once streams have loaded
  // let editor = new EditorState({
  //   tags: remoteTags ?? {},
  //   folders: remoteFolders ?? {},
  // });

  let folders = $derived(foldersStream.rune().current);

  let globalState = $state({
    folders: folders ?? [],
  });

  let s = createTravels(globalState, { mutable: true });

  $effect(() => {
    console.debug(folders);
    if (folders === undefined) return;
    if ("error" in folders) {
      throw Error("", { cause: folders.error });
    }
    globalState.folders = folders;
  });

  let collection = $derived(
    createTreeViewCollection<ClosureTableNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      rootNode: {
        id: "root",
        name: "",
        children: globalState.folders,
        tags: [],
      },
    }),
  );

  // global keyboard listener
  if (browser) {
    document.addEventListener("keyup", (e) => {
      //console.debug(e.key, e.ctrlKey);
      if (e.key == "z" && e.ctrlKey) s.back();
    });
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e: unknown) {
      console.error(
        `copyToClipboard() failed ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  function removeNodeById(nodes: ClosureTableNode[], id: string): boolean {
    const idx = nodes.findIndex((n) => n.id === id);
    if (idx !== -1) {
      nodes.splice(idx, 1);
      return true;
    }
    for (const node of nodes) {
      if (node.children && removeNodeById(node.children, id)) {
        return true;
      }
    }
    return false;
  }

  function findNodeById(
    nodes: ClosureTableNode[],
    id: string,
  ): ClosureTableNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function addChildTo(parentId: string, newNode: ClosureTableNode) {
    const parent = findNodeById(editor.folders, parentId);
    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(newNode);
    }
  }

  async function tagCopy(node: ClosureTableNode) {
    copyToClipboard(JSON.stringify(node));
  }

  async function folderCopy(node: ClosureTableNode | undefined) {
    if (!node) return;
    const data = { id: node.id, name: node.name, type: node.type };
    copyToClipboard(JSON.stringify(data));
  }

  async function tagCut(node: ClosureTableNode) {
    if (!node.id) return;
    copyToClipboard(JSON.stringify(node));
    await deleteTagFromDb(node.id);
    removeNodeById(editor.folders, node.id);
  }

  async function folderCut(node: ClosureTableNode | undefined) {
    if (!node) return;
    copyToClipboard(JSON.stringify({ id: node.id, name: node.name }));
    await deleteFolderCmd(node.id);
    removeNodeById(editor.folders, node.id);
  }

  async function folderDelete(node: ClosureTableNode) {
    s.setState((draft) => {
      removeNodeById(draft.folders, node.id);
    });
    return true;
  }

  async function handlePaste(
    e: ClipboardEvent,
    node: ClosureTableNode,
    indexPath: number[],
  ) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;

    let json = await tryCatch(JSON.parse, text);
    if (json.error) {
      console.error(json.error);
      return;
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
      const children = collection.getNodeChildren(node);
      let count = 0;
      while (children.map((c) => c.name).includes(name)) {
        name = folderResult.data.name + count;
        count++;
      }
      const created = await createFolder({ name, parentId: node.id });
      addChildTo(node.id, {
        id: created.id,
        name: created.name,
        children: [],
        tags: [],
      });
    } else if (tagResult.data) {
      let name = tagResult.data.name;
      const children = collection.getNodeChildren(node);
      let count = 0;
      while (children.map((c) => c.name).includes(name)) {
        name = tagResult.data.name + count;
        count++;
      }
      const created = await insertTag({
        name,
        folderId: node.id,
        dataType: tagResult.data.dataType,
        nodeId: tagResult.data.nodeId,
        writeable: tagResult.data.writeable,
        exposeOverOpcua: tagResult.data.exposeOverOpcua,
        parameters: tagResult.data.parameters,
      });
      addChildTo(node.id, {
        id: created.id,
        name: created.name,
        children: [],
        tags: [],
      });
    }
  }
</script>

{#snippet treeNode(node: ClosureTableNode, indexPath: number[])}
  {@const update = node.id ? updateTag.for(node.id) : undefined}
  {@const tag =
    node.type !== "Folder" && node.id
      ? (
          await new ClientTag("any", {
            name: node.name,
          }).subscribe()
        ).data
      : undefined}

  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.children}
      <TreeView.Branch
        onpaste={(e) => handlePaste(e, node, indexPath)}
        oncopy={() => folderCopy(node)}
        oncut={() => folderCut(node)}
        onkeyup={(e) => {
          if (e.key === "Delete") {
            folderDelete(node);
          }
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
                <Menu.Item value="cut">
                  <Menu.ItemText>
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
                  <Menu.ItemText>
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
                  <Menu.ItemText>
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
          {#each node.children ?? [] as childNode, childIndex (childNode.id)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else if node.type === "Tag"}
      <TreeView.Branch
        oncopy={() => tagCopy(node)}
        oncut={() => tagCut(node)}
        onkeyup={(e) => {
          if (e.key === "Delete" && node.id) deleteTagFromDb(node.id);
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
                      onclick={async () => {
                        if (node.id) await deleteTagFromDb(node.id);
                        removeNodeById(editor.folders, node.id);
                      }}
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
          {#if tag && update}
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

<!--{#each editor.history.past as history}
  <pre class="pre">{JSON.stringify(history, null, 2)}</pre>
{/each}-->

<div class="flex">
  <div class="text-xs w-100">
    <svelte:boundary>
      <TreeView {collection} selectionMode="multiple">
        <TreeView.Tree class="w-full">
          {#each collection.rootNode.children ?? [] as node, index (node.id)}
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
