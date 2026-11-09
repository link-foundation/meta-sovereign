// Values are independent, owner-supplied monthly targets. Currency conversion
// and tax calculations are never inferred from a different target.
const fail = (message) => {
  throw new Error(`salary ${message}`);
};
const positive = (value, field, max = 1e12) => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > max
  ) {
    fail(`${field} must be a positive finite number up to ${max}`);
  }
  return value;
};
const currency = (entry) => {
  if (!/^[A-Z][A-Z0-9]{2,9}$/u.test(entry?.code ?? '')) {
    fail('currency needs a code of 3 to 10 uppercase letters or digits');
  }
  if (
    !Array.isArray(entry.keywords) ||
    !entry.keywords.length ||
    entry.keywords.length > 20 ||
    entry.keywords.some(
      (word) => typeof word !== 'string' || !word.trim() || word.length > 200
    )
  ) {
    fail('currency needs 1 to 20 nonempty keywords of at most 200 characters');
  }
  const result = {
    code: entry.code,
    keywords: [...new Set(entry.keywords.map((word) => word.trim()))],
  };
  for (const basis of ['net', 'gross']) {
    if (entry[basis] !== undefined && entry[basis] !== null) {
      result[basis] = positive(entry[basis], basis);
    }
  }
  result.hourlyStep = positive(
    entry.hourlyStep ?? (entry.code === 'RUB' ? 500 : 5),
    'hourlyStep'
  );
  return result;
};
export const normalizeSalary = (input) => {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (
    !Array.isArray(input.currencies) ||
    !input.currencies.length ||
    input.currencies.length > 10
  ) {
    fail('needs 1 to 10 currencies');
  }
  const currencies = input.currencies.map(currency);
  if (
    new Set(currencies.map((entry) => entry.code)).size !== currencies.length
  ) {
    fail('currency codes must be unique');
  }
  const defaultCurrency = input.defaultCurrency ?? null;
  if (
    defaultCurrency !== null &&
    !currencies.some((entry) => entry.code === defaultCurrency)
  ) {
    fail('default currency must be configured');
  }
  const defaultBasis = input.defaultBasis ?? 'net';
  if (!['net', 'gross'].includes(defaultBasis)) {
    fail('default basis must be net or gross');
  }
  return {
    enabled: input.enabled === true,
    approved: input.approved === true,
    defaultCurrency,
    defaultBasis,
    monthlyHours:
      input.monthlyHours === null
        ? null
        : positive(input.monthlyHours ?? 160, 'monthlyHours', 744),
    currencies,
  };
};
export const salaryAmount = (config, entry, basis, period) => {
  if (
    !['net', 'gross'].includes(basis) ||
    !['month', 'hour'].includes(period)
  ) {
    return undefined;
  }
  const monthly = entry?.[basis];
  if (!monthly || (period === 'hour' && !config.monthlyHours)) {
    return undefined;
  }
  const amount =
    period === 'hour'
      ? Math.ceil(monthly / config.monthlyHours / entry.hourlyStep) *
        entry.hourlyStep
      : monthly;
  return Number.isFinite(amount) && amount > 0 && amount <= 1e12
    ? amount
    : undefined;
};
export const formatSalary = (amount, code) => {
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
    .format(amount)
    .replaceAll(',', ' ');
  return code === 'USD'
    ? `$${number}`
    : `${number} ${{ RUB: '₽', EUR: '€' }[code] ?? code}`;
};
