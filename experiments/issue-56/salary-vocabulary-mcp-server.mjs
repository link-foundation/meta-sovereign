import { salaryDraftMcpServer } from './salary-draft-mcp-server.mjs';
import {
  salaryVocabularyQuestion,
  salaryVocabularyRules,
} from './salary-vocabulary-fixture.mjs';
await salaryDraftMcpServer({
  question: salaryVocabularyQuestion,
  rules: salaryVocabularyRules(),
});
