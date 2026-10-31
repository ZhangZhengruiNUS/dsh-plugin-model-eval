/** Read-only source contract report. A source observation is not a host trial. */
import { readFile } from 'node:fs/promises';
const evidence = JSON.parse(await readFile(new URL('../docs/evidence/host-contract.json', import.meta.url), 'utf8'));
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
if (evidence.actualHost.status !== 'passed') process.stdout.write('Actual host round-trip remains unverified.\n');
