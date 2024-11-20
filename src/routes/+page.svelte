<script>
    import mapboxgl from 'mapbox-gl';
    import '../../node_modules/mapbox-gl/dist/mapbox-gl.css';
    import * as d3 from 'd3';
    import { onMount } from 'svelte';

    mapboxgl.accessToken = 'pk.eyJ1IjoiYWtjb25yZXkxIiwiYSI6ImNtM3BlZ2U0NzBkcXEyanExbmY4YzFrYmwifQ.zs2pf0PU3pgyd-xnTrrVZA';

    let map;
    let stations = [];
    let trips = [];
    let departuresByMinute = Array.from({ length: 1440 }, () => []);
    let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
    let timeFilter = -1; // Initial filter value (-1 means no filter)
    let debounceTimeout;

    // Initialize filtered departures and arrivals
    let filteredDepartures = [];
    let filteredArrivals = [];

    // Reactive variables
    let mapViewChanged = 0; // Tracks map state changes
    $: map?.on('move', () => mapViewChanged++);

    $: timeFilterLabel = timeFilter === -1
        ? 'Any time'
        : new Date(0, 0, 0, 0, timeFilter).toLocaleTimeString('en', { timeStyle: 'short' });

    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    // Cached station data for faster updates
    $: filteredStations = stations.map((station) => {
        if (!station.cachedTotalTraffic || timeFilterChanged) {
            let id = station.Number;
            let arrivals = d3.sum(filteredArrivals, (trip) => trip.end_station_id === id);
            let departures = d3.sum(filteredDepartures, (trip) => trip.start_station_id === id);

            station.cachedArrivals = arrivals;
            station.cachedDepartures = departures;
            station.cachedTotalTraffic = arrivals + departures;
            station.cachedDepartureRatio = departures / (arrivals + departures || 1);
        }
        return {
            ...station,
            arrivals: station.cachedArrivals,
            departures: station.cachedDepartures,
            totalTraffic: station.cachedTotalTraffic,
            departureRatio: station.cachedDepartureRatio,
        };
    });

    // Radius scale for circles
    $: radiusScale = d3
        .scaleSqrt()
        .domain([0, d3.max(filteredStations, (d) => d.totalTraffic || 0)])
        .range(timeFilter === -1 ? [0, 25] : [3, 50]);

    // Debounced filtering
    $: debounce(() => {
        filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
        filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);
    }, 100);

    function debounce(callback, delay) {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            callback();
        }, delay);
    }

    // Filter trips by minute
    function filterByMinute(tripsByMinute, minute) {
        if (minute === -1) return trips;

        let minMinute = (minute - 60 + 1440) % 1440;
        let maxMinute = (minute + 60) % 1440;

        if (minMinute > maxMinute) {
            return [
                ...tripsByMinute.slice(minMinute),
                ...tripsByMinute.slice(0, maxMinute),
            ].flat();
        } else {
            return tripsByMinute.slice(minMinute, maxMinute).flat();
        }
    }

    function minutesSinceMidnight(date) {
        return date.getHours() * 60 + date.getMinutes();
    }

    function getCoords(station) {
        if (!map) return { cx: 0, cy: 0 };
        const point = new mapboxgl.LngLat(+station.Long, +station.Lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }

    onMount(async () => {
        map = new mapboxgl.Map({
            container: 'map',
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-71.1189, 42.3736],
            zoom: 12,
        });

        await new Promise((resolve) => map.on('load', resolve));

        // Add Boston and Cambridge bike lanes
        map.addSource('boston_route', {
            type: 'geojson',
            data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
        });

        map.addLayer({
            id: 'boston_bike_lanes',
            type: 'line',
            source: 'boston_route',
            paint: {
                'line-color': 'green',
                'line-width': 3,
                'line-opacity': 0.4,
            },
        });

        map.addSource('cambridge_route', {
            type: 'geojson',
            data: '../../static/RECREATION_BikeFacilities.geojson',
        });

        map.addLayer({
            id: 'cambridge_bike_lanes',
            type: 'line',
            source: 'cambridge_route',
            paint: {
                'line-color': 'blue',
                'line-width': 3,
                'line-opacity': 0.4,
            },
        });

        const stationData = await d3.csv(
            'https://vis-society.github.io/labs/8/data/bluebikes-stations.csv'
        );
        const tripData = await d3.csv(
            'https://vis-society.github.io/labs/8/data/bluebikes-traffic-2024-03.csv'
        );

        stations = stationData;

        trips = tripData.map((trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);

            let startMinutes = minutesSinceMidnight(trip.started_at);
            let endMinutes = minutesSinceMidnight(trip.ended_at);

            departuresByMinute[startMinutes].push(trip);
            arrivalsByMinute[endMinutes].push(trip);

            return trip;
        });
    });
</script>

<style>
    @import url('$lib/global.css');

    #map {
        position: relative;
        width: 100%;
        height: 500px;
    }

    #map svg {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    #map svg circle {
        pointer-events: auto;
        fill-opacity: 0.6;
        stroke: white;
    }

    :root {
        --color-departures: steelblue;
        --color-arrivals: darkorange;
    }

    circle {
        --color: color-mix(
            in oklch,
            var(--color-departures) calc(100% * var(--departure-ratio)),
            var(--color-arrivals)
        );
        fill: var(--color);
    }

    .legend {
        display: flex;
        justify-content: space-evenly;
        margin-top: 1em;
        padding: 1em;
        background-color: #f9f9f9;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
        font-size: 0.9em;
    }

    .legend div {
        display: flex;
        align-items: center;
        gap: 0.5em;
    }

    .legend div::before {
        content: '';
        display: inline-block;
        width: 20px;
        height: 20px;
        border-radius: 50%;
    }

    .legend div:nth-child(1)::before {
        background: var(--color-departures);
    }

    .legend div:nth-child(2)::before {
        background: color-mix(in oklch, var(--color-departures) 50%, var(--color-arrivals));
    }

    .legend div:nth-child(3)::before {
        background: var(--color-arrivals);
    }

    header {
        display: flex;
        gap: 1em;
        align-items: baseline;
        margin-bottom: 1em;
    }

    header label {
        margin-left: auto;
    }

    em {
        color: gray;
        font-style: italic;
    }

    time {
        display: block;
    }
</style>

<header>
    <h1>Bike Traffic in the Boston Area</h1>
    <label>
        Filter by time:
        <input type="range" min="-1" max="1440" bind:value={timeFilter}>
        {#if timeFilter === -1}
            <em>(Any time)</em>
        {:else}
            <time>{timeFilterLabel}</time>
        {/if}
    </label>
</header>

<p>
    This visualization shows Boston and Cambridge bike paths (green and blue, respectively) and Bluebike stations.
    Stations are represented by circles, where location data is dynamically updated as the map is panned or zoomed.
</p>

<div id="map">
    <svg>
        {#key mapViewChanged}
            {#each filteredStations as station}
                <circle
                    {...getCoords(station)}
                    r={radiusScale(station.totalTraffic)}
                    style="--departure-ratio: {stationFlow(station.departureRatio)}">
                    <title>
                        {station.totalTraffic} trips ({station.departures} departures, {station.arrivals} arrivals)
                    </title>
                </circle>
            {/each}
        {/key}
    </svg>
</div>

<div class="legend">
    <div>More departures</div>
    <div>Balanced</div>
    <div>More arrivals</div>
</div>
