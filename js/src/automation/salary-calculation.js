// Pure calculations over explicitly configured schedules and rate snapshots.
// Planning never performs network requests or assumes a jurisdiction's taxes.
import { salaryExchangeFresh } from './salary-exchange-state.js';
const bounded = (amount) =>
  Number.isFinite(amount) && amount > 0 && amount <= 1e12;
const exchangeRate = (from, to, exchange, now) => {
  if (from === to) {
    return { rate: 1 };
  }
  const rates = new Map(
    (exchange?.rates ?? []).map((entry) => [entry.code, entry.rate])
  );
  if (exchange) {
    rates.set(exchange.base, 1);
  }
  if (!rates.has(from) || !rates.has(to)) {
    return { missing: `salary_exchange_${from}_${to}` };
  }
  if (!salaryExchangeFresh(exchange, now)) {
    return { missing: 'salary_exchange_stale' };
  }
  return {
    rate: rates.get(from) / rates.get(to),
    exchange: {
      asOf: exchange.asOf,
      source: exchange.source,
      base: exchange.base,
    },
  };
};
const progressive = (net, schedule) => {
  let remaining = net;
  let floor = 0;
  const rates = [];
  for (const band of schedule.bands) {
    rates.push(band.rate);
    const ceiling = band.upTo ?? Infinity;
    const available = (ceiling - floor) * (1 - band.rate);
    if (remaining <= available) {
      return { gross: floor + remaining / (1 - band.rate), rates };
    }
    remaining -= available;
    floor = ceiling;
  }
  return {};
};
const personalGross = (net, code, config, now) => {
  const schedule = config.taxes?.personal;
  if (!schedule) {
    return { missing: 'salary_tax_personal' };
  }
  const conversion = exchangeRate(
    code,
    schedule.currency,
    config.exchange,
    now
  );
  if (conversion.missing) {
    return conversion;
  }
  const result = progressive(net * 12 * conversion.rate, schedule);
  return {
    monthly: result.gross / 12 / conversion.rate,
    calculation: {
      method: 'personal',
      rates: result.rates,
      taxCurrency: schedule.currency,
      ...(conversion.exchange ? { exchange: conversion.exchange } : {}),
    },
  };
};
const companyGross = (net, entry, config, now) => {
  const { code } = entry;
  const schedule = config.taxes?.company;
  if (!schedule) {
    return { missing: 'salary_tax_company' };
  }
  let floor = 0;
  let evidence;
  for (const band of schedule.bands) {
    const conversion = exchangeRate(
      code,
      band.currency ?? code,
      config.exchange,
      now
    );
    if (conversion.missing) {
      return conversion;
    }
    evidence ??= conversion.exchange;
    const ceiling = band.upTo === null ? Infinity : band.upTo / conversion.rate;
    if (ceiling <= floor) {
      return { missing: 'salary_tax_band_order' };
    }
    const step = entry.grossStep ?? (code === 'RUB' ? 10000 : 100);
    // Rounding can move the whole income into a different company band.
    const monthly =
      Math.ceil(net / ((1 - band.rate) * (1 - schedule.payout)) / step) * step;
    if (monthly * 12 > floor && monthly * 12 <= ceiling) {
      return {
        monthly,
        calculation: {
          method: 'company',
          rates: [band.rate],
          payout: schedule.payout,
          ...(evidence ? { exchange: evidence } : {}),
        },
      };
    }
    floor = ceiling;
  }
  return { missing: 'salary_tax_company_band' };
};
const periodAmount = (result, config, entry, period) => {
  if (!bounded(result.monthly)) {
    return { missing: 'salary_calculation_bounds' };
  }
  if (period === 'hour' && !config.monthlyHours) {
    return { missing: 'salary_monthly_hours' };
  }
  const amount =
    period === 'hour'
      ? Math.ceil(result.monthly / config.monthlyHours / entry.hourlyStep) *
        entry.hourlyStep
      : result.monthly;
  return bounded(amount)
    ? { ...result, amount }
    : { missing: 'salary_calculation_bounds' };
};
export const resolveSalaryAmount = (
  config,
  entry,
  basis,
  period,
  { now } = {}
) => {
  if (
    !entry ||
    !['net', 'gross'].includes(basis) ||
    !['month', 'hour'].includes(period)
  ) {
    return {};
  }
  const method =
    basis === 'gross' ? (entry.grossMethod ?? 'explicit') : 'explicit';
  let result = { monthly: entry[basis] };
  if (method !== 'explicit') {
    if (!entry.net) {
      return { missing: `salary_net_${entry.code.toLowerCase()}` };
    }
    result =
      method === 'personal'
        ? personalGross(entry.net, entry.code, config, now)
        : companyGross(entry.net, entry, config, now);
    if (result.missing) {
      return result;
    }
    if (method === 'personal') {
      const step = entry.grossStep ?? (entry.code === 'RUB' ? 10000 : 100);
      result.monthly = Math.ceil(result.monthly / step) * step;
    }
  }
  if (!bounded(result.monthly)) {
    return { missing: `salary_${basis}_${entry.code.toLowerCase()}` };
  }
  return periodAmount(result, config, entry, period);
};
