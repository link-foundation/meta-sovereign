import { printSalaryMcpCode } from './salary-mcp-code.mjs';
import { currencyBandCase } from './salary-band-currencies-fixture.mjs';

printSalaryMcpCode('salary-band-watch', currencyBandCase().salary);
