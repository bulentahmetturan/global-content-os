// This local candidate has no approved production pending-set or deployment scope.
console.error(JSON.stringify({ verdict: 'BLOCKED_PRODUCTION_EVIDENCE', operation: process.argv[2], reason: 'Production ledger, independent deployed-byte provenance, exact pending authorization and separate deployment approval are required. No remote command was invoked.' }));
process.exitCode = 2;
