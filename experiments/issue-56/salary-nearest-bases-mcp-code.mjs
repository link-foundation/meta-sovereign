import { mcpInspectionCode } from './mcp-inspection-code.mjs';
import { inspectSalaryFormReview } from './inspect-salary-form-review.mjs';
import { inspectNearestSalaryBases } from './inspect-nearest-salary-bases.mjs';
process.stdout.write(
  mcpInspectionCode(inspectSalaryFormReview, null, inspectNearestSalaryBases)
);
