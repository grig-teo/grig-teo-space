#!/usr/bin/env node
/**
 * Regenerates src/humanizer/humanizer.skill.ts from the vendored skill file.
 *
 * The Docker runtime image ships only dist/, so the skill text is compiled into
 * the build rather than read from disk at runtime. Run this after the vendored
 * skill changes:
 *
 *   cd backend && node scripts/vendor-humanizer.js
 */
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(repoRoot, '.agents', 'skills', 'humanizer', 'SKILL.md');
const targetPath = path.resolve(__dirname, '..', 'src', 'humanizer', 'humanizer.skill.ts');

const HEADER = [
  '/**',
  ' * The blader/humanizer skill instructions, vendored from',
  ' * .agents/skills/humanizer/SKILL.md (MIT). Used verbatim as the system',
  ' * prompt for content humanization.',
  ' *',
  ' * The Docker runtime image ships only dist/, so this is compiled in rather',
  ' * than read from disk. To refresh after a skill update, re-run',
  ' * `node scripts/vendor-humanizer.js`.',
  ' */',
  '',
].join('\n');

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Vendored skill not found at ${sourcePath}`);
    process.exit(1);
  }

  const skill = fs.readFileSync(sourcePath, 'utf8');
  const output = `${HEADER}export const HUMANIZER_SKILL = ${JSON.stringify(skill)};\n`;

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, output);
  console.log(`Wrote ${path.relative(repoRoot, targetPath)} (${output.length} bytes)`);
}

main();
