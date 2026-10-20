<script lang="ts">
  import { Chart } from "chart.js/auto";
  import type { ScriptableLineSegmentContext } from "chart.js";
  import "chartjs-adapter-date-fns";
  import type {} from "chartjs-plugin-zoom";
  import { de } from "date-fns/locale";
  import { onMount, untrack } from "svelte";
  import {
    Menu,
    Popover,
    Portal,
    TreeView,
    createTreeViewCollection,
    usePopover,
    useTreeView,
  } from "@skeletonlabs/skeleton-svelte";
  import { getTagTrend } from "$live/trends";
  import { getTrendHistory } from "$lib/remote/trend.remote";
  import { newId } from "$lib/util/newId";
  import { attempt } from "$lib/util/attempt";
  import {
    deleteView,
    loadLastSessionTagIds,
    loadSavedViews,
    saveLastSessionTagIds,
    saveView,
    type TrendViewSavedConfig,
    type TrendViewSavedConfigList,
  } from "$lib/client/util/localStorage/trendView.svelte";
  import { browser } from "$app/environment";
  import { errorToString, neverThrowErrorToString } from "$lib/util/neverThrow";
  import {
    formatStatusCode,
    isBadStatusCode,
    isGoodStatusCode,
    withAlpha,
    TREND_MAX_RANGE_MS,
    type TrendChartPoint,
    type TrendChartSeries,
    type TrendPoint,
  } from "$lib/util/trend";
  import {
    ChartNoAxesCombinedIcon,
    ChevronRightIcon,
    FolderIcon,
    ListIcon,
    LoaderIcon,
    SaveIcon,
    TagIcon,
    Trash2Icon,
  } from "@lucide/svelte";
  import { getAllTags, getAllTagFolders, getOpcuaStatusCodeMap } from "$lib/remote/tag.remote";
  import type { ClosureTableNodeWithPath } from "$lib/server/sqlite/util/tagClosureTable";

  type SelectedTag = { id: string; name: string; folderId: string | null; path: string };

  type TrendChartOptions = {
    stepped: boolean; // when true values are plotted at the same value till the next point instead of going diagoanlly to the next point
  };

  interface Props {
    selectedTags?: SelectedTag[];
    options?: TrendChartOptions;
  }

  let { selectedTags, options }: Props = $props();

  // static OPC-UA status code table for tooltip display (prerendered build-time)
  const statusCodeNames = await getOpcuaStatusCodeMap();
  // get all tags from server ok or err
  const allTags = await getAllTags();
  // get all tags with tredning enabled and that are ok
  const tags = allTags.reduce((acc, tag) => {
    if (tag.isOk && tag.value.options.trend.enabled) {
      acc.push({
        id: tag.value.id,
        name: tag.value.name,
        folderId: tag.value.options.folderId ?? null,
        path: tag.value.path,
      });
    }
    return acc;
  }, [] as SelectedTag[]);

  // tag folder tree, used to group the selection popover by folder
  const foldersResult = await getAllTagFolders();
  let folders: ClosureTableNodeWithPath[] = [];
  if (foldersResult.isErr) {
    console.error(`getAllTagFolders failed: ${neverThrowErrorToString(foldersResult.error)}`);
  } else {
    folders = foldersResult.value;
  }

  const PRESETS = [
    { label: "15m", ms: 15 * 60_000 },
    { label: "1h", ms: 60 * 60_000 },
    { label: "8h", ms: 8 * 60 * 60_000 },
    { label: "24h", ms: 24 * 60 * 60_000 },
    { label: "7d", ms: 7 * 24 * 60 * 60_000 },
  ] as const;

  const COLORS = [
    "#00c2ff",
    "#ff6b6b",
    "#ffd43b",
    "#69db7c",
    "#b197fc",
    "#ff922b",
    "#66d9e8",
    "#f783ac",
  ];

  const DEFAULT_WINDOW_MS = 15 * 60_000;
  const MIN_WINDOW_MS = 60_000;

  let selectedTagIds = $state<string[]>(selectedTags ? selectedTags.map((t) => t.id) : []);
  let from = $state(Date.now() - DEFAULT_WINDOW_MS);
  let to = $state(Date.now());
  // a range ending at (almost) now follows live samples instead of being a
  // fixed window - set whenever from/to change or a preset is clicked
  let liveFollow = $state(true);

  // drives the rolling live window without re-running the fetch effect
  let nowTick = $state(Date.now());
  // set while the plugin's resetZoom() runs so its onZoomComplete callback does
  // not overwrite a window that was set programmatically
  let suppressZoomSync = false;
  // the range already present in history; lets zoom/pan inside it skip refetch.
  // downsampled marks that the server averaged the points, so a narrower
  // (higher-resolution) request must refetch instead of reusing this data.
  let fetched: { key: string; start: number; end: number; downsampled: boolean } | null = null;

  let savedViews = $state<TrendViewSavedConfigList>([]);
  let saveError = $state<string | null>(null);
  let saveViewName = $state("");

  let history = $state<Record<string, TrendPoint[]>>({});
  let liveSamples = $state<Record<string, TrendPoint[]>>({});
  let loading = $state(false);
  let loadError = $state<string | null>(null);

  let tagQuery = $state("");

  const tagPopover = usePopover({
    id: `trending-tags-popover-${newId()}`,
    positioning: { placement: "bottom-start", offset: { mainAxis: 50 } },
    onOpenChange: (details) => {
      if (!details.open) tagQuery = "";
    },
  });

  function tagName(tagId: string): string {
    return tags.find((tag) => tag.id === tagId)?.name ?? tagId;
  }

  // stable per tag - based on the tag's position in the loaded list so the
  // colour does not jump around as the selection changes
  function colorFor(tagId: string): string {
    const index = tags.findIndex((tag) => tag.id === tagId);
    return COLORS[(index >= 0 ? index : 0) % COLORS.length];
  }

  function toggleTag(tagId: string) {
    if (selectedTagIds.includes(tagId)) {
      selectedTagIds = selectedTagIds.filter((id) => id !== tagId);
    } else {
      selectedTagIds = [...selectedTagIds, tagId];
    }
  }

  // ── Tag selection tree ────────────────────────────────

  // folders carry `parentId`, tags carry `folderId`
  function isFolderNode(
    node: ClosureTableNodeWithPath | SelectedTag,
  ): node is ClosureTableNodeWithPath {
    return Object.hasOwn(node, "parentId");
  }

  function rootFolders(): ClosureTableNodeWithPath[] {
    return folders.filter((folder) => folder.parentId == null);
  }

  function childFolders(folderId: string): ClosureTableNodeWithPath[] {
    return folders.filter((folder) => folder.parentId === folderId);
  }

  // tags with no folder (or a folder that no longer exists) live at the root
  function rootTags(): SelectedTag[] {
    return tags.filter(
      (tag) => tag.folderId == null || !folders.some((folder) => folder.id === tag.folderId),
    );
  }

  function folderTags(folderId: string): SelectedTag[] {
    return tags.filter((tag) => tag.folderId === folderId);
  }

  const normalizedTagQuery = $derived(tagQuery.trim().toLowerCase());
  // a query containing a slash is matched against full paths ("/root/f1/te").
  // otherwise it is a substring match on the node name
  const queryIsPath = $derived(normalizedTagQuery.includes("/"));
  const normalizedPathQuery = $derived.by(() => {
    if (normalizedTagQuery === "") return "";
    let query = normalizedTagQuery.replace(/\/+/g, "/");
    if (!query.startsWith("/")) query = "/" + query;
    if (query.length > 1) query = query.replace(/\/+$/, "");
    return query;
  });

  function tagMatchesQuery(tag: SelectedTag): boolean {
    if (normalizedTagQuery === "") return true;
    if (queryIsPath) return tag.path.toLowerCase().startsWith(normalizedPathQuery);
    return tag.name.toLowerCase().includes(normalizedTagQuery);
  }

  function folderMatchesQuery(folder: ClosureTableNodeWithPath): boolean {
    if (normalizedTagQuery === "") return true;
    if (queryIsPath) return folder.path.toLowerCase().startsWith(normalizedPathQuery);
    return folder.name.toLowerCase().includes(normalizedTagQuery);
  }

  // a folder is kept while searching when it matches itself or any tag in its
  // subtree matches
  function folderHasMatch(folderId: string): boolean {
    const folder = folders.find((candidate) => candidate.id === folderId);
    if (folder && folderMatchesQuery(folder)) return true;
    if (folderTags(folderId).some(tagMatchesQuery)) return true;
    return childFolders(folderId).some((child) => folderHasMatch(child.id));
  }

  // the collection owns the (filtered) child order and the template renders the
  // same order, so every node's indexPath stays valid while searching
  function visibleChildren(
    node: ClosureTableNodeWithPath | SelectedTag,
  ): (ClosureTableNodeWithPath | SelectedTag)[] {
    if (!isFolderNode(node)) return [];
    const subFolders = node.id === "root" ? rootFolders() : childFolders(node.id);
    const subTags = node.id === "root" ? rootTags() : folderTags(node.id);
    return [
      ...subFolders.filter((folder) => folderHasMatch(folder.id)),
      ...subTags.filter(tagMatchesQuery),
    ];
  }

  const rootNode = {
    id: "root",
    name: "",
    parentId: null,
    path: "",
  } satisfies ClosureTableNodeWithPath;

  let tagTreeCollection = $state(
    createTreeViewCollection<ClosureTableNodeWithPath | SelectedTag>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildren: (node) => visibleChildren(node),
      rootNode,
    }),
  );

  const tagTree = useTreeView({
    id: "trending-tags-tree",
    collection: tagTreeCollection,
    typeahead: true,
    selectionMode: "multiple",
    defaultExpandedValue: [],
  });

  // auto-expand the whole tree while searching, restoring the previous state
  // when the query is cleared
  let preSearchExpanded: string[] | null = null;
  let wasSearching = false;
  $effect(() => {
    const searching = normalizedTagQuery !== "";
    if (searching && !wasSearching) {
      preSearchExpanded = tagTree().expandedValue;
      tagTree().expand();
    } else if (!searching && wasSearching && preSearchExpanded) {
      tagTree().setExpandedValue(preSearchExpanded);
      preSearchExpanded = null;
    }
    wasSearching = searching;
  });

  const hasTrendTags = $derived(tags.length > 0);
  const visibleRootNodes = $derived(visibleChildren(rootNode));
  const hasSearchResults = $derived(
    normalizedTagQuery === "" ? tags.length > 0 : visibleRootNodes.length > 0,
  );

  function clampWindow(start: number, end: number) {
    const now = Date.now();
    let s = Math.min(start, now);
    let e = Math.min(end, now);
    if (e < s) [s, e] = [e, s];
    if (e - s > TREND_MAX_RANGE_MS) s = e - TREND_MAX_RANGE_MS;
    if (e - s < MIN_WINDOW_MS) e = s + MIN_WINDOW_MS;
    return { start: s, end: e };
  }

  // clears the plugin's pan/zoom state; the window itself is driven by state
  function clearZoom() {
    if (!chart) return;
    suppressZoomSync = true;
    chart.resetZoom?.("none");
    suppressZoomSync = false;
  }

  // a finished wheel/pinch/drag gesture on the x axis: pull the axis bounds
  // back into state so the existing effects refetch and redraw
  function syncWindowFromChart() {
    if (!chart || suppressZoomSync) return;
    const { min, max } = chart.scales.x;
    if (typeof min !== "number" || typeof max !== "number") return;
    const window = clampWindow(min, max);
    refreshLiveFollow();
    from = window.start;
    to = window.end;
  }

  function applyPreset(ms: number) {
    clearZoom();
    nowTick = Date.now();
    to = Date.now();
    from = to - ms;
    liveFollow = true;
  }

  function applySavedConfig(config: TrendViewSavedConfig) {
    clearZoom();
    nowTick = Date.now();
    const available = new Set(tags.map((tag) => tag.id));
    selectedTagIds = config.selectedTagIds.filter((id) => available.has(id));
    from = Date.now() - DEFAULT_WINDOW_MS;
    to = Date.now();
    liveFollow = true;
    fetched = null;
  }

  function handleSaveCurrentAs() {
    const name = saveViewName.trim();
    if (name.length === 0) return;
    const result = saveView(name, selectedTagIds);
    if (result.isErr()) {
      saveError = neverThrowErrorToString(result.error);
      return;
    }
    saveError = null;
    savedViews = [result.value, ...savedViews];
    saveViewName = "";
  }

  function handleDeleteSaved(id: string) {
    const result = deleteView(id);
    if (result.isErr()) {
      saveError = neverThrowErrorToString(result.error);
      return;
    }
    savedViews = savedViews.filter((view) => view.id !== id);
  }

  function refreshLiveFollow() {
    liveFollow = to >= Date.now() - 1000;
  }

  function toInputValue(ms: number): string {
    const date = new Date(ms);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromInputValue(value: string): number {
    return new Date(value).getTime();
  }

  function onFromChange(event: Event) {
    const parsed = fromInputValue((event.currentTarget as HTMLInputElement).value);
    if (Number.isNaN(parsed)) return;
    clearZoom();
    from = parsed;
    if (from >= to) to = from + MIN_WINDOW_MS;
    refreshLiveFollow();
  }

  function onToChange(event: Event) {
    const parsed = fromInputValue((event.currentTarget as HTMLInputElement).value);
    if (Number.isNaN(parsed)) return;
    clearZoom();
    to = parsed;
    if (to <= from) from = to - MIN_WINDOW_MS;
    refreshLiveFollow();
  }

  // history for the selected range; in live mode the window is re-anchored to
  // now so refetches (tag added/removed, preset re-clicked) cover the tail too
  $effect(() => {
    const tagIds = selectedTagIds;
    const start = from;
    const end = to;
    const isLive = liveFollow;

    if (tagIds.length === 0) {
      history = {};
      fetched = null;
      loadError = null;
      loading = false;
      return;
    }

    const fetchStart = isLive ? Date.now() - Math.max(end - start, 1) : start;
    const fetchEnd = isLive ? Date.now() : end;

    if (fetchStart >= fetchEnd) {
      fetched = null;
      loading = false;
      loadError = "invalid range: from must be before to";
      return;
    }
    if (fetchEnd - fetchStart > TREND_MAX_RANGE_MS) {
      fetched = null;
      loading = false;
      loadError = "invalid range: must not exceed 31 days";
      return;
    }

    const key = [...tagIds].sort().join("|");
    if (fetched && fetched.key === key && fetchStart >= fetched.start && fetchEnd <= fetched.end) {
      const sameRange = fetchStart === fetched.start && fetchEnd === fetched.end;
      // averaged data is lower resolution, so only reuse it for the exact same
      // range - any narrowing has to refetch to get the sharper samples back
      if (!fetched.downsampled || sameRange) {
        loading = false;
        loadError = null;
        return;
      }
    }

    let cancelled = false;
    loading = true;
    (async () => {
      // untrack: svelte-kit's remote query machinery reads reactive internals
      // during invocation; without this the effect re-runs on every response.
      // One query per tag, fired together so they resolve concurrently; each
      // response is capped at TREND_MAX_POINTS server-side and the transport
      // treats every tag as its own request.
      const results = await untrack(() =>
        Promise.all(
          tagIds.map((tagId) =>
            attempt(() => getTrendHistory({ tagId, from: fetchStart, to: fetchEnd })),
          ),
        ),
      );
      if (cancelled) return;
      loading = false;

      const next: Record<string, TrendPoint[]> = {};
      let firstError: string | null = null;
      let downsampled = false;
      for (const result of results) {
        if (result.error) {
          console.error(`getTrendHistory failed: ${errorToString(result.error)}`);
          firstError ??= errorToString(result.error);
          continue;
        }
        const wire = result.data;
        if (wire.isErr) {
          firstError ??= neverThrowErrorToString(wire.error);
          continue;
        }
        if (wire.value.factor > 1) downsampled = true;
        next[wire.value.tagId] = wire.value.points;
      }

      history = next;
      if (firstError) {
        fetched = null;
        loadError = firstError;
      } else {
        fetched = { key, start: fetchStart, end: fetchEnd, downsampled };
        loadError = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  // one live stream per selected tag; merge:"latest" buffers are arrays of
  // TrendPoint (init rows + every published sample)
  $effect(() => {
    if (!liveFollow) return;
    const tagIds = [...selectedTagIds];
    const unsubscribes = tagIds.map((tagId) => {
      return getTagTrend(tagId).subscribe((value) => {
        if (!value || "error" in value) return;
        // untrack the read-modify-write: the subscribe callback fires
        // synchronously during effect setup and must not become a dependency
        untrack(() => {
          liveSamples = { ...liveSamples, [tagId]: value };
        });
      });
    });
    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  });

  // advance the live window once a second; deliberately kept out of the fetch
  // effect so tracking live does not re-query the server every tick
  $effect(() => {
    if (!liveFollow) return;
    nowTick = Date.now();
    const id = setInterval(() => {
      nowTick = Date.now();
    }, 1000);
    return () => clearInterval(id);
  });

  // the visible window; in live mode it is re-anchored to now so both the
  // plotted points and the x-axis follow the live tail
  const timeWindow = $derived.by(() => {
    const duration = Math.max(to - from, 1);
    const end = liveFollow ? nowTick : to;
    return { start: liveFollow ? end - duration : from, end };
  });

  const series = $derived.by(() => {
    const { start, end } = timeWindow;

    return selectedTagIds.map((tagId) => {
      const merged = new Map<number, TrendPoint>();
      for (const point of history[tagId] ?? []) merged.set(point.timestamp, point);
      if (liveFollow) {
        for (const point of liveSamples[tagId] ?? []) merged.set(point.timestamp, point);
      }

      const points: TrendChartPoint[] = [];
      for (const point of merged.values()) {
        if (point.timestamp < start || point.timestamp > end) continue;
        points.push({ x: point.timestamp, y: point.value, statusCode: point.statusCode });
      }
      points.sort((a, b) => a.x - b.x);

      return { label: tagName(tagId), color: colorFor(tagId), data: points };
    });
  });

  let canvas: HTMLCanvasElement | undefined = $state();
  // raw: never proxy the Chart instance, but reassignment must re-run the data
  // effect once async creation finishes
  let chart = $state.raw<Chart<"line"> | undefined>();

  function toDatasets(values: TrendChartSeries[]) {
    return values.map((entry) => ({
      label: entry.label,
      data: entry.data,
      borderColor: entry.color,
      backgroundColor: entry.color,
      borderWidth: 1,
      pointRadius: 0,
      pointHitRadius: 6,
      spanGaps: false,
      stepped: options?.stepped ?? false,
      // dim segments touching a sample whose status is not Good
      segment: {
        borderColor: (ctx: ScriptableLineSegmentContext) => {
          const p0 = (ctx.p0 as { raw?: TrendChartPoint }).raw;
          const p1 = (ctx.p1 as { raw?: TrendChartPoint }).raw;
          if (p0 && p1 && isGoodStatusCode(p0.statusCode) && isGoodStatusCode(p1.statusCode)) {
            return entry.color;
          }
          return withAlpha(entry.color, 0.6);
        },
      },
    }));
  }

  // restore last session / saved views once after mount, then persist every
  // tag-selection change; selectedTagIds is read every run so the effect stays
  // subscribed to it across the one-time restore pass
  let storageInitialised = false;
  $effect(() => {
    if (!browser) return;
    const tagIds = selectedTagIds;

    if (!storageInitialised) {
      storageInitialised = true;

      const loadedViews = loadSavedViews();
      if (loadedViews.isOk()) {
        savedViews = loadedViews.value;
      }

      const last = loadLastSessionTagIds();
      if (last.isOk() && last.value.length > 0) {
        const available = new Set(tags.map((tag) => tag.id));
        const restored = last.value.filter((id) => available.has(id));
        if (restored.length > 0) {
          selectedTagIds = restored;
          return;
        }
      }
    }

    void saveLastSessionTagIds(tagIds);
  });

  onMount(() => {
    const element = canvas;
    if (!element) {
      console.error("TrendChart onMount() canvas not bound");
      return;
    }

    let destroyed = false;
    let created: Chart<"line"> | undefined;

    (async () => {
      // dynamically imported so hammerjs (which touches document at import
      // time) never runs during SSR - chartjs-plugin-zoom's ESM entry imports
      // it at the top level
      const plugin = await attempt(() => import("chartjs-plugin-zoom"));
      if (destroyed) return;
      if (plugin.error) {
        console.error(`TrendChart onMount() ${errorToString(plugin.error)}`);
        return;
      }
      Chart.register(plugin.data.default);

      const computed = attempt(() => getComputedStyle(element));
      if (computed.error) {
        console.error(`TrendChart onMount() ${errorToString(computed.error)}`);
        return;
      }
      if (destroyed) return;
      Chart.defaults.color = computed.data.getPropertyValue("--color-surface-400");
      Chart.defaults.borderColor = computed.data.getPropertyValue("--color-surface-600");
      const statusBadColor = computed.data.getPropertyValue("--color-error-500");

      const result = attempt(
        () =>
          new Chart(element, {
            type: "line",
            data: {
              datasets: toDatasets(series),
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: {
                mode: "index",
                intersect: false,
              },
              elements: {
                line: {
                  borderJoinStyle: "round",
                },
                point: {
                  pointStyle: false,
                },
              },
              animation: false,
              scales: {
                x: {
                  type: "time",
                  adapters: {
                    date: {
                      locale: de,
                    },
                  },
                  time: {
                    tooltipFormat: "d MMM yyyy - HH:mm:ss",
                    displayFormats: {
                      second: "HH:mm:ss",
                      minute: "HH:mm:ss",
                      hour: "HH:mm",
                      day: "d MMM",
                    },
                  },
                },
                y: {
                  type: "linear",
                  grace: "5%",
                },
              },
              plugins: {
                legend: {
                  display: false, // Hides the legend as we display chips of currently selected tags
                },
                tooltip: {
                  callbacks: {
                    label: (item) => {
                      const value = `${item.dataset.label}: ${item.parsed.y}`;
                      const point = (item as { raw?: TrendChartPoint }).raw;
                      if (!point) return value;
                      // good so dont clutter the display with status code
                      if (point.statusCode === 0x000000) return `${value}`;
                      return `${value} \t\t\t:\t\t\t ${formatStatusCode(point.statusCode, statusCodeNames)}`;
                    },
                    labelTextColor: (item) => {
                      const point = (item as { raw?: TrendChartPoint }).raw;
                      if (point && isBadStatusCode(point.statusCode)) return statusBadColor;
                      return undefined;
                    },
                  },
                },
                zoom: {
                  limits: { x: { minRange: MIN_WINDOW_MS } },
                  pan: {
                    enabled: true,
                    mode: "x",
                    onPanComplete: () => syncWindowFromChart(),
                  },
                  zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    drag: { enabled: false },
                    mode: "x",
                    onZoomComplete: () => syncWindowFromChart(),
                  },
                },
              },
            },
          }),
      );
      if (destroyed) {
        if (!result.error) result.data.destroy();
        return;
      }
      if (result.error) {
        console.error(`TrendChart onMount() ${errorToString(result.error)}`);
        return;
      }
      created = result.data;
      chart = created;
    })();

    return () => {
      destroyed = true;
      created?.destroy();
      chart = undefined;
    };
  });

  // runs whenever series changes; the first run may land before onMount has
  // created the chart, in which case onMount already built it from series
  $effect(() => {
    if (!chart) return;
    chart.data.datasets = toDatasets(series);
    // drive the x scale from the selected window instead of letting it
    // auto-fit the samples, so the axis follows from/to even when the range
    // has no (or sparse) data
    const axis = chart.options.scales?.x;
    if (axis) {
      axis.min = timeWindow.start;
      axis.max = timeWindow.end;
    }
    chart.update("none");
  });
</script>

<div class="flex h-full w-full flex-col gap-2 p-2">
  <div class="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
    <div>
      <Menu>
        <Menu.Trigger
          class="btn preset-filled-surface-200-800 p-3"
          aria-label="Saved views"
          title="Saved views"
        >
          <ListIcon class="size-4" />
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content>
              <Menu>
                <Menu.TriggerItem value="saveCurrent">
                  <SaveIcon class="size-4"></SaveIcon>
                  <Menu.ItemText class="px-2">Save Current View</Menu.ItemText>
                  <Menu.ItemIndicator>
                    <ChevronRightIcon class="size-4" />
                  </Menu.ItemIndicator>
                </Menu.TriggerItem>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <div class="flex flex-col gap-3">
                        <h2 class="text-sm font-semibold">Save current view</h2>
                        <input
                          type="text"
                          class="input"
                          placeholder="View name"
                          bind:value={saveViewName}
                          onkeydown={(e) => {
                            if (e.key === "Enter") handleSaveCurrentAs();
                          }}
                        />
                        {#if saveError}
                          <span class="text-xs text-error-500">{saveError}</span>
                        {/if}
                        <div class="flex justify-end gap-2">
                          <button type="button" class="btn preset-ghost">Cancel</button>
                          <button
                            type="button"
                            class="btn preset-filled"
                            onclick={handleSaveCurrentAs}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu>
              <Menu.Separator />
              {#if savedViews.length === 0}
                <span class="text-sm opacity-60">no saved views</span>
              {:else}
                {#each savedViews as view (view.id)}
                  <Menu.Item value={view.name} onclick={() => applySavedConfig(view)}>
                    <div class="flex items-center gap-2">
                      <ChartNoAxesCombinedIcon class="size-4" />
                      <Menu.ItemText class="cursor-default">
                        {view.name} ({view.selectedTagIds.length})
                      </Menu.ItemText>
                    </div>
                    <button
                      type="button"
                      class="btn-icon btn-icon-sm preset-ghost"
                      onclick={(ev) => {
                        ev.stopPropagation(); // stop from applying the saved config on delete
                        handleDeleteSaved(view.id);
                      }}
                      aria-label="Delete saved view"
                    >
                      <Trash2Icon class="size-4" />
                    </button>
                  </Menu.Item>
                {/each}
              {/if}
              {#if saveError}
                <span class="mt-1 block text-xs text-error-500">{saveError}</span>
              {/if}
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu>

      {#snippet tagTreeNode(node: ClosureTableNodeWithPath | SelectedTag, indexPath: number[])}
        <TreeView.NodeProvider value={{ node, indexPath }}>
          {#if isFolderNode(node)}
            {@const children = visibleChildren(node)}

            <TreeView.Branch>
              <TreeView.BranchControl>
                <TreeView.BranchIndicator />
                <TreeView.BranchText
                  class="truncate"
                  onclick={(ev) => {
                    tagQuery = node.path;
                    wasSearching = false;
                    tagTree().expand();
                  }}
                >
                  <FolderIcon class="size-4 shrink-0 opacity-75" />
                  {node.name}
                </TreeView.BranchText>
              </TreeView.BranchControl>
              <TreeView.BranchContent>
                <TreeView.BranchIndentGuide />
                {#if children.length > 0}
                  {#each children as child, i (child.id)}
                    {@render tagTreeNode(child, [...indexPath, i])}
                  {/each}
                {/if}
              </TreeView.BranchContent>
            </TreeView.Branch>
          {:else}
            <TreeView.Item>
              <label class="flex cursor-pointer items-center gap-2 p-1">
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={selectedTagIds.includes(node.id)}
                  // fix the skeleton <TreeView> not letting click events through
                  onclick={(ev) => ev.stopPropagation()}
                  onchange={(ev) => toggleTag(node.id)}
                />
                <span
                  class="size-3 shrink-0 rounded-full"
                  style:background={colorFor(node.id)}
                ></span>
                <TagIcon class="size-4 shrink-0 opacity-75" />
                <span class="truncate">{node.name}</span>
              </label>
            </TreeView.Item>
          {/if}
        </TreeView.NodeProvider>
      {/snippet}

      <Popover.Provider value={tagPopover}>
        <Popover.Trigger class="btn preset-filled p-3" title="Select tags to plot">
          <TagIcon />
          tags ({selectedTagIds.length})
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content
            class="card max-h-96 overflow-y-auto p-2 preset-filled-surface-100-900 z-10"
          >
            {#if hasTrendTags}
              <div class="input-group mb-2 grid-cols-[auto_1fr]">
                <input
                  class="input"
                  type="search"
                  placeholder="Search tags or /folder/path..."
                  bind:value={tagQuery}
                />
              </div>
            {/if}
            {#if hasSearchResults}
              <TreeView.Provider value={tagTree}>
                <TreeView.Tree class="w-full">
                  {#each visibleRootNodes as node, i (node.id)}
                    {@render tagTreeNode(node, [i])}
                  {/each}
                </TreeView.Tree>
              </TreeView.Provider>
            {:else}
              <span class="opacity-60">
                {hasTrendTags
                  ? "no tags or folders match your search"
                  : "no tags with trending enabled"}
              </span>
            {/if}
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Provider>
    </div>

    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      {#if liveFollow}
        <span class="badge preset-filled-success-500">live</span>
      {/if}
      {#if loading}
        <LoaderIcon class="size-4 animate-spin" />
      {/if}
      {#if loadError}
        <span class="text-sm text-error-500">{loadError}</span>
      {/if}

      <div class="btn-group bg-surface-100-900">
        {#each PRESETS as preset (preset.label)}
          <button
            type="button"
            class="btn"
            class:preset-filled={liveFollow && to - from === preset.ms}
            onclick={() => applyPreset(preset.ms)}
          >
            {preset.label}
          </button>
        {/each}
      </div>

      <label class="flex items-center gap-1 text-sm">
        from
        <input
          type="datetime-local"
          class="input"
          value={toInputValue(from)}
          onchange={onFromChange}
        />
      </label>
      <label class="flex items-center gap-1 text-sm">
        to
        <input type="datetime-local" class="input" value={toInputValue(to)} onchange={onToChange} />
      </label>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {#each selectedTagIds as tagId (tagId)}
      <span
        class="chip preset-tonal flex items-center gap-1"
        title={tags.find((t) => t.id == tagId)?.path}
      >
        <span class="size-2 rounded-full" style:background={colorFor(tagId)}></span>
        {tagName(tagId)}
        <button type="button" class="cursor-pointer" onclick={() => toggleTag(tagId)}>×</button>
      </span>
    {:else}
      <span class="text-sm opacity-60">select one or more tags to plot</span>
    {/each}
  </div>

  <svelte:boundary
    onerror={(error) => {
      console.error(error);
    }}
  >
    <div class="relative min-h-0 flex-1">
      <canvas bind:this={canvas}></canvas>
    </div>
    {#snippet failed(error: unknown)}
      <div class="text-error-500">chart failed: {String(error)}</div>
    {/snippet}
  </svelte:boundary>
</div>

<style>
  /* skeleton <TreeView> change selected apperance */

  :global(
    [data-scope="tree-view"] [data-part="item"][data-selected],
    [data-scope="tree-view"] [data-part="branch-control"][data-selected]
  ) {
    background-color: light-dark(var(--color-primary-300), var(--color-primary-800));
    color: light-dark(var(--color-neutral-000), var(--color-neutral-900));
  }
</style>
