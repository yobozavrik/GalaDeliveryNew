import { describe, it, expect } from 'vitest';
import { AppState } from '../src/state.js';

describe('AppState', () => {
  it('notifies adapter when screen changes', () => {
    const updates = [];
    const adapter = { update: (state) => updates.push({ screen: state.screen, tab: state.tab }) };
    const state = new AppState(adapter);

    state.setScreen('drafts-list', { isUnloading: true });
    state.setTab('history');

    expect(updates.length).toBe(2);
    expect(updates[0].screen).toBe('drafts-list');
    expect(state.isUnloading).toBe(true);
    expect(state.tab).toBe('history');
  });

  it('limits batch items to twenty entries', () => {
    const state = new AppState();
    for (let i = 0; i < 20; i++) {
      state.addBatchItem({ id: i });
    }
    expect(state.getBatchCount()).toBe(20);
    expect(() => state.addBatchItem({ id: 21 })).toThrowError();
  });
});
