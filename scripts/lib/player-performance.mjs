import {normalizePlayerStats as normalizeAfl, categories as aflKeys} from './afl-player-stats.mjs';

const titles = {
    disposals:'Disposals', handballs:'Handballs', kicks:'Kicks', goals:'Goals', marks:'Marks', tackles:'Tackles', clearances:'Clearances', hitouts:'Hitouts',
    points:'Points', rebounds:'Rebounds', assists:'Assists', steals:'Steals', blocks:'Blocks', threePointFieldGoalsMade:'Three-pointers', offensiveRebounds:'Offensive rebounds', defensiveRebounds:'Defensive rebounds',
    passingYards:'Passing yards', passingTouchdowns:'Passing touchdowns', rushingYards:'Rushing yards', rushingTouchdowns:'Rushing touchdowns', receivingYards:'Receiving yards', receptions:'Receptions', totalTackles:'Tackles', sacks:'Sacks',
    allRunMetres:'Run metres', tries:'Tries', tryAssists:'Try assists', tacklesMade:'Tackles', tackleBreaks:'Tackle breaks', lineBreaks:'Line breaks', offloads:'Offloads'
};
const basketball = ['points','rebounds','assists','steals','blocks','threePointFieldGoalsMade','offensiveRebounds','defensiveRebounds'];
export function categories(sport) {
    const keys = ['afl','aflw'].includes(sport) ? aflKeys : ['nba','wnba','nbl'].includes(sport) ? basketball : sport === 'nfl'
        ? ['passingYards','passingTouchdowns','rushingYards','rushingTouchdowns','receivingYards','receptions','totalTackles','sacks']
        : ['points','tries','allRunMetres','tryAssists','tacklesMade','tackleBreaks','lineBreaks','offloads'];
    return keys.map(key => ({key,label:titles[key]}));
}
const numeric = value => value == null || String(value).trim() === '' || !/^[-+]?\d+(?:\.\d+)?$/.test(String(value).trim()) ? null : Number(value);
const statsFor = (sport, values) => Object.fromEntries(categories(sport).map(({key}) => [key,numeric(values[key])]));

export function normalizeEspnPlayers(payload, match, sport, season) {
    if (String(payload.header?.id) !== String(match.id) || Number(payload.header?.season?.year) !== Number(season)) throw new Error('Box score event or season does not match fixture');
    const expected = new Map([match.home,match.away].map(team => [String(team.id),team]));
    const rows = new Map();
    const seenTeams = new Set();
    for (const side of payload.boxscore?.players || []) {
        const teamId = String(side.team?.id);
        const team = expected.get(teamId);
        if (!team) throw new Error('Box score teams do not match fixture');
        for (const section of side.statistics || []) {
            const keys = section.keys || [];
            for (const entry of section.athletes || []) {
                if (entry.didNotPlay || !entry.athlete?.id || !entry.athlete.displayName || !Array.isArray(entry.stats) || !entry.stats.length) continue;
                const values = {};
                keys.forEach((key,index) => {
                    const raw = entry.stats[index];
                    if (key === 'threePointFieldGoalsMade-threePointFieldGoalsAttempted' && typeof raw === 'string' && /^\d+-\d+$/.test(raw)) values.threePointFieldGoalsMade = raw.split('-')[0];
                    else values[key] = raw;
                });
                const stats = statsFor(sport,values);
                if (!Object.values(stats).some(value => value != null)) continue;
                const id = String(entry.athlete.id), key = `${teamId}:${id}`;
                if (!rows.has(key)) rows.set(key,{id,name:entry.athlete.displayName,teamId,teamName:team.name,stats:statsFor(sport,{})});
                const record = rows.get(key);
                for (const [stat,value] of Object.entries(stats)) if (value != null) record.stats[stat] = value;
                seenTeams.add(teamId);
            }
        }
    }
    if (seenTeams.size !== 2 || !rows.size) throw new Error('Individual box score not available for both teams');
    return [...rows.values()];
}

export function normalizeAflPlayers(payload, rawMatch, sport = 'aflw') {
    const rows = normalizeAfl(payload,rawMatch);
    const teams = new Map(['home','away'].map(side => [rawMatch[side].team.providerId,rawMatch[side].team]));
    return rows.map(row => ({id:String(row.id),name:row.name,teamId:String(teams.get(row.teamId).id),teamName:row.teamName,stats:statsFor(sport,row)}));
}

export function parseNrlMatch(html) {
    const tag = html.match(/<[^>]+\bid="vue-match-centre"[^>]*>/)?.[0];
    const encoded = tag?.match(/\bq-data="([^"]+)"/)?.[1];
    if (!encoded) throw new Error('NRL match statistics not published');
    const json = encoded.replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
    return JSON.parse(json).match;
}

export function normalizeNrlPlayers(payload, match, sport) {
    const rows = [];
    for (const side of ['home','away']) {
        const team = payload[`${side}Team`];
        if (String(team?.teamId) !== String(match[side]?.id)) throw new Error('NRL player teams do not match fixture');
        const identities = new Map((team.players || []).map(player => [String(player.playerId),player]));
        const entries = payload.stats?.players?.[`${side}Team`];
        let count = 0;
        for (const entry of entries || []) {
            const player = identities.get(String(entry.playerId));
            const name = [player?.firstName,player?.lastName].filter(Boolean).join(' ');
            if (!name || numeric(entry.minutesPlayed) === 0) continue;
            const stats = statsFor(sport,entry);
            if (!Object.values(stats).some(value => value != null)) continue;
            rows.push({id:String(entry.playerId),name,teamId:String(team.teamId),teamName:match[side].name,stats});
            count++;
        }
        if (!count) throw new Error('NRL individual statistics unavailable for one team');
    }
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate NRL player statistics');
    return rows;
}
