import data from './src/lib/coe-snic-default-rtdb-logs-export.json' with { type: 'json' };

// Check for logs with null or missing entries
const problematicLogs = [];
Object.entries(data).forEach(([logId, log]) => {
  if (!log.entries) {
    problematicLogs.push({ logId, issue: 'no entries array' });
  } else if (log.entries.some(e => e === null || e === undefined)) {
    problematicLogs.push({ logId, issue: 'has null/undefined entries' });
  }
});

console.log('Total logs:', Object.keys(data).length);
console.log('Problematic logs:', problematicLogs.length);
if (problematicLogs.length > 0) {
  console.log('Examples:', problematicLogs.slice(0, 3));
}