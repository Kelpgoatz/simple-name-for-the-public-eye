export const categories = ['disposals', 'handballs', 'kicks', 'goals', 'marks', 'tackles', 'clearances', 'hitouts'];
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);

export function normalizePlayerStats(payload, match) {
    const players = [];
    for (const side of ['home', 'away']) {
        const before = players.length;
        const entries = payload[`${side}TeamPlayerStats`];
        if (!Array.isArray(entries) || !entries.length) throw new Error('One team’s player statistics are unavailable');
        for (const entry of entries) {
            const record = entry.playerStats;
            const player = record?.player || entry.player?.player?.player;
            const stats = record?.stats;
            if (!player?.playerId || !stats) continue;
            const teamId = entry.teamId || record.teamId;
            if (teamId !== match[side].team.providerId) throw new Error('Player statistics do not match the fixture’s teams');
            const row = { id: player.playerId, name: [player.playerName?.givenName, player.playerName?.surname].filter(Boolean).join(' '), teamId, teamName: match[side].team.name };
            if (!row.name) continue;
            for (const stat of categories) row[stat] = numeric(stat === 'clearances' ? stats.clearances?.totalClearances : stats[stat]);
            players.push(row);
        }
        if (players.length === before) throw new Error('One team has no identifiable player statistics');
    }
    if (!players.length || new Set(players.map(player => player.id)).size !== players.length) throw new Error('Empty or duplicate player statistics');
    return players;
}

export function roundLeaders(matches) {
    const players = new Map();
    for (const match of matches) for (const player of match.players || []) {
        if (!players.has(player.id)) players.set(player.id, { id: player.id, name: player.name, teamName: player.teamName, ...Object.fromEntries(categories.map(stat => [stat, null])) });
        const total = players.get(player.id);
        for (const stat of categories) if (player[stat] != null) total[stat] = (total[stat] || 0) + player[stat];
    }
    return Object.fromEntries(categories.map(stat => [stat, [...players.values()].filter(player => player[stat] != null)
        .sort((a, b) => b[stat] - a[stat] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .slice(0, 6).map(player => ({ id: player.id, name: player.name, teamName: player.teamName, value: player[stat] }))]));
}
