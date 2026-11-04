(() => {
    const definitions = {
        fp1: { label: "P1", title: "Practice 1", isRace: false },
        fp2: { label: "P2", title: "Practice 2", isRace: false },
        fp3: { label: "P3", title: "Practice 3", isRace: false },
        sq: { label: "SQ", title: "Sprint qualifying", isRace: false },
        sprint: { label: "Sprint", title: "Sprint", isRace: true },
        qualifying: { label: "Q", title: "Qualifying", isRace: false },
        race: { label: "Race", title: "Race", isRace: true }
    };
    const keysForWeekend = isSprint => isSprint
        ? ["fp1", "sq", "sprint", "qualifying", "race"]
        : ["fp1", "fp2", "fp3", "qualifying", "race"];
    function lapMilliseconds(value) {
        if (typeof value !== "string") return null;
        const parts = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!parts) return null;
        const [, hours, minutes, seconds, fraction = ""] = parts;
        if (Number(seconds) >= 60 || (hours !== undefined && Number(minutes) >= 60)) return null;
        return ((Number(hours || 0) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, "0"));
    }
    function intervalFor(results, index) {
        if (index === 0) return "Interval";
        const current = results[index], ahead = results[index - 1];
        if (!current || !ahead || (current.timingSegment || "") !== (ahead.timingSegment || "")) return "–";
        const time = lapMilliseconds(current.bestLap), aheadTime = lapMilliseconds(ahead.bestLap);
        if (time === null || aheadTime === null || time < aheadTime) return "–";
        return `+${((time - aheadTime) / 1000).toFixed(3)}`;
    }
    const defaultGapMode = sessionKey => definitions[sessionKey]?.isRace ? "interval" : "leader";
    const retiredStatus = result => result?.retired && !["0", "false"].includes(String(result.retired))
        ? (typeof result.retired === "string" && !["1", "true"].includes(result.retired) ? result.retired : "DNF") : null;
    function raceGap(result, leader) {
        if (!result || retiredStatus(result)) return null;
        const raw = String(result.time || "").trim().replace(/s$/, "");
        if (/^\+\d+(?:\.\d+)?$/.test(raw)) return Math.round(Number(raw.slice(1)) * 1000);
        if (raw.startsWith("+")) return lapMilliseconds(raw.slice(1));
        const elapsed = lapMilliseconds(raw), first = lapMilliseconds(leader?.time);
        return elapsed !== null && first !== null && elapsed >= first ? elapsed - first : null;
    }
    function resultGapFor(results, index, isRace, mode) {
        const current = results[index];
        if (!current) return "–";
        if (isRace) {
            const retired = retiredStatus(current);
            if (retired) return retired;
            if (index === 0) return current.time || (mode === "interval" ? "Interval" : "Leader");
            if (mode === "leader") return current.time || "–";
            const gap = raceGap(current, results[0]);
            const ahead = index === 1 ? 0 : raceGap(results[index - 1], results[0]);
            if (gap === null || ahead === null || gap < ahead) return /lap|DNF|DNS|DSQ|DQ|retir/i.test(current.time || "") ? current.time : "–";
            return `+${((gap - ahead) / 1000).toFixed(3)}`;
        }
        if (mode === "interval") return intervalFor(results, index);
        if (index === 0) return "Leader";
        const leader = results[0];
        if ((current.timingSegment || "") !== (leader.timingSegment || "")) return "–";
        const time = lapMilliseconds(current.bestLap), first = lapMilliseconds(leader.bestLap);
        return time === null || first === null || time < first ? "–" : `+${((time - first) / 1000).toFixed(3)}`;
    }
    function fastestLapOrder(results) {
        const time = result => {
            const milliseconds = lapMilliseconds(result.fastLap);
            return milliseconds !== null && milliseconds > 0 ? milliseconds : Infinity;
        };
        return [...results].sort((a, b) => time(a) - time(b));
    }
    function fastestLapGapFor(sorted, index, mode) {
        const current = lapMilliseconds(sorted[index]?.fastLap);
        if (current === null || current <= 0) return "–";
        if (index === 0) return mode === "leader" ? "Leader" : "Interval";
        const reference = lapMilliseconds(sorted[mode === "leader" ? 0 : index - 1]?.fastLap);
        return reference === null || reference <= 0 || current < reference ? "–" : `+${((current - reference) / 1000).toFixed(3)}`;
    }
    const utils = { definitions, keysForWeekend, lapMilliseconds, intervalFor, defaultGapMode, resultGapFor, fastestLapOrder, fastestLapGapFor };
    globalThis.F1SessionUtils = utils;
    if (typeof module !== "undefined" && module.exports) module.exports = utils;
})();
