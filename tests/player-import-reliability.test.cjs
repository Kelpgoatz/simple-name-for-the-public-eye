const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {pathToFileURL} = require('node:url');
const policy = import('../scripts/lib/boxscore-availability.mjs');

test('unpublished box scores have bounded retries and refresh immediately when a game finishes', async () => {
    const {HttpStatusError,isUnpublishedBoxScore,unavailableBoxScore,shouldRetryBoxScore} = await policy;
    const now = new Date('2026-11-06T00:00:00Z');
    const live = {status:'live'}, final = {status:'final'};
    const missing = unavailableBoxScore(final,now);
    assert.equal(missing.nextRetryAt,'2026-11-06T06:00:00.000Z');
    assert.equal(unavailableBoxScore(live,now).nextRetryAt,'2026-11-06T00:15:00.000Z');
    assert.equal(shouldRetryBoxScore(final,missing,new Date('2026-11-06T05:59:59Z')),false);
    assert.equal(shouldRetryBoxScore(final,missing,new Date('2026-11-06T06:00:00Z')),true);
    assert.equal(shouldRetryBoxScore(final,unavailableBoxScore(live,now),now),true);
    assert.equal(shouldRetryBoxScore(final,missing,now,true),true);
    assert.equal(isUnpublishedBoxScore(new HttpStatusError(404)),true);
    for (const error of [new HttpStatusError(401),new HttpStatusError(429),new HttpStatusError(500),new Error('Invalid event 404')]) {
        assert.equal(isUnpublishedBoxScore(error),false);
    }
});

test('player importer records 404 coverage, skips cooldown, recovers, and still fails for outages and invalid data', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),'cgrillo-player-import-'));
    t.after(() => fs.rm(directory,{recursive:true,force:true}));
    const scripts = path.join(directory,'scripts'), data = path.join(directory,'sports-data');
    await fs.mkdir(path.join(scripts,'lib'),{recursive:true});
    await fs.mkdir(data);
    for (const name of ['update-player-stats.mjs','lib/player-performance.mjs','lib/afl-player-stats.mjs','lib/boxscore-availability.mjs']) {
        await fs.copyFile(path.join(__dirname,'../scripts',name),path.join(scripts,name));
    }
    const fixture = {id:'1',status:'final',startTime:'2026-11-05T00:00:00Z',home:{id:'H',name:'Home'},away:{id:'A',name:'Away'}};
    await fs.writeFile(path.join(data,'wnba.json'),JSON.stringify({season:2026,groups:[{id:'round',matches:[fixture]}]}));
    const mock = path.join(directory,'mock.mjs');
    await fs.writeFile(mock,`
        import {appendFileSync} from 'node:fs';
        const status = Number(process.env.MOCK_STATUS);
        globalThis.fetch = async () => {
            appendFileSync(process.env.MOCK_CALLS,'request\\n');
            const payload = {header:{id:'1',season:{year:process.env.MOCK_INVALID ? 2025 : 2026}},boxscore:{players:['H','A'].map(id=>({team:{id},statistics:[{keys:['points'],athletes:[{athlete:{id,displayName:id},stats:['10']}]}]}))}};
            return new Response(JSON.stringify(payload),{status});
        };
    `);
    const callsFile = path.join(directory,'calls.txt');
    const run = (status,args=[],invalid=false) => spawnSync(process.execPath,['--import',pathToFileURL(mock).href,path.join(scripts,'update-player-stats.mjs'),'wnba',...args],{
        env:{...process.env,MOCK_STATUS:String(status),MOCK_CALLS:callsFile,MOCK_INVALID:invalid?'1':''},encoding:'utf8'
    });
    const read = async () => JSON.parse(await fs.readFile(path.join(data,'wnba-players.json'),'utf8'));
    const calls = async () => (await fs.readFile(callsFile,'utf8')).trim().split('\n').length;

    let result = run(404);
    assert.equal(result.status,0,result.stderr);
    let saved = await read();
    assert.equal(saved.coverage.complete,false);
    assert.deepEqual(saved.coverage.unavailableMatchIds,['1']);
    assert.deepEqual(saved.coverage.failedMatchIds,[]);
    assert.equal(saved.coverage.available,0);
    assert.deepEqual(saved.matches,{});
    assert.equal(await calls(),1,'a missing box score should not immediately be fetched three times');

    result = run(500);
    assert.equal(result.status,0,result.stderr);
    assert.equal(await calls(),1,'subsequent runs should respect the persisted retry time');
    assert.equal((await read()).coverage.complete,false);

    result = run(200,['--refresh-all']);
    assert.equal(result.status,0,result.stderr);
    saved = await read();
    assert.equal(saved.coverage.complete,true);
    assert.deepEqual(saved.coverage.unavailableMatchIds,[]);
    assert.deepEqual(saved.unavailableMatches,{});
    assert.equal(saved.matches['1'].players[0].stats.points,10);
    const successfulMatch = saved.matches['1'];

    const beforeOutage = await calls();
    result = run(500,['--refresh-all']);
    assert.equal(result.status,1,result.stderr);
    saved = await read();
    assert.deepEqual(saved.coverage.failedMatchIds,['1']);
    assert.deepEqual(saved.matches['1'],successfulMatch,'provider failures must retain the successful data');
    assert.equal(await calls(),beforeOutage+3);

    result = run(200,['--refresh-all'],true);
    assert.equal(result.status,1,result.stderr);
    saved = await read();
    assert.deepEqual(saved.coverage.failedMatchIds,['1']);
    assert.deepEqual(saved.matches['1'],successfulMatch,'wrong-season data must never overwrite saved performances');
});
