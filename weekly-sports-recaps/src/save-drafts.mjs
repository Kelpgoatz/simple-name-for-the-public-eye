import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const safe=output=>String(output).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g,'$1***@').replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g,'***');
function git(cwd,args,allowFailure=false){const result=spawnSync('git',args,{cwd,encoding:'utf8'});if(result.error)throw new Error(`Git ${args[0]} could not start`);const output=safe((result.stdout||'')+(result.stderr||''));if(result.status&&!allowFailure)throw new Error(`Git ${args[0]} failed: ${output}`);return{status:result.status,output};}
export const isPushRace=output=>/\[rejected\].*\((?:fetch first|non-fast-forward)\)|cannot lock ref .*is at [a-f0-9]+ but expected [a-f0-9]+/i.test(output);
export async function saveDrafts({cwd=ROOT,branch=process.env.GITHUB_REF_NAME||'main',attempts=5}={}){
    if(resolve(git(cwd,['rev-parse','--show-toplevel']).output.trim())!==resolve(cwd))throw new Error('The recap project must be its own Git checkout before archiving; the parent website is not modified');
    git(cwd,['check-ref-format','--branch',branch]);
    if(git(cwd,['diff','--cached','--quiet'],true).status!==0)throw new Error('Unrelated changes are already staged; refusing to archive them');
    const paths=['facts','drafts','public','reports'].filter(path=>existsSync(resolve(cwd,path)));
    if(!paths.length)return false;
    git(cwd,['add','--',...paths]);if(git(cwd,['diff','--cached','--quiet'],true).status===0)return false;
    git(cwd,['config','user.name','github-actions[bot]']);git(cwd,['config','user.email','github-actions[bot]@users.noreply.github.com']);
    git(cwd,['commit','-m','Archive weekly sports recap drafts for review']);
    for(let attempt=1;attempt<=attempts;attempt++){
        git(cwd,['fetch','--no-tags','origin',branch]);git(cwd,['rebase','FETCH_HEAD']);
        const push=git(cwd,['push','origin',`HEAD:refs/heads/${branch}`],true);
        if(!push.status){console.log('Weekly drafts archived for review.');return true;}
        if(!isPushRace(push.output)||attempt===attempts)throw new Error(`Draft archive push failed: ${push.output}`);
        await new Promise(resolveDelay=>setTimeout(resolveDelay,attempt*1000));
    }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{await saveDrafts();}catch(error){console.error(error.message);process.exitCode=1;}}
