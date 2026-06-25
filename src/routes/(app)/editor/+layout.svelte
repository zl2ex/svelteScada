<script lang="ts">
  import RemoteForm from "$lib/client/componets/remoteFormElements/RemoteForm/index";
  import SelectInput from "$lib/client/componets/remoteFormElements/SelectInput.svelte";
  import TagInput from "$lib/client/componets/scada/TagInput.svelte";
  import { socketIoClientHandler } from "$lib/client/socket.io/socket.io.svelte";
  import { ClientTag, TagNode } from "$lib/client/tag/clientTag.svelte";
  import {
    deleteTag,
    getAllChildrenAsNode,
    updateTag,
    updateTagCommand,
  } from "$lib/remote/tags.remote";
  import type { TagOptionsInput } from "$lib/server/tag/tag";
  import {
    Copy,
    FileIcon,
    FolderIcon,
    LoaderIcon,
    Scissors,
    TagIcon,
    TagsIcon,
    Trash2,
  } from "@lucide/svelte";
  import {
    Menu,
    Portal,
    TreeView,
    createTreeViewCollection,
    type TreeViewRootProps,
  } from "@skeletonlabs/skeleton-svelte";
  import { tree } from "$live/counter";
  import type { ClosureTableNode } from "$lib/server/sqlite/tagClosureTable";
  import { tryCatch } from "$lib/util/tryCatch";
  import z from "zod";

  let { children } = $props();

  let tre = tree.rune();

  let collection = $derived(
    createTreeViewCollection<ClosureTableNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      rootNode: {
        id: "root",
        name: "",
        tags: [],
        children: tre.current,
      },
    }),
  );

  const onLoadChildrenComplete: TreeViewRootProps["onLoadChildrenComplete"] = (
    details,
  ) => {
    collection = details.collection;
  };

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error(`copyToClipboard() failed ${e.message}`);
    }
  }

  async function tagCopy(tag: ClientTag<any> | undefined) {
    if (!tag?.options) return;
    copyToClipboard(JSON.stringify(tag.options));
  }

  async function folderCopy(folder: ClosureTableNode | undefined) {
    if (!folder) return;
    copyToClipboard(JSON.stringify(folder));
  }

  async function tagCut(tag: ClientTag<any> | undefined) {
    if (!tag) return;

    copyToClipboard(JSON.stringify(tag.options));
    await deleteTag(tag.path);
  }

  async function folderCut(folder: ClosureTableNode | undefined) {
    if (!folder) return;
    copyToClipboard(JSON.stringify(folder));

    // TD WIP Delete Folder
  }

  async function tagPaste(tagOptions: TagOptionsInput<any>) {}

  async function handlePaste(e: ClipboardEvent, node: ClosureTableNode) {
    const text = e.clipboardData?.getData("text/plain");
    e.stopPropagation();
    if (!text) return;

    let json = await tryCatch(JSON.parse, text);
    if (json.error) {
      console.error(json.error.message);
      return;
    }
    // TD WIP import Zod from $lib/server
    let options = await tryCatch(z.object().parse, json.data);
    throw Error(" handlePaste() TD WIP import Zod from $lib/server");
    console.debug(options);
    options.parentPath = node.path; // put into folder user pasted into
    console.debug(collection.getNodeChildren(node).map((child) => child.name));

    let incrimentName = 0;

    while (
      collection
        .getNodeChildren(node)
        .map((child) => child.name)
        .includes(options.name)
    ) {
      let rename = options.name + incrimentName.toString();
      console.debug(
        `folder ${options.parentPath} contains tag ${options.name}  rename -> ${rename}`,
      );
      options.name = rename;
      incrimentName++;
    }

    options.path = new TagNode({ ...options, type: "Tag" }).path;

    // collection.insertAfter(indexPath, [
    //   new TagNode({ ...options, type: "Tag" }),
    // ]);

    updateTagCommand(options);
  }
</script>

{#snippet treeNode(node: ClosureTableNode, indexPath: number[])}
  {@const update = updateTag.for(node.path)}
  {@const tag =
    node.type !== "Folder"
      ? (await new ClientTag("any", node).subscribe()).data
      : undefined}

  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.children}
      <TreeView.Branch onpaste={(e) => handlePaste(e, node)}>
        <Menu>
          <Menu.ContextTrigger>
            <TreeView.BranchControl>
              <TreeView.BranchIndicator class="data-loading:hidden" />
              <TreeView.BranchIndicator
                class="hidden data-loading:inline animate-spin"
              >
                <LoaderIcon class="size-4" />
              </TreeView.BranchIndicator>
              {#if node.type === "UdtTag"}
                <TreeView.BranchText class="truncate">
                  <TagsIcon class="size-4 shrink-0" />
                  {node.name}
                </TreeView.BranchText>
              {/if}
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
                      onclick={async () => {
                        if (tag?.path) await deleteTag(tag.path);
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
          {#each node.children ?? [] as childNode, childIndex (childNode)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <!--specific type passed then render tag or udt tag-->
      {#if node?.type == "Tag"}
        <TreeView.Branch
          oncopy={() => tagCopy(tag)}
          oncut={() => tagCut(tag)}
          onkeyup={(e) => {
            if (e.key === "Delete" && tag?.path) deleteTag(tag.path);
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
                        //fix skeleton tree from opening
                        onkeydown={(ev) => ev.stopPropagation()} //fix skeleton tree stealing keyboard events
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
                        onclick={() => tagCut(tag)}
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
                        onclick={() => tagCopy(tag)}
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
                          if (tag?.path) await deleteTag(tag.path);
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
            {#if tag}
              <TreeView.Item class="bg-inherit text-inherit" tabindex={-1}>
                <form
                  tabindex="-1"
                  {...update.enhance(async ({ form, data, submit }) => {
                    alert("submit");
                    await submit();
                    //form.element.reset();
                    // go to new tag url if no issues were reported
                    //if (!updateTagForm.fields.allIssues())
                    //goto(`?tagPath=${data.parentPath}${data.name}`);
                    /*
            // force reload of newTag $derrived on submit
            let oldTagEditorPath = tagEditorPath;
            tagEditorPath = "";
            tagEditorPath = oldTagEditorPath;*/
                  })}
                >
                  <input
                    {...update.fields.name.as("hidden", tag.options.name)}
                  />

                  <input {...update.fields.path.as("hidden", tag.path)} />
                  <input
                    {...update.fields.parentPath.as(
                      "hidden",
                      tag.options.parentPath,
                    )}
                  />

                  <!-- <datalist id="dataTypeAutocomplete">
                {#await socketIoClientHandler.rpc( { name: "getDataTypeStrings()", parameters: {} } ) then options}
              {#if options.error}
              <p>Error {options.error.message}</p>
              {:else}
              {#each options.data as option}
              <option value={option}>{option}</option>
              {/each}
              {/if}
              {/await}
          </datalist>
          <label for="dataType">dataType</label>
          <input {...updateTagForm.fields.dataType.as("text")} /> -->

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
                  <!--Override display  WIP -->

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
                    <RemoteForm.Checkbox
                      checked={tag.options.exposeOverOpcua}
                    />
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

        <!--render normal file icon plus name-->
      {:else}
        <TreeView.Item class="truncate">
          <FileIcon class="size-4 shrink-0" />
          {node.name}
        </TreeView.Item>
      {/if}
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<div class="flex">
  <div class="text-xs w-100">
    <!--<input type="text" bind:value={tagEditorPath} />-->
    <svelte:boundary>
      <TreeView {collection} {onLoadChildrenComplete} selectionMode="multiple">
        <!--<TreeView.Label>File System</TreeView.Label>-->
        <TreeView.Tree class="w-full">
          {#each collection.rootNode.children || [] as node, index (node)}
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

  {@render children()}
</div>
