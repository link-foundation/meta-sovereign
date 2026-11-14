const DAY = 86400000;
export const SALARY_EXCHANGE_ID = 'salary-exchange:cbr';

export const salaryExchangeFresh = (exchange, now = Date.now()) => {
  const current = typeof now === 'number' ? now : Date.parse(now);
  const age = current - Date.parse(exchange?.asOf);
  return (
    Number.isFinite(age) &&
    age <= exchange.maxAgeDays * DAY &&
    age >= -(exchange.source === 'cbr' ? DAY : 0)
  );
};
