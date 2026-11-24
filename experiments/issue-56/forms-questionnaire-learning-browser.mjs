// Reuse the production Forms harness with only the questionnaire learning flow.
process.env.FORMS_QUESTIONNAIRE_LEARNING_ONLY = '1';
await import('../../js/tests/e2e-forms-reader-browser.mjs');
