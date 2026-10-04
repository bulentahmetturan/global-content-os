// Test-only: bundles canary-control.ts once for helpers that cannot import TypeScript directly.
import { bundle } from '../sqlite-d1.test-helper.mjs';
const CC = await bundle('apps/worker/src/dossier/canary-control.ts', 'capacity-bridge');
export const setControl = CC.setControl;
