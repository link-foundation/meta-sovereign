// Quick probe of the greeting detector across languages (issue #35).
import { detectGreetingLanguage } from '../js/src/greetings/detect.js';

const samples = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'Привет!',
      'привет, тебе',
      'Добрый день',
      'дд',
      'Привет, как дела?',
      'hi',
      'Hello there!',
      'hey everyone',
      'good morning',
      'hi, can you help?',
      'yo',
      'history',
      '你好',
      '您好！',
      '大家好',
      '你好，请问',
      'नमस्ते',
      'नमस्ते जी',
      'Xin chào',
      'chào bạn',
      'chào, bạn khỏe không',
      '👋',
      '👋👋',
      '🙂',
      '',
      'ok',
    ];
for (const text of samples) {
  console.log(JSON.stringify(text), '->', detectGreetingLanguage(text));
}
