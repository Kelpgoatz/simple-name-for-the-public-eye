import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {reportingWindow} from './window.mjs';
import {collectSport,SPORTS} from './collect.mjs';
import {generateRecap,countWords} from './ai.mjs';
import {readJson,writeJson,saveFacts,makeDraft,saveDraft,factsHash} from './store.mjs';

export const PROJECT_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function parseArgs(args){
    args=[...args];
    const options={command:args[0]&&!args[0].startsWith('--')?args.shift():'run'};
    for(let index=0;index<args.length;index++){
        const flag=args[index];if(['--dry-run','--force','--help'].includes(flag)){options[flag.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=true;continue;}
        if(!['--week-ending','--sports','--source-dir'].includes(flag)||!args[index+1]||args[index+1].startsWith('--'))throw new Error(`Unknown or incomplete option: ${flag}`);
        options[flag.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=args[++index];
    }
    if(!['run','collect','generate'].includes(options.command))throw new Error('Choose collect, generate or run');
    return options;
}
export async function run(options={},dependencies={}){
    const root=dependencies.root||PROJECT_ROOT,config=dependencies.config||JSON.parse(await readFile(resolve(root,'recaps.config.json'),'utf8'));
    const window=reportingWindow({now:dependencies.now??Date.now(),weekEnding:options.weekEnding,timeZone:config.timeZone,hour:config.weekEndingHour});
    const sports=[...new Set(options.sports?options.sports.split(',').map(sport=>sport.trim()).filter(Boolean):config.sports)];
    if(!sports.length||sports.some(sport=>!SPORTS.includes(sport)))throw new Error('Choose competition IDs from recaps.config.json');
    const command=options.command||'run',dry=Boolean(options.dryRun||command==='collect');
    const apiKey=dependencies.apiKey??process.env.OPENAI_API_KEY,model=dependencies.model||process.env.OPENAI_MODEL||config.model;
    const log=dependencies.log||console.log,collect=dependencies.collect||collectSport,generate=dependencies.generate||generateRecap;
    const report={schemaVersion:1,week:window,createdAt:new Date().toISOString(),mode:dry?'facts_only':'drafts',reviewRequired:true,items:[],failures:0,warnings:0};
    const existingIndex=await readJson(root,'public/recaps.json')||{schemaVersion:1,recaps:[]};
    const recaps=new Map((existingIndex.recaps||[]).map(recap=>[recap.id,recap]));
    for(const sport of sports){
        const draftPath=`drafts/${window.id}/${sport}.json`;let existing;
        try{existing=await readJson(root,draftPath);}catch{report.failures++;report.items.push({sport,status:'review_saved_file',reason:'A saved draft could not be read; review it before regenerating.'});log(`${sport}: review the saved draft; no AI request`);continue;}
        if(!dry&&existing&&!options.force){
            if(!Array.isArray(existing.paragraphs)||existing.paragraphs.some(paragraph=>typeof paragraph!=='string')||!existing.reviewed&&(countWords(existing.paragraphs.join('\n\n'))<450||countWords(existing.paragraphs.join('\n\n'))>550)){report.failures++;report.items.push({sport,status:'review_saved_file',reason:'Review the saved draft before regenerating with --force.'});log(`${sport}: saved draft needs review; no AI request`);continue;}
            recaps.set(existing.id,existing);report.items.push({sport,status:'kept_existing',wordCount:existing.wordCount});log(`${sport}: existing draft kept; no AI request`);continue;
        }
        let facts;
        try{
            facts=command==='generate'?await readJson(root,`facts/${window.id}/${sport}.json`):await collect(sport,window,{config,sourceDir:options.sourceDir,fetchImpl:dependencies.fetchImpl});
            if(!facts||facts.sport!==sport||facts.week?.id!==window.id)throw new Error('Collect this reporting week first');
        }catch{if(config.optionalSports?.includes(sport))report.warnings++;else report.failures++;report.items.push({sport,status:'unavailable',reason:'The weekly facts could not be collected or read.'});log(`${sport}: facts unavailable`);continue;}
        const evidence=await saveFacts(root,facts);
        if(facts.coverage.status!=='ready'){
            const status=facts.coverage.status==='no_events'?'no_events':'unavailable';if(status==='unavailable'){if(config.optionalSports?.includes(sport))report.warnings++;else report.failures++;}
            const item={id:`${window.id}-${sport}`,sport,competition:facts.name,week:window,status,aiGenerated:false,reviewed:false,title:status==='no_events'?'No completed events recorded this week':'Weekly results unavailable',paragraphs:[status==='no_events'?'No completed fixtures or sessions were recorded in the source data for this reporting period. No AI story was generated.':'The source data could not provide a complete enough set of results for this reporting period. No AI story was generated.'],wordCount:0,coverage:facts.coverage,evidence:{path:evidence.path,sha256:evidence.hash},sources:facts.sources};
            if(!dry)recaps.set(item.id,item);report.items.push({sport,status,events:facts.events.length});log(`${sport}: ${status}; no AI request`);continue;
        }
        if(dry){report.items.push({sport,status:'facts_ready',events:facts.events.length,factsHash:evidence.hash});log(`${sport}: ${facts.events.length} completed events ready; no AI request`);continue;}
        if(!apiKey){report.failures++;report.items.push({sport,status:'configuration_required',reason:'Set OPENAI_API_KEY in GitHub Secrets or the local environment.'});log(`${sport}: API key required; no AI request`);continue;}
        try{
            const recap=await generate(facts,{apiKey,model,fetchImpl:dependencies.fetchImpl}),draft=makeDraft(facts,recap,evidence);
            await saveDraft(root,draft);recaps.set(draft.id,draft);report.items.push({sport,status:'review_required',wordCount:draft.wordCount,events:facts.events.length});log(`${sport}: ${draft.wordCount}-word draft saved for review`);
        }catch(error){report.failures++;report.items.push({sport,status:'generation_failed',reason:error.code||'generation_failed',factsHash:factsHash(facts)});log(`${sport}: AI generation unavailable; facts retained for review`);}
    }
    if(!dry)await writeJson(root,'public/recaps.json',{schemaVersion:1,updatedAt:new Date().toISOString(),reviewRequired:true,recaps:[...recaps.values()].sort((a,b)=>b.week.id.localeCompare(a.week.id)||a.sport.localeCompare(b.sport))});
    await writeJson(root,`reports/${window.id}.json`,report);
    log(`${window.label}: ${report.items.length} competitions processed, ${report.failures} errors, ${report.warnings} optional source warnings.`);
    return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    try{
        const options=parseArgs(process.argv.slice(2));
        if(options.help)console.log('Usage: node src/cli.mjs [collect|generate|run] [--dry-run] [--sports afl,f1] [--source-dir PATH] [--week-ending YYYY-MM-DD] [--force]\nWeeks end at 6 pm Sydney time; the default is the most recent completed Monday. Generated stories remain drafts for human review.');
        else{const report=await run(options);if(report.failures)process.exitCode=1;}
    }catch(error){console.error(error.message);process.exitCode=1;}
}
