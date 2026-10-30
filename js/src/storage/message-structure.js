// Standard adapter link arrays repeat values already present on each message.
// Keep their public shape, but derive identical arrays instead of retaining
// millions of arrays and repeated identifier strings in the archive heap.
const externalId = (record) =>
  String(record.id).slice(`msg:${record.source}:`.length);
const values = {
  tokens() {
    return ['message', this.source, externalId(this)];
  },
  children() {
    const id = externalId(this);
    return [
      `sender:${this.source}:${this.sender}`,
      `chat:${this.source}:${this.chat}`,
      `body:${this.source}:${id}`,
      `ts:${this.source}:${id}`,
      ...(this.replyTo ? [`replyto:${this.source}:${this.replyTo}`] : []),
    ];
  },
};
const assign = (field) =>
  function (value) {
    Object.defineProperty(this, field, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };
const setters = Object.fromEntries(
  Object.keys(values).map((field) => [field, assign(field)])
);
const same = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

export const deriveMessageStructure = (record) => {
  if (!record.id?.startsWith(`msg:${record.source}:`)) {
    return record;
  }
  for (const [field, get] of Object.entries(values)) {
    if (same(record[field], get.call(record))) {
      Object.defineProperty(record, field, {
        get,
        set: setters[field],
        enumerable: true,
        configurable: true,
      });
    }
  }
  return record;
};
export const derivedStructureBytes = (record) => {
  let bytes = 0;
  for (const [field, get] of Object.entries(values)) {
    if (Object.getOwnPropertyDescriptor(record, field)?.get === get) {
      bytes += get
        .call(record)
        .reduce((sum, value) => sum + String(value).length * 2, 0);
    }
  }
  return bytes;
};
