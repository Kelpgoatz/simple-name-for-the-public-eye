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
    const utils = { definitions, keysForWeekend, lapMilliseconds, intervalFor };
    globalThis.F1SessionUtils = utils;
    if (typeof module !== "undefined" && module.exports) module.exports = utils;
})();
