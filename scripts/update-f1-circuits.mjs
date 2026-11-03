import { writeFile } from "node:fs/promises";

// GeoJSON centrelines are projected to SVG paths; no map tiles or image service needed.
const source = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/";
const ids = {
    albert_park: "au-1953", bahrein: "bh-2002", shanghai: "cn-2004",
    montmelo: "es-1991", monaco: "mc-1929", gilles_villeneuve: "ca-1978",
    red_bull_ring: "at-1969", silverstone: "gb-1948", hungaroring: "hu-1986",
    spa: "be-1925", monza: "it-1922", marina_bay: "sg-2008", suzuka: "jp-1962",
    austin: "us-2012", hermanos_rodriguez: "mx-1962", interlagos: "br-1940",
    yas_marina: "ae-2009", imola: "it-1953", sepang: "my-1999", zandvoort: "nl-1948",
    jeddah: "sa-2021", miami: "us-2022", lusail: "qa-2004", madring: "es-2026",
    baku: "az-2016", vegas: "us-2023"
};
const response = await fetch(source + "f1-circuits.geojson", { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Circuit download failed: ${response.status}`);
const geo = await response.json();
const circuits = {};
for (const [id, sourceId] of Object.entries(ids)) {
    const feature = geo.features.find(item => item.properties.id === sourceId);
    if (!feature || feature.geometry.type !== "LineString") throw new Error(`Missing circuit: ${id}`);
    const coordinates = feature.geometry.coordinates;
    const latitude = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;
    const cosine = Math.cos(latitude * Math.PI / 180);
    const projected = coordinates.map(([longitude, lat]) => [longitude * cosine, -lat]);
    const xs = projected.map(point => point[0]);
    const ys = projected.map(point => point[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
    const scale = Math.min(552 / width, 232 / height);
    const points = projected.map(([x, y]) => [
        Number(((x - minX) * scale + (600 - width * scale) / 2).toFixed(2)),
        Number(((y - minY) * scale + (280 - height * scale) / 2).toFixed(2))
    ]);
    circuits[id] = {
        name: feature.properties.Name,
        path: points.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" "),
        start: points[0]
    };
}
const licenseResponse = await fetch(source + "LICENSE.md", { signal: AbortSignal.timeout(30000) });
if (!licenseResponse.ok) throw new Error("Circuit license download failed");
await writeFile(new URL("../f1-circuits-LICENSE.txt", import.meta.url), await licenseResponse.text());
await writeFile(new URL("../f1-circuits.json", import.meta.url), JSON.stringify({
    source: "https://github.com/bacinger/f1-circuits", viewBox: "0 0 600 280", circuits
}, null, 2) + "\n");
console.log(`Generated SVG path data for ${Object.keys(circuits).length} circuits.`);
