import { describe, it, expect } from 'vitest';
import { isRefusal, captionPrompts, captionSystemPrompt } from '../captionPrompts';

describe('isRefusal', () => {
  it('detects "I can\'t provide" as refusal', () => {
    expect(isRefusal("I can't provide a caption for this image")).toBe(true);
  });

  it('detects "I cannot" as refusal', () => {
    expect(isRefusal('I cannot describe this content')).toBe(true);
  });

  it('detects "I need to decline" as refusal', () => {
    expect(isRefusal('I need to decline this request')).toBe(true);
  });

  it('detects "not appropriate" as refusal', () => {
    expect(isRefusal('This image is not appropriate for me to describe')).toBe(true);
  });

  it('detects "sorry...unable" as refusal', () => {
    expect(isRefusal("Sorry, I'm unable to caption this image")).toBe(true);
  });

  it('does not flag normal captions', () => {
    expect(isRefusal('a young woman with brown hair, sitting at a desk, smiling')).toBe(false);
  });

  it('does not flag captions with common words', () => {
    expect(isRefusal('1girl, long hair, blue eyes, outdoor scene, natural lighting')).toBe(false);
  });

  it('does not flag empty string', () => {
    expect(isRefusal('')).toBe(false);
  });
});

describe('captionPrompts', () => {
  it('has all four caption styles', () => {
    expect(Object.keys(captionPrompts)).toEqual(expect.arrayContaining(['descriptive', 'booru', 'natural', 'trigger']));
  });

  it('each style is a non-empty string', () => {
    for (const [key, prompt] of Object.entries(captionPrompts)) {
      expect(prompt, `${key} prompt`).toBeTruthy();
      expect(typeof prompt).toBe('string');
    }
  });
});

describe('captionSystemPrompt', () => {
  it('is a non-empty string', () => {
    expect(captionSystemPrompt).toBeTruthy();
    expect(typeof captionSystemPrompt).toBe('string');
  });

  it('mentions training and diffusion model', () => {
    expect(captionSystemPrompt).toContain('training');
    expect(captionSystemPrompt).toContain('diffusion model');
  });
});
