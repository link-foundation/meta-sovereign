const fail = (text) => {
  throw new Error(`salary ${text}`);
};
const object = (input) =>
  input && typeof input === 'object' && !Array.isArray(input);
export const salaryCode = (value) => {
  if (typeof value !== 'string' || !/^[A-Z][A-Z0-9]{2,9}$/u.test(value)) {
    fail('invalid currency code');
  }
  return value;
};
const rate = (value) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    fail('tax rates must be between zero and one');
  }
  return value;
};
const bands = (input, personal) => {
  if (!Array.isArray(input) || !input.length || input.length > 20) {
    fail('tax needs 1 to 20 bands');
  }
  return input.map((band, index) => {
    if (!object(band)) {
      fail('tax band must be an object');
    }
    const last = index === input.length - 1;
    if (
      last
        ? band.upTo !== null
        : !(
            typeof band.upTo === 'number' &&
            Number.isFinite(band.upTo) &&
            band.upTo > 0 &&
            band.upTo <= 1e15
          )
    ) {
      fail('tax bands need positive annual limits and a final unlimited band');
    }
    if (
      !last &&
      index &&
      (personal || band.currency === input[index - 1].currency) &&
      band.upTo <= input[index - 1].upTo
    ) {
      fail('tax band limits must increase');
    }
    return {
      upTo: band.upTo,
      rate: rate(band.rate),
      ...(!personal && band.currency !== undefined
        ? { currency: salaryCode(band.currency) }
        : {}),
    };
  });
};
const exchangeDate = (value) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    fail('exchange date must be YYYY-MM-DD');
  }
  return value;
};
export const normalizeSalaryExchange = (input) => {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (!object(input) || !(Array.isArray(input.rates) || object(input.rates))) {
    fail('exchange needs a rate table');
  }
  const base = salaryCode(input.base);
  const entries = Array.isArray(input.rates)
    ? input.rates
    : Object.entries(input.rates).map(([code, value]) => ({
        code,
        rate: value,
      }));
  if (entries.length > 100) {
    fail('exchange rates exceed 100 currencies');
  }
  const rates = entries.map((entry) => {
    if (!object(entry)) {
      fail('exchange entry must be an object');
    }
    const code = salaryCode(entry.code);
    if (
      typeof entry.rate !== 'number' ||
      !Number.isFinite(entry.rate) ||
      entry.rate <= 0 ||
      entry.rate > 1e12 ||
      (code === base && entry.rate !== 1)
    ) {
      fail(
        'exchange rates must be positive finite base units per currency unit'
      );
    }
    return { code, rate: entry.rate };
  });
  if (new Set(rates.map((entry) => entry.code)).size !== rates.length) {
    fail('exchange currency codes must be unique');
  }
  const asOf = exchangeDate(input.asOf);
  const source = input.source ?? 'manual';
  if (!['manual', 'cbr'].includes(source)) {
    fail('unknown exchange source');
  }
  const maxAgeDays = input.maxAgeDays ?? 7;
  if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
    fail('exchange maximum age must be 1 to 365 days');
  }
  return { base, rates, asOf, source, maxAgeDays };
};
export const normalizeSalaryCalculation = (input) => {
  const result = {};
  if (input.exchange !== undefined && input.exchange !== null) {
    result.exchange = normalizeSalaryExchange(input.exchange);
  }
  if (input.taxes !== undefined && input.taxes !== null) {
    if (!object(input.taxes)) {
      fail('tax schedules must be an object');
    }
    const taxes = {};
    if (input.taxes.personal !== undefined) {
      if (!object(input.taxes.personal)) {
        fail('personal tax schedule must be an object');
      }
      taxes.personal = {
        currency: salaryCode(input.taxes.personal.currency),
        bands: bands(input.taxes.personal.bands, true),
      };
    }
    if (input.taxes.company !== undefined) {
      if (!object(input.taxes.company)) {
        fail('company tax schedule must be an object');
      }
      taxes.company = {
        bands: bands(input.taxes.company.bands, false),
        payout: rate(input.taxes.company.payout ?? 0),
      };
    }
    result.taxes = taxes;
  }
  return result;
};
