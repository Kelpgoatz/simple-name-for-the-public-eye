const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const api = import('../scripts/save-data.mjs');
function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr || result.error || ''}`);
    return result.stdout.trim();
}
async function repositories(t) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cgrillo-save-data-'));
    t.after(async () => {
        const resolved = path.resolve(directory);
        assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
        assert.ok(path.basename(resolved).startsWith('cgrillo-save-data-'));
        await fs.rm(resolved, { recursive: true, force: true });
    });
    const remote = path.join(directory, 'remote.git');
    const seed = path.join(directory, 'seed');
    await fs.mkdir(seed);
    git(directory, 'init', '--bare', '--initial-branch=main', remote);
    git(seed, 'init', '--initial-branch=main');
    git(seed, 'config', 'user.name', 'Test');
    git(seed, 'config', 'user.email', 'test@example.invalid');
    await fs.writeFile(path.join(seed, 'fixtures.json'), 'original fixtures\n');
    await fs.writeFile(path.join(seed, 'standings.json'), 'original standings\n');
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', 'Initial data');
    git(seed, 'remote', 'add', 'origin', remote);
    git(seed, 'push', 'origin', 'main');
    const writer = path.join(directory, 'writer');
    const rival = path.join(directory, 'rival');
    for (const clone of [writer, rival]) {
        // Match checkout@v4's shallow history rather than relying on a full clone.
        git(directory, 'clone', '--depth', '1', '--no-local', remote, clone);
        git(clone, 'config', 'user.name', 'Test');
        git(clone, 'config', 'user.email', 'test@example.invalid');
    }
    return { remote, writer, rival, directory };
}
async function competingUpdate(rival, file, content) {
    await fs.writeFile(path.join(rival, file), content);
    git(rival, 'add', file);
    git(rival, 'commit', '-m', 'Competing scheduled update');
    git(rival, 'push', 'origin', 'main');
}

test('concurrent workflows retain both updates when a push loses the race', async t => {
    const { saveData } = await api;
    const { remote, writer, rival, directory } = await repositories(t);
    await fs.writeFile(path.join(writer, 'fixtures.json'), 'new fixtures\n');
    const result = await saveData({ cwd: writer, message: 'Update fixtures', paths: ['fixtures.json'], retryDelayMs: 0,
        beforePush: async attempt => { if (attempt === 1) await competingUpdate(rival, 'standings.json', 'new standings\n'); } });
    assert.deepEqual(result, { changed: true, attempts: 2 });
    assert.equal(git(directory, '--git-dir', remote, 'show', 'main:fixtures.json'), 'new fixtures');
    assert.equal(git(directory, '--git-dir', remote, 'show', 'main:standings.json'), 'new standings');
});

test('a real content conflict fails without overwriting the remote', async t => {
    const { saveData } = await api;
    const { remote, writer, rival, directory } = await repositories(t);
    await fs.writeFile(path.join(writer, 'fixtures.json'), 'writer fixtures\n');
    let pushes = 0;
    await assert.rejects(saveData({ cwd: writer, message: 'Update fixtures', paths: ['fixtures.json'], retryDelayMs: 0,
        beforePush: async () => { pushes++; await competingUpdate(rival, 'fixtures.json', 'rival fixtures\n'); } }), /git rebase failed/);
    assert.equal(pushes, 1);
    assert.equal(git(directory, '--git-dir', remote, 'show', 'main:fixtures.json'), 'rival fixtures');
    assert.ok(git(writer, 'diff', '--name-only', '--diff-filter=U').includes('fixtures.json'));
});

test('continually advancing remote stops at the configured retry limit', async t => {
    const { saveData } = await api;
    const { remote, writer, rival, directory } = await repositories(t);
    await fs.writeFile(path.join(writer, 'fixtures.json'), 'writer fixtures\n');
    let pushes = 0;
    await assert.rejects(saveData({ cwd: writer, message: 'Update fixtures', paths: ['fixtures.json'], attempts: 3, retryDelayMs: 0,
        beforePush: async attempt => { pushes++; await competingUpdate(rival, 'standings.json', `standings ${attempt}\n`); } }), /all 3 push attempts/);
    assert.equal(pushes, 3);
    assert.equal(git(directory, '--git-dir', remote, 'show', 'main:fixtures.json'), 'original fixtures');
});

test('unchanged data creates no commit or push', async t => {
    const { saveData } = await api;
    const { writer } = await repositories(t);
    const head = git(writer, 'rev-parse', 'HEAD');
    const result = await saveData({ cwd: writer, message: 'Update fixtures', paths: ['fixtures.json'], remote: 'nonexistent' });
    assert.deepEqual(result, { changed: false, attempts: 0 });
    assert.equal(git(writer, 'rev-parse', 'HEAD'), head);
});

test('workflow CLI saves the declared files to its selected branch', async t => {
    const { remote, writer, directory } = await repositories(t);
    await fs.writeFile(path.join(writer, 'fixtures.json'), 'CLI fixtures\n');
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/save-data.mjs'), 'Update fixtures from CLI', 'fixtures.json'], {
        cwd: writer, encoding: 'utf8', env: { ...process.env, GITHUB_REF_NAME: 'main' }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(directory, '--git-dir', remote, 'show', 'main:fixtures.json'), 'CLI fixtures');
    assert.equal(git(directory, '--git-dir', remote, 'log', '-1', '--format=%s'), 'Update fixtures from CLI');
});

test('pre-staged unrelated changes are not committed by a data job', async t => {
    const { saveData } = await api;
    const { writer } = await repositories(t);
    await fs.writeFile(path.join(writer, 'standings.json'), 'unrelated change\n');
    git(writer, 'add', 'standings.json');
    await assert.rejects(saveData({ cwd: writer, message: 'Update fixtures', paths: ['fixtures.json'] }), /unrelated staged files/);
});

test('only remote advancement is classified as a retryable push rejection', async () => {
    const { isPushRace } = await api;
    assert.equal(isPushRace(' ! [rejected] HEAD -> main (fetch first)'), true);
    assert.equal(isPushRace(' ! [rejected] HEAD -> main (non-fast-forward)'), true);
    assert.equal(isPushRace("remote: error: cannot lock ref 'refs/heads/main': is at aabbcc but expected 112233"), true);
    assert.equal(isPushRace('remote: Permission denied to github-actions[bot].'), false);
    assert.equal(isPushRace(' ! [remote rejected] HEAD -> main (protected branch hook declined)'), false);
    assert.equal(isPushRace("remote: error: cannot lock ref 'refs/heads/main': unable to create lock file: Permission denied"), false);
});
