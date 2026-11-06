import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
const escapeMarkdown=value=>String(value??'').replace(/[\\`*_{}\[\]<>#|]/g,'\\$&').replace(/[\r\n]+/g,' ');
export function inside(root,path){const base=resolve(root),target=resolve(base,path);if(!target.startsWith(base+sep))throw new Error('Output path must stay inside the recap repository');return target;}
export async function readJson(root,path){try{return JSON.parse(await readFile(inside(root,path),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw new Error(`Cannot read ${path}; review this saved file before continuing`);}}
export async function writeJson(root,path,value){const target=inside(root,path);await mkdir(dirname(target),{recursive:true});const temporary=target+'.tmp';await writeFile(temporary,JSON.stringify(value,null,2)+'\n');await rename(temporary,target);}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>!['retrievedAt','fetchedAt','updatedAt'].includes(key)).sort().map(key=>[key,stable(value[key])]));return value;}
export const factsHash=facts=>createHash('sha256').update(JSON.stringify(stable(facts))).digest('hex');
export async function saveFacts(root,facts){
    const hash=factsHash(facts),archive=`facts/${facts.week.id}/${facts.sport}-${hash.slice(0,16)}.json`;
    if(!await readJson(root,archive))await writeJson(root,archive,facts);
    await writeJson(root,`facts/${facts.week.id}/${facts.sport}.json`,facts);
    return{hash,path:archive};
}
export function makeDraft(facts,recap,evidence,generatedAt=new Date().toISOString()){
    const selected=new Set(recap.eventIds||[]),sourceIds=new Set(facts.events.filter(event=>selected.has(event.id)).flatMap(event=>[event.sourceId,event.snapshotSourceId,event.stats?.sourceId]).concat((facts.weeklyLeaders||[]).map(leader=>leader.sourceId)).filter(Boolean));
    return{schemaVersion:1,id:`${facts.week.id}-${facts.sport}`,sport:facts.sport,competition:facts.name,week:facts.week,status:'review_required',aiGenerated:true,reviewed:false,generatedAt,title:recap.title,paragraphs:recap.paragraphs,highlights:recap.highlights,eventIds:recap.eventIds,wordCount:recap.wordCount,model:recap.model,usage:recap.usage,coverage:facts.coverage,evidence:{path:evidence.path,sha256:evidence.hash},sources:facts.sources.filter(source=>sourceIds.has(source.id))};
}
export function markdownFor(draft){
    const sources=(draft.sources||[]).filter(source=>/^https:\/\//.test(source.url||'')).map(source=>`- [${escapeMarkdown(source.label||source.id)}](<${source.url.replace(/[<>\s]/g,c=>encodeURIComponent(c))}>)`).join('\n');
    return`# ${escapeMarkdown(draft.title)}\n\n> AI-generated draft · Human review required · ${draft.wordCount} words\n\n**${escapeMarkdown(draft.competition)} · ${escapeMarkdown(draft.week.label)}**\n\n${draft.paragraphs.map(escapeMarkdown).join('\n\n')}\n\n## Sources and evidence\n\n${sources||'No source links were recorded; this draft must not be published.'}\n\n[Exact facts used](../../${draft.evidence.path}) · Evidence SHA-256: \`${draft.evidence.sha256}\`\n\nReporting period: ${draft.week.start} (inclusive) to ${draft.week.end} (exclusive), displayed in ${draft.week.timeZone}.\n\nThis recap covers the recorded fixtures and performances only. It is not independent reporting and may omit events absent from the source data.\n`;
}
export async function saveDraft(root,draft){const stem=`drafts/${draft.week.id}/${draft.sport}`;await writeJson(root,stem+'.json',draft);await writeFile(inside(root,stem+'.md'),markdownFor(draft));}
