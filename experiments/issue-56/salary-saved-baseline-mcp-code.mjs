import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { inspectSavedSalaryBaseline } from './inspect-saved-salary-baseline.mjs';
process.stdout.write(mcpInspectionCode(inspectSavedSalaryBaseline, null));
