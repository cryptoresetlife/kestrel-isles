// Kestrel Isles hand-in program (Node 22, standard library only).
// Copies the static game in game/ and the screenshots in screenshots/ to the output folder, then writes
// dossier.json with the kit's vendored builder so the scorer can rebuild it byte for byte.
// Outside the grader, MAKEFUN_OUTPUT_DIR replaces /output:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyFolder(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

// Fail loudly rather than hand in an empty entry if the game folder is missing.
if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html not found next to main.ts');
}

mkdirSync(outputDir, { recursive: true });
copyFolder('game');
copyFolder('screenshots');

// Caps mirror the scorer's own limits: 160 KiB of source text, 4 screenshots of at most 256 KiB,
// and at most 993 entries / 48 MiB / 1000-byte paths under game/.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
