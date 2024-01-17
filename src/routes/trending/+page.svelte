<script lang="ts">
    import { Chart } from 'chart.js/auto';
    import 'chartjs-adapter-date-fns';
    import { de } from 'date-fns/locale';
    import { onMount } from 'svelte';
    import zoomPlugin from 'chartjs-plugin-zoom';


    const { data } = $props();

    Chart.register(zoomPlugin);

    

    console.log(data.trending);
    let trend; 
    let ctx;

    onMount(() => {
        ctx = document.querySelector('#trend');
        let style = getComputedStyle(ctx);
        Chart.defaults.color = style.getPropertyValue('--app-text-color');
        Chart.defaults.borderColor = style.getPropertyValue('--app-color-neutral-500');
        let generated = [];
        for(let i = 0; i < 100; i++)
        {
            generated[i] = {time: Date.now() + i * 1000, value: i}
        }
        trend = new Chart(ctx, {
            

            
            type: 'line',
            data: {
                datasets: data.trending
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
                    mode: 'index',
                    intersect: false
                },
                parsing: {
                    xAxisKey: 'time',
                    yAxisKey: 'value'
                },
                elements: {
                    line: {
                        borderWidth: 1,
                        spanGaps: false,
                        borderJoinStyle: 'round'
                    },
                    point: {
                        pointStyle: false
                    }
                },
                animation: {
                    duration: 0
                },
                adapters: {
                    date: {
                        locale: de
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            parser: 'HH:mm:ss',
                            unit: 'minute',
                            displayFormats: {
                                hour: 'HH:mm:ss'
                            },
                            tooltipFormat: 'd MMM yyyy - HH:mm:ss'
                        }
                    },
                    y: {
                        type: 'linear',
                        min: 0,
                        

                        beginAtZero: true,

                        grace: '10%',
                        /*title: {
                            display: true,
                            text: 'C'
                        }*/
                    }
                },

                plugins: {
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x',
                            onPan: (ctx) => {
                                //console.log(ctx);
                                
                            }
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                                speed: 0.04
                            },
                            pinch: {
                                enabled: true
                            },
                            mode: 'x'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => {
                                //console.log(item)
                                if(item.dataset.unit)
                                {
                                    item.formattedValue = item.parsed.y + " " + item.dataset.unit;
                                }
                            }
                        }
                    }
                }
            }
        });
    });
/*
    function resizeCanvas()
    {
        window.
    }


    window.onresize(resizeCanvas);
*/
    let t = 100;
    function update() 
    {
        /*for (let point of data.attx01) 
        {
            trend.config.data.labels.push(point.time);
            trend.config.data.datasets[0].data.push(point.data);
        }
        */

       trend.config.data.datasets[0].data.push({time: Date.now() + trend.config.data.datasets[0].data.length * 1000, value: t/ 10});
       t++;
        trend.update();

        //getTags({cookies: null, request: {tags: ['attx01','attx02']}});
        getTrend('attx01');
        
    }


    async function getTrend(tagName: string) {
        const response = await fetch(`/api/trend?tagName=${tagName}`,{
 			method:'GET'
        });

        const data = await response.json();

        console.log(data);
    }
    

</script>


<div id="container">
    <div class="chart-container">
        <canvas id="trend"></canvas>
    </div>
    
    <button class="primary" on:click={update}>UPDATE</button>
    
</div>




<style>

    #container
    {
        width: 100%;
        height: 100%;
    }

    .chart-container
    {
        position: relative;
        height: 90%;
        width: 100%;
    }

</style>