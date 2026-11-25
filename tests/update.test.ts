import { describe, expect, it, vi } from 'vitest';
import { PendingUpdate } from '../src/core/update';

describe('a new build waiting to be installed (v1.23)', () => {
  it('is not ready until the worker says so, then installs once asked', () => {
    const u = new PendingUpdate();
    const apply = vi.fn();
    expect(u.ready).toBe(false);
    expect(u.install()).toBe(false);
    u.arrive(apply);
    expect(u.ready).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(u.install()).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('tells listeners when it arrives, including one added afterwards', () => {
    const u = new PendingUpdate();
    const early = vi.fn();
    const late = vi.fn();
    u.onReady(early);
    expect(early).not.toHaveBeenCalled();
    u.arrive(() => {});
    expect(early).toHaveBeenCalledTimes(1);
    u.onReady(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
