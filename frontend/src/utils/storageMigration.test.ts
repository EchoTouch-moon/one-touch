import { beforeEach, describe, expect, it } from 'vitest';
import { migrateLegacyLocalStorage } from './storageMigration';

const OLD = {
  auth: 'glm-words-auth',
  theme: 'glm-words-theme',
  penWeight: 'glm-words-pen-weight',
  paperGuide: 'glm-words-paper-guide',
  settings: 'glm-words-settings',
  queueV1: 'glm-words-pending-reviews',
  queueSession: 'glm-words-v2:7:session',
  queueEvent: 'glm-words-v2:7:review:abc',
  inkDraft: 'glm-words-ink-draft:user-7:word-3',
  captureEditor: 'glm-capture-editor-v2:7',
  detailEditor: 'glm-detail-editor-v2:7:12',
  unrelated: 'some-other-app-key',
};

const NEW = {
  auth: 'onetouch-auth',
  theme: 'onetouch-theme',
  penWeight: 'onetouch-pen-weight',
  paperGuide: 'onetouch-paper-guide',
  settings: 'onetouch-settings',
  queueV1: 'onetouch-pending-reviews',
  queueSession: 'onetouch-v2:7:session',
  queueEvent: 'onetouch-v2:7:review:abc',
  inkDraft: 'onetouch-ink-draft:user-7:word-3',
  captureEditor: 'onetouch-capture-editor-v2:7',
  detailEditor: 'onetouch-detail-editor-v2:7:12',
};

beforeEach(() => { localStorage.clear(); });

describe('storage key migration', () => {
  it('moves every legacy key to its new name, preserving values', () => {
    localStorage.setItem(OLD.auth, '{"token":"t1"}');
    localStorage.setItem(OLD.theme, 'violet');
    localStorage.setItem(OLD.penWeight, '0.7');
    localStorage.setItem(OLD.paperGuide, 'ruled');
    localStorage.setItem(OLD.settings, '{"review_algorithm":"fsrs"}');
    localStorage.setItem(OLD.queueSession, '{"items":[]}');
    localStorage.setItem(OLD.queueEvent, '{"word_id":3}');
    localStorage.setItem(OLD.inkDraft, '{"strokes":[]}');
    localStorage.setItem(OLD.captureEditor, '{"text":"persist"}');
    localStorage.setItem(OLD.detailEditor, '{"text":"persist"}');
    localStorage.setItem(OLD.queueV1, '[{"word_id":1}]');

    migrateLegacyLocalStorage();

    expect(localStorage.getItem(NEW.auth)).toBe('{"token":"t1"}');
    expect(localStorage.getItem(NEW.theme)).toBe('violet');
    expect(localStorage.getItem(NEW.penWeight)).toBe('0.7');
    expect(localStorage.getItem(NEW.paperGuide)).toBe('ruled');
    expect(localStorage.getItem(NEW.settings)).toBe('{"review_algorithm":"fsrs"}');
    expect(localStorage.getItem(NEW.queueSession)).toBe('{"items":[]}');
    expect(localStorage.getItem(NEW.queueEvent)).toBe('{"word_id":3}');
    expect(localStorage.getItem(NEW.inkDraft)).toBe('{"strokes":[]}');
    expect(localStorage.getItem(NEW.captureEditor)).toBe('{"text":"persist"}');
    expect(localStorage.getItem(NEW.detailEditor)).toBe('{"text":"persist"}');
    expect(localStorage.getItem(NEW.queueV1)).toBe('[{"word_id":1}]');
    expect(Object.keys(localStorage).filter(k => k.startsWith('glm'))).toEqual([]);
  });

  it('leaves keys that do not belong to this app alone', () => {
    localStorage.setItem(OLD.unrelated, 'keep me');
    localStorage.setItem(OLD.auth, 'token');
    migrateLegacyLocalStorage();
    expect(localStorage.getItem(OLD.unrelated)).toBe('keep me');
    expect(localStorage.getItem(NEW.auth)).toBe('token');
  });

  it('never overwrites a value the current version already wrote', () => {
    localStorage.setItem(OLD.theme, 'paper');       // stale copy from before
    localStorage.setItem(NEW.theme, 'violet');      // written by this version
    migrateLegacyLocalStorage();
    expect(localStorage.getItem(NEW.theme)).toBe('violet');
    expect(localStorage.getItem(OLD.theme)).toBeNull();
  });

  it('is idempotent and marks itself as done', () => {
    localStorage.setItem(OLD.auth, 'token');
    migrateLegacyLocalStorage();
    const after = localStorage.getItem(NEW.auth);
    // A later run must not undo anything, and the flag must be present.
    localStorage.setItem(NEW.auth, 'token-2');
    migrateLegacyLocalStorage();
    expect(localStorage.getItem(NEW.auth)).toBe('token-2');
    expect(after).toBe('token');
    expect(localStorage.getItem('onetouch-storage-migrated-v1')).toBe('1');
  });

  it('does nothing on a browser with no legacy keys', () => {
    localStorage.setItem(NEW.auth, 'token');
    migrateLegacyLocalStorage();
    expect(localStorage.getItem(NEW.auth)).toBe('token');
    expect(Object.keys(localStorage)).toHaveLength(2); // value + migration flag
  });
});
