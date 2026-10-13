import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const web = fileURLToPath(new URL('..', import.meta.url)), root = fileURLToPath(new URL('../..', import.meta.url));
for (const name of ['editor','interactions','world','walls','encounters','battle','economy','exchanges','progression','cave','audit','ux','routing','nfc','buildings','adventure','demos','story']) execFileSync(process.execPath, [`scripts/verify-${name}.mjs`], { cwd: web, stdio: 'inherit' });
execFileSync('python3', ['scripts/export-font.py','--check'], { cwd: web, stdio: 'inherit' });
execFileSync('python3', ['-m','unittest','discover','-s','compiler','-p','test_*.py'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['compiler/verify.mjs'], { cwd: root, stdio: 'inherit' });
execFileSync('npm', ['run','build'], { cwd: web, stdio: 'inherit' });
