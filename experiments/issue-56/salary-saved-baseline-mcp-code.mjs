import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { inspectSalaryFormReview } from './inspect-salary-form-review.mjs';
import { inspectSavedSalaryBaseline } from './inspect-saved-salary-baseline.mjs';
process.stdout.write(
  mcpInspectionCode(inspectSalaryFormReview, null, inspectSavedSalaryBaseline)
);
