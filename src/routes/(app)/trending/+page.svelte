<script lang="ts">
  import { browser } from "$app/environment";
  import { Chart } from "chart.js/auto";
  import "chartjs-adapter-date-fns";
  import { de } from "date-fns/locale";
  import { onMount } from "svelte";
  import { err, ok } from "neverthrow";
  import { attempt } from "$lib/util/attempt";
  import {
    errorToString,
    neverThrowErrorToString,
    type NeverThrowError,
  } from "$lib/util/neverThrow";
  //import zoomPlugin from 'chartjs-plugin-zoom';

  const { data } = $props();

  //if(browser) Chart.register(zoomPlugin);

  console.log(data.trending);
  let trend;
  let ctx;


  onMount(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("#trend");
    if (!canvas) {
      console.error("onMount() #trend canvas not found");
      return;
    }
    ctx = canvas;
    const computed = attempt(() => getComputedStyle(canvas));
    if (computed.error) {
      console.error(`onMount() ${errorToString(computed.error)}`);
      return;
    }
    const style = computed.data;
    Chart.defaults.color = style.getPropertyValue("--app-text-color");
    Chart.defaults.borderColor = style.getPropertyValue(
      "--app-color-neutral-500"
    );
    let generated = [];
    for (let i = 0; i < 100; i++) {
      generated[i] = { time: Date.now() + i * 1000, value: i };
    }
    const chart = attempt(
      () =>
        new Chart(canvas, {
          type: "line",
          data: {
            datasets: data.trending,
            /*datasets: [
                        {
                            label: "attx01",
                            data: generated,
                            unit: "*C"
                        }
                    ]*/
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
              mode: "index",
              intersect: false,
            },
            parsing: {
              xAxisKey: "time",
              yAxisKey: "value",
            },
            elements: {
              line: {
                borderWidth: 1,
                spanGaps: false,
                borderJoinStyle: "round",
              },
              point: {
                pointStyle: false,
              },
            },
            animation: {
              duration: 0,
            },
            adapters: {
              date: {
                locale: de,
              },
            },
            scales: {
              x: {
                type: "time",
                time: {
                  parser: "HH:mm:ss",
                  unit: "minute",
                  displayFormats: {
                    hour: "HH:mm:ss",
                  },
                  tooltipFormat: "d MMM yyyy - HH:mm:ss",
                },
              },
              y: {
                type: "linear",
                min: 0,

                beginAtZero: true,

                grace: "10%",
                /*title: {
                                display: true,
                                text: 'C'
                            }*/
              },
            },

            plugins: {
              zoom: {
                pan: {
                  enabled: true,
                  mode: "x",
                  onPan: (ctx) => {
                    //console.log(ctx);
                  },
                },
                zoom: {
                  wheel: {
                    enabled: true,
                    speed: 0.04,
                  },
                  pinch: {
                    enabled: true,
                  },
                  mode: "x",
                },
              },
              tooltip: {
                callbacks: {
                  label: (item) => {
                    //console.log(item)
                    if (item.dataset.unit) {
                      item.formattedValue =
                        item.parsed.y + " " + item.dataset.unit;
                    }
                  },
                },
              },
            },
          },
        }),
    );
    if (chart.error) {
      console.error(`onMount() ${errorToString(chart.error)}`);
      return;
    }
    trend = chart.data;
  });
  /*
    function resizeCanvas()
    {
        window.
    }


    window.onresize(resizeCanvas);
*/
  let t = 100;
  async function update() {
    /*for (let point of data.attx01) 
        {
            trend.config.data.labels.push(point.time);
            trend.config.data.datasets[0].data.push(point.data);
        }
        */

    const datasets = trend?.config.data.datasets;
    if (!trend || !datasets || datasets.length === 0) {
      console.error("update() no chart dataset to push a point to");
      return;
    }

    const pushed = attempt(() => {
      datasets[0].data.push({
        time: Date.now() + datasets[0].data.length * 1000,
        value: t / 10,
      });
      t++;
      trend.update();
    });
    if (pushed.error) {
      console.error(`update() ${errorToString(pushed.error)}`);
      return;
    }

    //getTags({cookies: null, request: {tags: ['attx01','attx02']}});
    const fetched = await getTrend("attx01");
    if (fetched.isErr()) {
      console.error(`update() ${neverThrowErrorToString(fetched.error)}`);
    }
  }

  async function getTrend(tagName: string) {
    const response = await attempt(() =>
      fetch(`/api/trend?tagName=${tagName}`, {
        method: "GET",
      }),
    );
    if (response.error) {
      return err({
        reason: "TREND_FETCH_FAILED",
        cause: errorToString(response.error),
      } as const satisfies NeverThrowError);
    }

    if (!response.data.ok) {
      return err({
        reason: "TREND_HTTP_ERROR",
        cause: `trend request failed with status ${response.data.status}`,
      } as const satisfies NeverThrowError);
    }

    const body = await attempt(() => response.data.json());
    if (body.error) {
      return err({
        reason: "TREND_JSON_PARSE_FAILED",
        cause: errorToString(body.error),
      } as const satisfies NeverThrowError);
    }

    console.log(body.data);
    return ok(null);
  }
</script>

<div id="container">
  <div class="chart-container">
    <canvas id="trend"></canvas>
  </div>

  <button class="primary" onclick={update}>UPDATE</button>
</div>

<style>
  #container {
    width: 100%;
    height: 100%;
  }

  .chart-container {
    position: relative;
    height: 90%;
    width: 100%;
  }
</style>
