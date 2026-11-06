import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function git(cwd, args, { allowFailure = false, quiet = false } = {}) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    const output = [result.stdout, result.stderr].filter(Boolean).join('');
    if (!quiet && output) console.log(output.trimEnd());
    if (result.error) throw result.error;
    if (result.status !== 0 && !allowFailure) throw new Error(`git ${args[0]} failed (${result.status}): ${output.trim()}`);
    return { status: result.status, output };
}

// Retry only an advancing remote branch. Permission errors and rejected policies
// need attention; retrying those would only conceal the actual failure.
export function isPushRace(output) {
    return /\[rejected\].*\((?:fetch first|non-fast-forward)\)/i.test(output)
        || /cannot lock ref ['"]refs\/heads\/[^'"\r\n]+['"]: is at [0-9a-f]+ but expected [0-9a-f]+/i.test(output);
}

export async function saveData({ cwd = process.cwd(), message, paths, branch = 'main', remote = 'origin', attempts = 5, retryDelayMs = 1000, beforePush } = {}) {
    if (!message || !Array.isArray(paths) || !paths.length) throw new Error('Provide a commit message and output paths');
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 10) throw new Error('Invalid push attempt limit');
    git(cwd, ['check-ref-format', '--branch', branch], { quiet: true });
    if (git(cwd, ['diff', '--cached', '--quiet'], { allowFailure: true, quiet: true }).status !== 0) {
        throw new Error('The index already contains changes; refusing to include unrelated staged files');
    }
    git(cwd, ['add', '--', ...paths]);
    if (git(cwd, ['diff', '--cached', '--quiet'], { allowFailure: true, quiet: true }).status === 0) {
        console.log('No data changes to save.');
        return { changed: false, attempts: 0 };
    }
    git(cwd, ['config', 'user.name', 'github-actions[bot]']);
    git(cwd, ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
    git(cwd, ['commit', '-m', message]);
    for (let attempt = 1; attempt <= attempts; attempt++) {
        git(cwd, ['fetch', '--no-tags', remote, branch]);
        // A real content conflict stops here. Never force-push or pick a side.
        git(cwd, ['rebase', 'FETCH_HEAD']);
        if (beforePush) await beforePush(attempt);
        const pushed = git(cwd, ['push', remote, `HEAD:refs/heads/${branch}`], { allowFailure: true });
        if (pushed.status === 0) return { changed: true, attempts: attempt };
        if (!isPushRace(pushed.output)) throw new Error(`Data push rejected: ${pushed.output.trim()}`);
        if (attempt === attempts) throw new Error(`Remote advanced during all ${attempts} push attempts; data was not pushed`);
        console.warn(`Another workflow updated ${branch}; fetching and rebasing before retry ${attempt + 1}/${attempts}.`);
        if (retryDelayMs) await new Promise(resolveDelay => setTimeout(resolveDelay, Math.min(5000, retryDelayMs * attempt)));
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [message, ...paths] = process.argv.slice(2);
    try { await saveData({ message, paths, branch: process.env.GITHUB_REF_NAME || 'main' }); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
