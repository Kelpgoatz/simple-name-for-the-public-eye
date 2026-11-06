export const DEFAULT_SOURCE_BASE_URL = 'https://raw.githubusercontent.com/Kelpgoatz/simple-name-for-the-public-eye/main/';
export const SPORTS = Object.freeze({afl:'AFL',aflw:'AFLW',f1:'Formula 1',f2:'Formula 2',f3:'Formula 3',nrl:'NRL',nrlw:'NRLW',nba:'NBA',wnba:'WNBA',nbl:'NBL',nfl:'NFL',tennis:'Tennis'});
const AFL_CATEGORIES = ['disposals','handballs','kicks','goals','marks','tackles','clearances','hitouts'].map(key=>({key,label:key[0].toUpperCase()+key.slice(1)}));
const MAIN_STATS = {afl:['goals','disposals','tackles'],aflw:['goals','disposals','tackles'],nrl:['tries','allRunMetres','tacklesMade'],nrlw:['tries','allRunMetres','tacklesMade'],nba:['points','rebounds','assists'],wnba:['points','rebounds','assists'],nbl:['points','rebounds','assists'],nfl:['passingYards','rushingYards','receivingYards']};
const clone = value => JSON.parse(JSON.stringify(value));
const text = value => typeof value==='string' && value.trim() ? value.trim() : null;
const finite = value => value!==null && value!==undefined && value!=='' && !(typeof value==='string'&&!value.trim()) && ['number','string'].includes(typeof value) && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;
const score = value => finite(value)&&Number(value)>=0 ? Number(value) : null;
const positiveInteger = value => Number.isInteger(number(value)) && number(value)>0 ? number(value) : null;
const list = value => Array.isArray(value) ? value : [];
const isObject = value => value!==null && typeof value==='object' && !Array.isArray(value);
const https = value => {try {const url=new URL(value);return url.protocol==='https:'?url.href:null;} catch {return null;}};

// A date-only value cannot establish which weekly window contains an event.
// Validate calendar components too: Date.parse silently accepts 30 February.
export function eventTime(value) {
    if(typeof value!=='string')return null;
    const raw=value.trim(),parts=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):?(\d{2}))$/i);
    if(!parts)return null;
    const [year,month,day,hour,minute,second]=parts.slice(1,7).map(part=>Number(part||0));
    if(month<1||month>12||day<1||hour>23||minute>59||second>59||Number(parts[10]||0)>23||Number(parts[11]||0)>59)return null;
    const calendar=new Date(Date.UTC(year,month-1,day));
    if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return null;
    const stamp=Date.parse(raw);
    return Number.isFinite(stamp)?new Date(stamp).toISOString():null;
}
const lapTime = value => {
    if(typeof value!=='string')return null;
    const match=value.trim().match(/^(\d{1,2}):([0-5]\d)\.(\d{3})$/);
    return match&&(Number(match[1])*60+Number(match[2])+Number(match[3])/1000)>0?value.trim():null;
};
const canonical = value => {
    const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/women'?s|womens/gi,'').replace(/[^a-z0-9]/g,'');
    return ({adelaide:'adelaidecrows',carlton:'carltonblues',collingwood:'collingwoodmagpies',essendon:'essendonbombers',fremantle:'fremantledockers',geelong:'geelongcats',goldcoast:'goldcoastsuns',greaterwesternsydney:'gwsgiants',gws:'gwsgiants',hawthorn:'hawthornhawks',melbourne:'melbournedemons',northmelbourne:'northmelbournekangaroos',portadelaide:'portadelaidepower',richmond:'richmondtigers',stkilda:'stkildasaints',sydney:'sydneyswans',westcoast:'westcoasteagles'})[key]||key;
};
const participant = value => {
    if(typeof value==='string')return text(value)?{id:canonical(value),name:value.trim()}:null;
    if(!isObject(value)||!text(value.name))return null;
    return {id:String(value.id??value.name),name:value.name.trim()};
};
const driverName = row => text(row?.name)||text([row?.driver?.name,row?.driver?.surname].filter(Boolean).join(' '));
const complete = (value,expected) => String(value||'').trim().toLowerCase()===expected;

function sourceRegistry(baseUrl,retrievedAt) {
    const sources=[],byUrl=new Map();
    function add(id,url,label,updatedAt) {
        const clean=https(url);
        if(!clean)return null;
        if(byUrl.has(clean))return byUrl.get(clean);
        const entry={id,url:clean,label};
        if(eventTime(retrievedAt))entry.retrievedAt=eventTime(retrievedAt);
        if(eventTime(updatedAt))entry.updatedAt=eventTime(updatedAt);
        sources.push(entry);byUrl.set(clean,id);return id;
    }
    return {sources,snapshot:(key,path,label,data)=>add(key,new URL(path,baseUrl).href,label,data?.updatedAt),
        primary:(url,label,fallback)=>https(url)?add(`primary-${sources.length+1}`,url,label):fallback};
}
function racingRows(raw,teams) {
    return list(raw).flatMap(row=>{
        const id=row?.driverId??row?.driver?.driverId,name=driverName(row);
        if(id==null||!name)return [];
        const result={driverId:String(id),name,position:positiveInteger(row.positionNumber??row.position),positionText:row.position==null?null:String(row.position),teamId:row.teamId==null?null:String(row.teamId),teamName:text(row.teamName)||teams.get(String(row.teamId))||null};
        for(const [key,value] of Object.entries({points:row.points,laps:row.lapsCompleted??row.laps,fastestLapNumber:row.bestLapNumber??row.fastestLapNumber}))if(finite(value))result[key]=Number(value);
        result.time=text(row.time);result.bestLap=lapTime(row.fastLap)||lapTime(row.bestLap);
        result.status=text(row.retired)||text(row.status)||(!result.position?result.positionText:null);
        result.grid=positiveInteger(row.grid)||(/^pit[ -]?lane$/i.test(String(row.grid||''))?'Pit lane':null);
        for(const phase of ['q1','q2','q3'])if(lapTime(row[phase]))result[phase]=lapTime(row[phase]);
        return [result];
    }).sort((a,b)=>(a.position??Infinity)-(b.position??Infinity));
}
function recordedFastest(raw,results) {
    if(!isObject(raw)||!lapTime(raw.time))return null;
    const driver=results.find(row=>String(row.driverId)===String(raw.driverId));
    if(!driver)return null;
    const fastest={driverId:driver.driverId,name:driver.name,time:lapTime(raw.time)};
    if(driver.teamId)fastest.teamId=driver.teamId;
    if(driver.teamName)fastest.teamName=driver.teamName;
    if(positiveInteger(raw.lap))fastest.lap=Number(raw.lap);
    return fastest;
}
function sessionKind(key,label='') {
    const value=`${key} ${label}`.toLowerCase();
    if(/sprint.*qual|sprint.*shoot|\bsq\b/.test(value))return 'sprint_qualifying';
    if(/qual/.test(value))return 'qualifying';
    if(/practice|\bfp[123]\b|\bp[123]\b/.test(value))return 'practice';
    if(/sprint/.test(value))return 'sprint';
    return /race|feature/.test(value)?'race':'session';
}
function addStandings(pack,data,sourceId,start,end) {
    const asOf=eventTime(data?.standingsUpdatedAt);
    if(!asOf||Date.parse(asOf)<start||Date.parse(asOf)>=end)return;
    const groups=list(data.standings).flatMap(group=>{
        const rows=list(group.rows).flatMap(row=>{
            const team=participant(row.team);if(!team)return [];
            const result={rank:positiveInteger(row.rank),team};
            for(const key of ['played','wins','losses','draws','points','percentage','winPct','gamesBehind','difference'])if(finite(row[key]))result[key]=Number(row[key]);
            return [result];
        }).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity));
        return rows.length?[{id:String(group.id??group.label),label:text(group.label)||'Standings',rows:rows.slice(0,8),totalRows:rows.length,showingTop:Math.min(8,rows.length)}]:[];
    });
    if(groups.length)pack.standings={asOf,sourceId,season:data.season??null,groups,note:'Published table at this timestamp; no weekly table movement is inferred.'};
}

/** Normalize immutable saved snapshots. This function performs no I/O or network requests. */
export function buildFacts(sport,snapshots,window,options={}) {
    if(!Object.hasOwn(SPORTS,sport))throw new TypeError(`Unsupported sport: ${sport}`);
    const startTime=eventTime(window?.start),endTime=eventTime(window?.end);
    if(!startTime||!endTime||Date.parse(startTime)>=Date.parse(endTime))throw new TypeError('A weekly window requires valid inclusive start and exclusive end timestamps');
    const start=Date.parse(startTime),end=Date.parse(endTime);
    const maxEvents=options.maxEvents??200;
    if(!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>2000)throw new TypeError('maxEvents must be an integer from 1 to 2000');
    const base=https(options.sourceBaseUrl||DEFAULT_SOURCE_BASE_URL);
    if(!base)throw new TypeError('sourceBaseUrl must be an HTTPS URL');
    const registry=sourceRegistry(base.endsWith('/')?base:`${base}/`,options.retrievedAt);
    const input=isObject(snapshots)?snapshots:{};
    const coverage={status:'no_events',totalEvents:0,includedEvents:0,truncated:false,omittedEvents:0,excludedUnfinished:0,completedWithoutTime:0,incompleteEvents:0,duplicateEvents:0,conflictingEventIds:[],missingSources:[],statistics:{status:'not_applicable',eventsWithStats:0,eventsWithoutStats:0},notes:[]};
    const pack={schemaVersion:1,sport,name:SPORTS[sport],week:clone(window),coverage,sources:registry.sources,events:[]};
    const candidates=[],rawMatches=new Map();let primaryAvailable=false;
    function acceptTime(raw,finished,dateHint) {
        const time=eventTime(raw);
        if(!time){
            if(finished){
                // An old calendar date can rule an unrelated event out. These
                // deliberately broad bounds never supply an event timestamp.
                const hints=(Array.isArray(dateHint)?dateHint:[dateHint||raw]).filter(value=>value!=null);
                const dates=hints.map(value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))?eventTime(`${value}T00:00:00Z`):null);
                const outside=dates.length&&dates.every(Boolean)&&(Math.max(...dates.map(Date.parse))+48*3600000<=start||Math.min(...dates.map(Date.parse))-24*3600000>=end);
                if(!outside)coverage.completedWithoutTime++;
            }
            return null;
        }
        if(Date.parse(time)<start||Date.parse(time)>=end)return null;
        if(!finished){coverage.excludedUnfinished++;return null;}
        return time;
    }
    function raceEvent(race,session,key,sourceId,teams) {
        const finished=complete(session.status,'concluded')||complete(session.state,'completed');
        const time=acceptTime(session.startTime,finished,session.date||(['f2','f3'].includes(sport)?[race.startDate,race.endDate]:null));if(!time)return;
        const results=racingRows(session.results,teams);
        if(!results.length){coverage.incompleteEvents++;return;}
        if(results.length!==list(session.results).length){coverage.incompleteEvents++;coverage.notes.push(`Some classified identities are missing for ${race.raceId??race.id} ${session.label||key}.`);}
        const kind=sessionKind(key,session.label||session.type),raceId=String(race.raceId??race.id);
        const event={id:`${sport}:${raceId}:${key}`,startTime:time,kind,label:[race.name||race.officialName||raceId,session.label||key].join(' · '),raceId,round:positiveInteger(race.round),results,sourceId:registry.primary(session.source||session.timingSource||race.url,`${SPORTS[sport]} ${session.label||key} classification`,sourceId),snapshotSourceId:sourceId};
        const first=results.find(row=>row.position===1);
        if(first)event[['race','sprint'].includes(kind)?'winner':'leader']={id:first.driverId,name:first.name,teamId:first.teamId,teamName:first.teamName};
        const fastest=recordedFastest(session.fastestLap,results);if(fastest)event.fastestLap=fastest;
        candidates.push(event);
    }
    if(sport==='f1') {
        const fixture=input.f1Fixtures,sessions=input.f1Sessions;
        const validFixtures=isObject(fixture)&&Array.isArray(fixture.races),validSessions=isObject(sessions)&&isObject(sessions.races)&&(!validFixtures||Number(sessions.season)===Number(fixture.season));
        primaryAvailable=validFixtures&&validSessions;
        if(!validFixtures)coverage.missingSources.push('f1Fixtures');
        if(!validSessions)coverage.missingSources.push('f1Sessions');
        const matchingConstructors=Number(input.f1Constructors?.season)===Number(fixture?.season??sessions?.season)?input.f1Constructors:null;
        const teams=new Map(list(matchingConstructors?.constructors_championship).map(row=>[String(row.teamId),text(row.team?.teamName)]));
        if(matchingConstructors)registry.snapshot('f1Constructors','constructors-championship.json','Formula 1 constructor identities',matchingConstructors);
        const fixtureSource=validFixtures?registry.snapshot('f1Fixtures','f1-fixtures.json','cgrillo Formula 1 calendar and race results',fixture):null;
        const sessionSource=validSessions?registry.snapshot('f1Sessions','f1-sessions.json','cgrillo Formula 1 session results',sessions):null;
        for(const race of validFixtures?fixture.races:[]) {
            raceEvent(race,{...race,label:'Race',source:race.resultsSource},'race',fixtureSource,teams);
        }
        if(validSessions)for(const [id,weekend] of Object.entries(sessions.races)) {
            const race=validFixtures?fixture.races.find(item=>String(item.raceId)===id):null;
            for(const [key,session] of Object.entries(weekend?.sessions||{}))if(key!=='race')raceEvent(race||{raceId:id,name:id},session,key,sessionSource,teams);
        }
    } else if(['f2','f3'].includes(sport)) {
        const data=input[sport];primaryAvailable=isObject(data)&&Array.isArray(data.races);
        if(!primaryAvailable)coverage.missingSources.push(sport);
        else {
            const source=registry.snapshot(sport,`${sport}-data.json`,`${SPORTS[sport]} saved results`,data),teams=new Map(list(data.teams).map(row=>[String(row.id),text(row.name)]));
            for(const race of data.races)for(const [index,session] of list(race.sessions).entries())raceEvent(race,session,String(session.id||`${session.type||session.label||'session'}-${index}`),source,teams);
        }
    } else {
        const afl=sport==='afl',data=afl?input.aflFixtures:input.generic;
        primaryAvailable=afl?Array.isArray(data):isObject(data)&&data.sport===sport&&Array.isArray(data.groups);
        if(!primaryAvailable)coverage.missingSources.push(afl?'aflFixtures':'generic');
        else {
            const source=registry.snapshot(afl?'aflFixtures':'generic',afl?'afl-fixtures.json':`sports-data/${sport}.json`,`${SPORTS[sport]} saved fixtures and results`,data);
            const groups=afl?data:data.groups;
            for(const group of groups)for(const raw of list(group?.matches)) {
                const finished=complete(raw.status,afl?'concluded':'final'),time=acceptTime(raw.startTime,finished,raw.date);if(!time)continue;
                const home=participant(afl?raw.homeTeam:raw.home),away=participant(afl?raw.awayTeam:raw.away),id=raw.matchId??raw.id;
                if(!home||!away||id==null){coverage.incompleteEvents++;continue;}
                const event={id:`${sport}:${id}`,startTime:time,kind:'match',label:`${home.name} v ${away.name}`,home,away,scores:{home:score(raw.homeScore),away:score(raw.awayScore),unit:sport==='tennis'?'sets':'points'},sourceId:registry.primary(raw.url,`${SPORTS[sport]} published match result`,source),snapshotSourceId:source};
                event.round=text(raw.roundLabel)||text(group.label)||(group.round!=null?`Round ${group.round}`:null);
                if(raw.venue)event.venue=String(raw.venue);
                if(raw.statusDetail)event.statusDetail=String(raw.statusDetail);
                if(raw.tour)event.tour=String(raw.tour);
                if(Array.isArray(raw.sets))event.sets=raw.sets.map(set=>{const result={home:score(set.home),away:score(set.away)};for(const key of ['homeTiebreak','awayTiebreak'])if(score(set[key])!==null)result[key]=Number(set[key]);return result;});
                const scored=event.scores.home!==null&&event.scores.away!==null,published=['home','away'].includes(raw.winner)?raw.winner:null;
                const inferred=scored&&event.scores.home!==event.scores.away?(event.scores.home>event.scores.away?'home':'away'):null;
                if(published&&inferred&&published!==inferred&&sport!=='tennis'){
                    coverage.incompleteEvents++;event.resultNote='Published winner and scores disagree; no winner is stated.';
                } else {
                    const side=published||inferred;
                    if(side)event.winner={side,...event[side]};
                    else if(scored&&sport!=='tennis')event.result='draw';
                }
                if(!scored){coverage.incompleteEvents++;event.resultNote='A completed result was published without both scores.';}
                candidates.push(event);rawMatches.set(event.id,{raw,season:afl?new Date(time).getUTCFullYear():data.season});
            }
            if(!afl)addStandings(pack,data,source,start,end);
        }
    }
    const unique=new Map(),conflicts=new Set();
    for(const event of candidates) {
        const core=JSON.stringify({startTime:event.startTime,kind:event.kind,home:event.home,away:event.away,scores:event.scores,winner:event.winner,results:event.results});
        if(unique.has(event.id)) {
            coverage.duplicateEvents++;
            if(unique.get(event.id).core!==core){conflicts.add(event.id);unique.delete(event.id);}
        } else if(!conflicts.has(event.id))unique.set(event.id,{event,core});
    }
    coverage.conflictingEventIds=[...conflicts];
    const allEvents=[...unique.values()].map(item=>item.event).sort((a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime)||a.id.localeCompare(b.id));
    coverage.totalEvents=allEvents.length;coverage.omittedEvents=Math.max(0,allEvents.length-maxEvents);coverage.truncated=coverage.omittedEvents>0;
    pack.events=allEvents.slice(0,maxEvents);coverage.includedEvents=pack.events.length;
    if(!['f1','f2','f3','tennis'].includes(sport))attachStatistics(pack,allEvents,rawMatches,input,sport,registry);
    if(coverage.truncated){coverage.status='unavailable';coverage.reason='event_limit_exceeded';coverage.notes.push(`The week contains ${allEvents.length} completed events; increase maxEvents before generating a recap.`);}
    else if(allEvents.length)coverage.status='ready';
    else if(!primaryAvailable||coverage.completedWithoutTime||coverage.incompleteEvents||conflicts.size){coverage.status='unavailable';coverage.reason='insufficient_completed_results';}
    else coverage.status='no_events';
    coverage.partial=Boolean(coverage.missingSources.length||coverage.completedWithoutTime||coverage.incompleteEvents||conflicts.size||coverage.truncated);
    if(coverage.completedWithoutTime)coverage.notes.push(`${coverage.completedWithoutTime} completed source entries could belong to this week but had no valid timed start; they were excluded rather than assigned an assumed time.`);
    if(coverage.missingSources.length)coverage.notes.push('One or more fixture or session sources were unavailable; an empty set is not proof that no event happened.');
    return pack;
}

function attachStatistics(pack,events,rawMatches,input,sport,registry) {
    const snapshot=sport==='afl'?input.aflPlayerStats||input.players:input.players;
    const status=pack.coverage.statistics;
    if(!events.length){status.status='no_events';return;}
    if(!isObject(snapshot)||!isObject(snapshot.matches)||snapshot.sport&&snapshot.sport!==sport){status.status='unavailable';status.eventsWithoutStats=events.length;return;}
    const categories=list(snapshot.categories).length?list(snapshot.categories).filter(row=>text(row?.key)&&text(row?.label)).slice(0,32):sport==='afl'?AFL_CATEGORIES:[];
    const sourceId=registry.snapshot(sport==='afl'?'aflPlayerStats':'players',`sports-data/${sport}-players.json`,`${SPORTS[sport]} saved individual match statistics`,snapshot);
    const accumulated=new Map(categories.map(category=>[category.key,new Map()]));
    for(const event of events) {
        const context=rawMatches.get(event.id),id=String(context?.raw.matchId??context?.raw.id),record=snapshot.matches[id];
        const correctSeason=snapshot.season!=null&&context?.season!=null&&Number(snapshot.season)===Number(context.season);
        const completed=complete(record?.status,'final')||(sport==='afl'&&complete(record?.status,'concluded'));
        const participants=[event.home,event.away],seen=new Set();
        const players=correctSeason&&completed&&(!record.id||String(record.id)===id)?list(record.players).flatMap(raw=>{
            if(raw?.id==null||!text(raw.name)||seen.has(String(raw.id)))return [];
            const exact=participants.find(team=>String(raw.teamId)===team.id);
            const team=exact||((raw.teamId==null||sport==='afl')?participants.find(team=>canonical(raw.teamName)===canonical(team.name)||canonical(raw.teamId)===canonical(team.id)):null);
            if(!team)return [];
            const values=Object.fromEntries(categories.filter(category=>finite((raw.stats||raw)[category.key])).map(category=>[category.key,Number((raw.stats||raw)[category.key])]));
            if(!Object.keys(values).length)return [];
            seen.add(String(raw.id));return [{id:String(raw.id),name:raw.name.trim(),teamId:team.id,team:team.name,values}];
        }):[];
        if(!players.length){status.eventsWithoutStats++;continue;}
        status.eventsWithStats++;
        const recordSource=registry.primary(record.source,`${SPORTS[sport]} individual match statistics`,sourceId);
        const relevant=MAIN_STATS[sport]||categories.slice(0,3).map(row=>row.key);
        const leaders=categories.filter(category=>relevant.includes(category.key)).flatMap(category=>{
            const ranked=players.filter(player=>finite(player.values[category.key])&&player.values[category.key]>0).sort((a,b)=>b.values[category.key]-a.values[category.key]||a.name.localeCompare(b.name));
            if(!ranked.length)return [];
            const value=ranked[0].values[category.key],tied=ranked.filter(player=>player.values[category.key]===value);
            return [{key:category.key,label:category.label,value,tiedPlayers:tied.length,players:tied.slice(0,2).map(({values,...player})=>player)}];
        });
        event.stats={sourceId:recordSource,playersRecorded:players.length,leaders};
        for(const category of categories)for(const player of players) {
            if(!finite(player.values[category.key]))continue;
            const key=`${player.id}\0${player.teamId}`,board=accumulated.get(category.key);
            if(!board.has(key))board.set(key,{id:player.id,name:player.name,teamId:player.teamId,team:player.team,total:0,gamesWithStatistic:0});
            const row=board.get(key);row.total+=player.values[category.key];row.gamesWithStatistic++;
        }
    }
    status.status=status.eventsWithStats===events.length?'available':status.eventsWithStats?'partial':'unavailable';
    pack.weeklyLeaders=categories.flatMap(category=>{
        const rows=[...accumulated.get(category.key).values()].filter(row=>row.total>0).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
        return rows.length?[{key:category.key,label:category.label,sourceId,leaders:rows.slice(0,3).map(row=>({...row,average:Number((row.total/row.gamesWithStatistic).toFixed(3))})),scope:'Totals from recorded completed matches in this weekly window only. Averages divide by games with this statistic recorded.'}]:[];
    });
}
