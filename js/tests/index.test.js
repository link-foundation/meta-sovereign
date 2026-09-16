/**
 * Top-level smoke test — every public namespace is exported.
 */

import { describe, it, expect } from 'test-anywhere';
import * as ms from '../src/index.js';

describe('public api', () => {
  it('exposes every subsystem namespace', () => {
    for (const name of [
      'storage',
      'sources',
      'patterns',
      'replies',
      'automation',
      'crm',
      'facts',
      'sync',
      'broadcast',
      'backup',
      'cv',
    ]) {
      expect(typeof ms[name]).toBe('object');
    }
    expect(typeof ms.runCli).toBe('function');
    expect(typeof ms.startServer).toBe('function');
    // The CV subsystem is the whole point of issue #29: platforms,
    // the read/compare/sync facade and the telemetry reader.
    expect(typeof ms.cv.listCvPlatforms).toBe('function');
    expect(typeof ms.cv.syncCvAcross).toBe('function');
    expect(typeof ms.cv.loadCvTelemetry).toBe('function');
  });
});
