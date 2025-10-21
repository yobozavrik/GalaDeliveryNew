import { describe, it, expect } from 'vitest';
import { InputValidator } from '../src/validation.js';

describe('InputValidator', () => {
  it('removes javascript protocols and event handlers', () => {
    const raw = "<a href=\"javascript:alert('x')\" onclick=\"doEvil()\">Click</a>";
    const sanitized = InputValidator.sanitizeString(raw);
    expect(sanitized.toLowerCase()).not.toContain('javascript:');
    expect(sanitized.toLowerCase()).not.toContain('onclick');
  });

  it('validates quantities within limits', () => {
    expect(InputValidator.validateQuantity('5')).toBe(true);
    expect(InputValidator.validateQuantity('-1')).toBe(false);
    expect(InputValidator.validateQuantity('20000')).toBe(false);
  });
});
