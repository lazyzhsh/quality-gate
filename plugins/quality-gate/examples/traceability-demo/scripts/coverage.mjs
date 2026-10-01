import {readFileSync} from 'node:fs';

// Demo coverage runner: echoes the requested criteria back with every linked
// file marked as executed. A real project replaces this with its coverage
// tooling (e.g. V8 coverage, lcov) keyed by the same criterion IDs.
const input = JSON.parse(readFileSync(0, 'utf8'));
const results = input.criteria.map(criterion => ({
  criterionId: criterion.id,
  files: criterion.codeFiles.map(file => ({path: file, covered: true}))
}));
process.stdout.write(JSON.stringify({schemaVersion: '0.1', runId: input.runId, source: 'scripts/coverage.mjs demo echo', results}));
