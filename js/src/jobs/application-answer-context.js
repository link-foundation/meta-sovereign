import { optionalAnswerProfileId } from '../automation/question-profiles.js';
import { normalizeSalary } from '../automation/salary-config.js';
import { applicationSalarySettings } from './application-salary.js';

/** Omit absent settings so acknowledged legacy journal signatures stay intact. */
export const applicationAnswerContext = (input) => {
  const profileId = optionalAnswerProfileId(input.profileId);
  const salary = normalizeSalary(input.salary);
  return {
    ...(profileId ? { profileId } : {}),
    ...(salary ? { salary } : {}),
    ...applicationSalarySettings(input),
  };
};

export const validApplicationAnswerContext = (input) => {
  const normalized = applicationAnswerContext(input);
  return ['profileId', 'salary', 'salaryLadder', 'salaryFloorRub'].every(
    (key) => JSON.stringify(normalized[key]) === JSON.stringify(input[key])
  );
};
