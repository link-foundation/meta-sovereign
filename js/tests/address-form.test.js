import { describe, it, expect } from 'test-anywhere';
import {
  addressRulesFromPatterns,
  defaultAddressRules,
  detectAddressForm,
  scoreAddressForm,
} from '../src/crm/address-form.js';

const msg = (sender, body) => ({ sender, body });

describe('scoreAddressForm', () => {
  it('counts ты markers: pronouns, possessives, -ешь verbs', () => {
    const score = scoreAddressForm('Привет! Ты знаешь, где твой ноутбук?');
    expect(score.informal > 0).toBe(true);
    expect(score.formal).toBe(0);
    const rules = score.hits.map((h) => h.rule);
    expect(rules.includes('ru-ty-pronoun')).toBe(true);
    expect(rules.includes('ru-ty-possessive')).toBe(true);
    expect(rules.includes('ru-ty-verb')).toBe(true);
  });
  it('counts вы markers: pronouns, possessives, polite verbs', () => {
    const score = scoreAddressForm(
      'Здравствуйте! Вы можете прислать ваше резюме?'
    );
    expect(score.formal > 0).toBe(true);
    expect(score.informal).toBe(0);
  });
  it('matches whole words only, so вы/ты inside other words do not count', () => {
    const score = scoreAddressForm('выход из работы, вытянуть, тыква, ваниль');
    expect(score.informal).toBe(0);
    expect(score.formal).toBe(0);
  });
  it('does not mistake prepositional nouns for polite verbs', () => {
    const score = scoreAddressForm('Нашёл в интернете, на сайте и в пакете');
    expect(score.formal).toBe(0);
  });
  it('detects Chinese 你/您 and ignores the plural 你们', () => {
    expect(scoreAddressForm('您好，您有空吗').formal).toBe(2);
    expect(scoreAddressForm('你好').informal).toBe(1);
    expect(scoreAddressForm('你们好').informal).toBe(0);
  });
  it('detects Hindi तुम/आप as whole words', () => {
    expect(scoreAddressForm('क्या आप ठीक हैं').formal).toBe(1);
    expect(scoreAddressForm('तुम कहाँ हो').informal).toBe(1);
  });
});

describe('detectAddressForm', () => {
  it('picks the form used more in the dialog', () => {
    const result = detectAddressForm([
      msg('me', 'Привет, как ты?'),
      msg('bob', 'Норм, а ты как? Что делаешь?'),
      msg('bob', 'Вы видели новость?'),
    ]);
    expect(result.form).toBe('informal');
    expect(result.reason).toBe('majority');
    expect(result.confidence > 0.5).toBe(true);
  });
  it('weights the owner’s own messages more than the contact’s', () => {
    const messages = [msg('me', 'Вы свободны?'), msg('bob', 'Да, ты как?')];
    expect(detectAddressForm(messages).form).toBe('formal');
    expect(detectAddressForm(messages, { selfWeight: 1 }).reason).toBe('tie');
  });
  it('falls back to formal on a tie or with no evidence', () => {
    expect(detectAddressForm([msg('me', 'ок')]).form).toBe('formal');
    expect(detectAddressForm([msg('me', 'ок')]).reason).toBe('no-evidence');
    expect(
      detectAddressForm([msg('me', 'ок')], { fallback: 'informal' }).form
    ).toBe('informal');
  });
  it('honours a custom isSelf predicate', () => {
    const result = detectAddressForm(
      [msg('user1', 'Ты где?'), msg('user2', 'Вы где? Вы тут?')],
      { isSelf: (s) => s === 'user1', selfWeight: 3 }
    );
    expect(result.form).toBe('informal');
  });
});

describe('addressRulesFromPatterns', () => {
  it('turns address:* labelled pattern links into rules', () => {
    const rules = addressRulesFromPatterns([
      {
        id: 'pattern:bro',
        tokens: ['pattern', 'bro', 'address:informal'],
        regex: 'бро|братан',
      },
      { id: 'pattern:other', tokens: ['pattern', 'x', 'greeting'], regex: 'x' },
      { id: 'pattern:bad', label: 'address:formal', regex: '(' },
      { id: 'msg:x:1', label: 'address:formal', regex: 'x' },
    ]);
    expect(rules.length).toBe(1);
    expect(rules[0].form).toBe('informal');
    const result = detectAddressForm([msg('me', 'Бро, как дела?')], {
      rules: [...defaultAddressRules, ...rules],
    });
    expect(result.form).toBe('informal');
    expect(result.rules['pattern:bro']).toBe(1);
  });
});
