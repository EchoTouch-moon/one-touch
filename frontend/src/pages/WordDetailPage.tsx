import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentUserId, getAuthSessionEpoch } from '../api/authSession';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { Link, useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { WordDetail, Definition } from '../types/word';
import api from '../api/client';
import { addDefinition, deleteDefinition, updateDefinition, updateWord } from '../api/words';
import { enrichWord, getEnrichErrorMessage } from '../api/enrich';
import CanvasFullscreen from '../components/CanvasFullscreen';
import { deleteDraftRecord, flushDraftWrites } from '../components/canvas-pad/draftStore';
import { useSettingsStore } from '../store/settingsStore';

const POS_OPTIONS = ['n.', 'v.', 'vi.', 'vt.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'phr.'];
const HANDWRITING_LABEL = 'Handwritten definition';

interface DefForm {
  pos: string;
  meaning_en: string;
  meaning_zh: string;
}

const emptyTypedForm = (): DefForm => ({ pos: 'n.', meaning_en: '', meaning_zh: '' });

function isHandwritingDef(def: Definition): boolean {
  return Boolean(def.canvas_image || def.ink_data);
}

function isAiDefinition(def: Definition): boolean {
  return !def.canvas_image && !def.ink_data && (def.examples?.some((item) => item.source === 'llm') ?? false);
}

function definitionLabel(def: Definition): string {
  if (def.meaning_zh && def.meaning_zh !== HANDWRITING_LABEL) return def.meaning_zh;
  if (def.meaning_en) return def.meaning_en;
  return def.pos;
}

function pickPrimaryDef(defs: Definition[]): Definition | null {
  if (defs.length === 0) return null;
  const configured = defs.find((def) => def.is_primary);
  if (configured) return configured;
  const handwritten = defs.find(isHandwritingDef);
  return handwritten ?? defs[0];
}

export default function WordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [word, setWord] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [editingPhonetic, setEditingPhonetic] = useState(false);
  const [phonetic, setPhonetic] = useState('');

  const [selectedDefId, setSelectedDefId] = useState<number | null>(null);
  const userSelectedDefRef = useRef(false);

  const [typedForm, setTypedForm] = useState<DefForm>(emptyTypedForm());
  const [typedEditId, setTypedEditId] = useState<number | null>(null);
  const [typedAdding, setTypedAdding] = useState(false);
  const [savingTyped, setSavingTyped] = useState(false);
  const typedEditorRef = useRef<HTMLDivElement | null>(null);

  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenEditId, setFullscreenEditId] = useState<number | null>(null);
  const [fullscreenInitial, setFullscreenInitial] = useState<{ image: string | null; ink: string | null; pos: string }>(
    { image: null, ink: null, pos: 'n.' },
  );
  const [savingHandwriting, setSavingHandwriting] = useState(false);

  const [typedBaseline, setTypedBaseline] = useState(JSON.stringify(emptyTypedForm()));
  const [handwritingDraft, setHandwritingDraft] = useState<{ image: string | null; ink: string | null }>({ image: null, ink: null });
  const draftStorageKey = `glm-detail-editor-v2:${getCurrentUserId()}:${id}`;
  const [recoverable, setRecoverable] = useState(() => localStorage.getItem(draftStorageKey) !== null);
  const typedDirty = (typedAdding || typedEditId !== null) && JSON.stringify(typedForm) !== typedBaseline;
  const inkDirty = fullscreenOpen && (handwritingDraft.image !== fullscreenInitial.image || handwritingDraft.ink !== fullscreenInitial.ink);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    localStorage.setItem(draftStorageKey, JSON.stringify({ typedForm, typedEditId, typedAdding, fullscreenEditId, fullscreenOpen, handwritingDraft, fullscreenInitial }));
    await flushDraftWrites();
  }, [draftStorageKey, typedForm, typedEditId, typedAdding, fullscreenEditId, fullscreenOpen, handwritingDraft, fullscreenInitial]);
  const discardDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    const key = `glm-words-ink-draft:user-${getCurrentUserId()}:detail-${id}-${fullscreenEditId ?? 'new'}`;
    await deleteDraftRecord(key);
    localStorage.removeItem(key); localStorage.removeItem(draftStorageKey); setRecoverable(false);
  }, [id, fullscreenEditId, draftStorageKey]);
  const exitGuard = useUnsavedChanges(typedDirty || inkDirty, keepDraft, discardDraft);
  const onDraftChange = useCallback((image: string | null, ink: string | null) => setHandwritingDraft({ image, ink }), []);
  const restoreDraft = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftStorageKey) ?? 'null');
      if (!saved) return;
      setTypedForm(saved.typedForm); setTypedEditId(saved.typedEditId); setTypedAdding(saved.typedAdding);
      if (saved.fullscreenOpen) {
        setFullscreenEditId(saved.fullscreenEditId);
        setFullscreenInitial(saved.fullscreenInitial);
        setHandwritingDraft(saved.handwritingDraft); setFullscreenOpen(true);
      }
    } catch { toast.error('Could not restore draft. It has been preserved.'); }
  };
  useEffect(() => {
    if (!typedDirty && !inkDirty) return;
    draftTimer.current = setTimeout(() => void keepDraft().catch(() => undefined), 300);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [typedDirty, inkDirty, keepDraft]);

  const setSavedInputMode = useSettingsStore((s) => s.setDefinitionInputMode);

  const fetchWord = useCallback(() => {
    if (!id) return;
    const epoch = getAuthSessionEpoch();
    setLoading(true);
    api
      .get<WordDetail>(`/words/${id}`)
      .then((res) => {
        if (epoch !== getAuthSessionEpoch()) return;
        setWord(res.data);
        setPhonetic(res.data.phonetic || '');
      })
      .catch(() => setWord(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(fetchWord, 0);
    return () => window.clearTimeout(timer);
  }, [fetchWord]);

  const primaryDef = useMemo<Definition | null>(() => {
    if (!word) return null;
    if (selectedDefId !== null) {
      const found = word.definitions.find((d) => d.id === selectedDefId);
      if (found) return found;
    }
    return pickPrimaryDef(word.definitions);
  }, [word, selectedDefId]);

  // Reset auto-pick when word data changes (unless user explicitly picked)
  useEffect(() => {
    if (!userSelectedDefRef.current) {
      setSelectedDefId(null);
    }
  }, [word?.id]);

  const handleEnrich = async () => {
    if (!word) return;
    setEnriching(true);
    try {
      const result = await enrichWord(word.id);
      const remaining = result.quota?.remaining;
      toast.success(
        typeof remaining === 'number'
          ? `AI suggestions added (${remaining} left today)`
          : 'AI suggestions added',
      );
      fetchWord();
    } catch (err: unknown) {
      toast.error(getEnrichErrorMessage(err), { duration: 5000 });
    } finally {
      setEnriching(false);
    }
  };

  const handleSavePhonetic = async () => {
    if (!word) return;
    try {
      await updateWord(word.id, { phonetic });
      setWord({ ...word, phonetic });
      setEditingPhonetic(false);
      toast.success('Phonetic saved');
    } catch {
      toast.error('Failed to save phonetic');
    }
  };

  const clearDraft = async (wordId: number, defId: number | null) => {
    const key = `glm-words-ink-draft:user-${getCurrentUserId()}:detail-${wordId}-${defId ?? 'new'}`;
    await deleteDraftRecord(key);
    localStorage.removeItem(key);
    localStorage.removeItem(draftStorageKey);
    setRecoverable(false);
  };

  // Typed-definition editor
  const openTypedAdd = () => {
    setTypedAdding(true);
    setTypedEditId(null);
    setTypedForm(emptyTypedForm());
    setTypedBaseline(JSON.stringify(emptyTypedForm()));
    setSavedInputMode('keyboard');
    window.requestAnimationFrame(() => {
      typedEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const openTypedEdit = (def: Definition) => {
    setTypedAdding(false);
    setTypedEditId(def.id);
    setTypedForm({
      pos: def.pos,
      meaning_en: def.meaning_en,
      meaning_zh: def.meaning_zh === HANDWRITING_LABEL ? '' : def.meaning_zh,
    });
    setTypedBaseline(JSON.stringify({ pos: def.pos, meaning_en: def.meaning_en, meaning_zh: def.meaning_zh === HANDWRITING_LABEL ? '' : def.meaning_zh }));
    window.requestAnimationFrame(() => {
      typedEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const closeTyped = () => {
    setTypedAdding(false);
    setTypedEditId(null);
    setTypedForm(emptyTypedForm());
  };

  const handleSaveTyped = async () => {
    if (!word) return;
    if (savingTyped) return;
    const meaning = typedForm.meaning_zh.trim();
    if (!meaning) return;

    setSavingTyped(true);
    const payload = {
      pos: typedForm.pos,
      meaning_en: typedForm.meaning_en,
      meaning_zh: meaning,
      canvas_image: null,
      ink_data: null,
    };
    try {
      if (typedEditId !== null) {
        await updateDefinition(word.id, typedEditId, payload);
        toast.success('Definition updated');
      } else {
        await addDefinition(word.id, payload);
        toast.success('Definition added');
      }
      localStorage.removeItem(draftStorageKey); setRecoverable(false);
      closeTyped();
      fetchWord();
    } catch {
      toast.error('Failed to save definition');
    } finally {
      setSavingTyped(false);
    }
  };

  // Fullscreen handwriting editor
  const openHandwritingAdd = () => {
    setFullscreenEditId(null);
    setHandwritingDraft({ image: null, ink: null });
    setFullscreenInitial({ image: null, ink: null, pos: 'n.' });
    setSavedInputMode('handwriting');
    setFullscreenOpen(true);
  };

  const openHandwritingEdit = (def: Definition) => {
    setFullscreenEditId(def.id);
    setHandwritingDraft({ image: def.canvas_image, ink: def.ink_data });
    setFullscreenInitial({
      image: def.canvas_image,
      ink: def.ink_data,
      pos: def.pos,
    });
    setFullscreenOpen(true);
  };

  const closeHandwriting = () => {
    setFullscreenOpen(false);
    setFullscreenEditId(null);
    setFullscreenInitial({ image: null, ink: null, pos: 'n.' });
  };

  const handleSaveHandwriting = async (image: string | null, ink: string | null) => {
    if (!word) return;
    if (savingHandwriting) return;
    if (!image && !ink) return;

    setSavingHandwriting(true);
    const payload = {
      pos: fullscreenInitial.pos,
      meaning_en: '',
      meaning_zh: HANDWRITING_LABEL,
      canvas_image: image,
      ink_data: ink,
    };
    try {
      if (fullscreenEditId !== null) {
        await updateDefinition(word.id, fullscreenEditId, payload);
        toast.success('Definition updated');
      } else {
        await addDefinition(word.id, payload);
        toast.success('Definition added');
      }
      if (fullscreenEditId !== null) await clearDraft(word.id, fullscreenEditId);
      else await clearDraft(word.id, null);
      setFullscreenOpen(false);
      setFullscreenEditId(null);
      fetchWord();
    } catch {
      toast.error('Failed to save definition');
    } finally {
      setSavingHandwriting(false);
    }
  };

  const handleDeleteDefinition = async (def: Definition) => {
    if (!word) return;
    if (!window.confirm('Remove this definition?')) return;
    try {
      await deleteDefinition(word.id, def.id);
      toast.success('Definition removed');
      if (selectedDefId === def.id) {
        setSelectedDefId(null);
        userSelectedDefRef.current = false;
      }
      fetchWord();
    } catch {
      toast.error('Failed to delete definition');
    }
  };

  const handleSelectDef = (defId: number) => {
    setSelectedDefId(defId);
    userSelectedDefRef.current = true;
  };

  const handleSetPrimary = async (def: Definition) => {
    if (!word || def.is_primary) return;
    try {
      await updateDefinition(word.id, def.id, { is_primary: true });
      toast.success('Primary definition updated');
      setSelectedDefId(def.id);
      userSelectedDefRef.current = true;
      fetchWord();
    } catch {
      toast.error('Failed to update primary definition');
    }
  };

  const handleEditPrimary = () => {
    if (!primaryDef) return;
    if (isHandwritingDef(primaryDef)) {
      openHandwritingEdit(primaryDef);
    } else {
      openTypedEdit(primaryDef);
    }
  };

  if (loading) {
    return (
      <div className="page" aria-busy="true" aria-live="polite">
        <div className="skeleton h-4 w-16" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr] lg:gap-10">
          <div className="space-y-4">
            <div className="skeleton h-11 w-48" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-10 w-28" />
          </div>
          <div className="space-y-3">
            <div className="card h-40" />
            <div className="card h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!word) {
    return (
      <div className="page viewport-page flex items-center justify-center">
        <div className="empty max-w-md">
          <p className="text-lead font-semibold text-ink">This word is not here</p>
          <p className="max-w-[36ch] text-meta text-ink-mute">
            It may have been deleted, or it belongs to another account.
          </p>
          <Link to="/words" className="btn btn-secondary btn-sm mt-1">Back to words</Link>
        </div>
      </div>
    );
  }

  const hasMultiple = word.definitions.length > 1;
  const showTabStrip = hasMultiple;
  const isHandwritingPrimary = primaryDef ? isHandwritingDef(primaryDef) : false;
  const isAiPrimary = primaryDef ? isAiDefinition(primaryDef) : false;
  const isEditingTyped = typedAdding || typedEditId !== null;
  const otherDefs = primaryDef ? word.definitions.filter((d) => d.id !== primaryDef.id) : word.definitions;

  const statusTone = word.status === 'mastered' ? 'pill-good' : word.status === 'enriched' ? 'pill-brand' : 'pill-neutral';

  return (
    <div className="page">
      <UnsavedChangesDialog {...exitGuard.dialog} />

      {recoverable && (
        <button type="button" className="btn btn-secondary btn-block mb-5" onClick={restoreDraft}>
          Continue editing your draft
        </button>
      )}

      <button
        type="button"
        onClick={() => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/words'); }}
        className="btn btn-ghost btn-sm -ml-2.5 text-ink-mute"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </button>

      <div className="mt-5 grid gap-7 lg:grid-cols-[17rem_1fr] lg:gap-12">
        {/* ── Left: identity and the actions that belong to it ── */}
        <aside className="space-y-5">
          <div>
            <p className="eyebrow">Word</p>
            <h1 className="word mt-2.5 text-display text-ink">{word.text}</h1>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {editingPhonetic ? (
                <span className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={phonetic}
                    onChange={(e) => setPhonetic(e.target.value)}
                    placeholder="/ɪˈfem.ər.əl/"
                    aria-label="Phonetic"
                    className="field field-bare ipa w-44"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePhonetic()}
                  />
                  <button type="button" onClick={handleSavePhonetic} className="btn btn-ghost btn-sm">Save</button>
                  <button
                    type="button"
                    onClick={() => { setEditingPhonetic(false); setPhonetic(word.phonetic || ''); }}
                    className="btn btn-ghost btn-sm text-ink-mute"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPhonetic(true)}
                  className="ipa -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 transition hover:bg-well hover:text-ink-soft"
                >
                  {word.phonetic || '+ add phonetic'}
                </button>
              )}
              <span className={`pill ${statusTone}`}>{word.status}</span>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-line pt-5">
            <p className="eyebrow">Add a definition</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => exitGuard.requestExit(openHandwritingAdd)}
                className="btn btn-primary btn-sm"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                Write
              </button>
              <button
                type="button"
                onClick={() => exitGuard.requestExit(openTypedAdd)}
                className="btn btn-secondary btn-sm"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 7h14M5 12h9M5 17h6" />
                </svg>
                Type
              </button>
            </div>
          </div>

          <div className="space-y-2.5 border-t border-line pt-5">
            <p className="eyebrow">AI assist</p>
            <button
              type="button"
              onClick={handleEnrich}
              disabled={enriching}
              className="btn btn-secondary btn-sm btn-block"
            >
              {enriching && (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {enriching ? 'Suggesting…' : word.definitions.some(isAiDefinition) ? 'Suggest again' : 'Suggest a definition'}
            </button>
            <p className="text-micro leading-relaxed text-ink-mute">
              Adds a Chinese meaning and one example. Your handwritten cards are never replaced.
            </p>
          </div>
        </aside>

        {/* ── Right: the definition itself, then everything else ── */}
        <main className="min-w-0 space-y-4">
          {primaryDef ? (
            <article className="card card-raised overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="pill pill-brand uppercase tracking-wide">{primaryDef.pos}</span>
                  {primaryDef.is_primary
                    ? <span className="pill pill-neutral">Primary</span>
                    : (
                      <button
                        type="button"
                        onClick={() => void handleSetPrimary(primaryDef)}
                        className="btn btn-ghost btn-sm"
                      >
                        Set as primary
                      </button>
                    )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => exitGuard.requestExit(handleEditPrimary)}
                    className="btn btn-ghost btn-sm"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDefinition(primaryDef)}
                    className="btn btn-danger btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </header>

              <div className="px-5 py-5">
                {isHandwritingPrimary && primaryDef.canvas_image ? (
                  <img
                    src={primaryDef.canvas_image}
                    alt={`${word.text} handwritten definition`}
                    className="mx-auto w-full max-w-xl rounded-md border border-line bg-surface"
                  />
                ) : isHandwritingPrimary ? (
                  <p className="rounded-md border border-warn/25 bg-warn-wash px-4 py-3 text-micro text-warn">
                    The handwritten source is stored, but its preview is rebuilt the next time you edit it.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xl leading-snug text-ink">{primaryDef.meaning_zh}</p>
                    {primaryDef.meaning_en && !isAiPrimary && (
                      <p className="text-lead leading-relaxed text-ink-mute">{primaryDef.meaning_en}</p>
                    )}
                    {primaryDef.examples?.length > 0 && (
                      <div className="mt-5 space-y-3.5 border-t border-line pt-5">
                        {primaryDef.examples.slice(0, 2).map((example) => (
                          <div key={`${example.order}-${example.sentence_en}`} className="space-y-1">
                            <p className="text-lead leading-relaxed text-ink-soft">{example.sentence_en}</p>
                            {example.sentence_zh && (
                              <p className="text-meta leading-relaxed text-ink-mute">{example.sentence_zh}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          ) : (
            <div className="empty">
              <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-ink-mute">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </span>
              <p className="text-lead font-semibold text-ink">No definition yet</p>
              <p className="max-w-[38ch] text-meta text-ink-mute">
                Write it by hand for a card you will recognise, or type it if you are in a hurry.
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => exitGuard.requestExit(openHandwritingAdd)} className="btn btn-primary btn-sm">
                  Write definition
                </button>
                <button type="button" onClick={() => exitGuard.requestExit(openTypedAdd)} className="btn btn-secondary btn-sm">
                  Type definition
                </button>
              </div>
            </div>
          )}

          {/* Inline typed-form editor */}
          {isEditingTyped && (
            <div ref={typedEditorRef} className="card card-raised p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-title font-semibold text-ink">
                  {typedEditId ? 'Edit typed definition' : 'New typed definition'}
                </p>
                <button
                  type="button"
                  onClick={() => exitGuard.requestExit(closeTyped)}
                  className="btn btn-ghost btn-sm text-ink-mute"
                >
                  Cancel
                </button>
              </div>
              <form
                className="mt-4 space-y-3.5"
                onSubmit={(e) => { e.preventDefault(); void handleSaveTyped(); }}
              >
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                  <div>
                    <label className="label" htmlFor="detail-pos">Part of speech</label>
                    <select
                      id="detail-pos"
                      value={typedForm.pos}
                      onChange={(e) => setTypedForm({ ...typedForm, pos: e.target.value })}
                      className="field"
                    >
                      {POS_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="detail-meaning-en">
                      English note <span className="font-normal text-ink-mute">optional</span>
                    </label>
                    <input
                      id="detail-meaning-en"
                      type="text"
                      value={typedForm.meaning_en}
                      onChange={(e) => setTypedForm({ ...typedForm, meaning_en: e.target.value })}
                      placeholder="A gloss in your own words"
                      className="field"
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="detail-meaning-zh">Meaning</label>
                  <textarea
                    id="detail-meaning-zh"
                    value={typedForm.meaning_zh}
                    onChange={(e) => setTypedForm({ ...typedForm, meaning_zh: e.target.value })}
                    placeholder="中文释义"
                    rows={3}
                    autoFocus
                    className="field"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!typedForm.meaning_zh.trim() || savingTyped}
                    className="btn btn-primary"
                  >
                    {savingTyped ? 'Saving…' : typedEditId ? 'Update definition' : 'Save definition'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Other definitions */}
          {showTabStrip && (
            <section className="border-t border-line pt-5">
              <p className="eyebrow mb-3">{otherDefs.length} more {otherDefs.length === 1 ? 'definition' : 'definitions'}</p>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {otherDefs.map((def) => (
                  <li key={def.id} className="card card-interactive flex items-center gap-3 p-2.5">
                    <button
                      type="button"
                      onClick={() => handleSelectDef(def.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {/* The tile marks the medium; the pill below already prints the
                          part of speech, so repeating it here was pure noise. */}
                      {isHandwritingDef(def) && def.canvas_image ? (
                        <img src={def.canvas_image} alt="" className="h-12 w-10 shrink-0 rounded-sm border border-line object-cover" />
                      ) : (
                        <span
                          className="grid h-12 w-10 shrink-0 place-items-center rounded-sm border border-line bg-well text-ink-mute"
                          title={isHandwritingDef(def) ? 'Handwritten' : 'Typed'}
                        >
                          {isHandwritingDef(def) ? (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                            </svg>
                          ) : (
                            <span className="text-micro font-semibold">T</span>
                          )}
                        </span>
                      )}
                      <span className="flex min-w-0 flex-col">
                        <span className="pill pill-neutral mb-1 w-fit">{def.pos}</span>
                        <span className="truncate text-meta text-ink-soft">{definitionLabel(def)}</span>
                      </span>
                    </button>
                    {def.is_primary ? (
                      <span className="pill pill-brand shrink-0">Primary</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSetPrimary(def)}
                        className="btn btn-ghost btn-sm shrink-0"
                      >
                        Pin
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>

      <CanvasFullscreen
        key={`${word.id}-${fullscreenEditId ?? 'new'}-${fullscreenOpen ? 'open' : 'closed'}`}
        open={fullscreenOpen}
        title={fullscreenEditId !== null ? `Edit ${word.text}` : `Write definition for ${word.text}`}
        initialImage={fullscreenInitial.image}
        initialInk={fullscreenInitial.ink}
        draftKey={`detail-${word.id}-${fullscreenEditId ?? 'new'}`}
        resetKey={`${word.id}-${fullscreenEditId ?? 'new'}-fs`}
        saving={savingHandwriting}
        onSave={handleSaveHandwriting}
        onCancel={() => exitGuard.requestExit(closeHandwriting)}
        onDraftChange={onDraftChange}
      />
    </div>
  );
}