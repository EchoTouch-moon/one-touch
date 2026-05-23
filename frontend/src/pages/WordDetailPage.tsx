import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { WordDetail, Definition } from '../types/word';
import api from '../api/client';
import { addDefinition, deleteDefinition, updateDefinition, updateWord } from '../api/words';
import { enrichWord, getEnrichErrorMessage } from '../api/enrich';
import CanvasFullscreen from '../components/CanvasFullscreen';
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

  const setSavedInputMode = useSettingsStore((s) => s.setDefinitionInputMode);

  const fetchWord = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<WordDetail>(`/words/${id}`)
      .then((res) => {
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

  const clearDraft = (wordId: number, defId: number | null) => {
    try {
      window.localStorage.removeItem(`glm-words-ink-draft:detail-${wordId}-${defId ?? 'new'}`);
    } catch {
      // best-effort
    }
  };

  // Typed-definition editor
  const openTypedAdd = () => {
    setTypedAdding(true);
    setTypedEditId(null);
    setTypedForm(emptyTypedForm());
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
    setFullscreenInitial({ image: null, ink: null, pos: 'n.' });
    setSavedInputMode('handwriting');
    setFullscreenOpen(true);
  };

  const openHandwritingEdit = (def: Definition) => {
    setFullscreenEditId(def.id);
    setFullscreenInitial({
      image: def.canvas_image,
      ink: def.ink_data,
      pos: def.pos,
    });
    setFullscreenOpen(true);
  };

  const closeHandwriting = () => {
    if (word) clearDraft(word.id, fullscreenEditId);
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
      if (fullscreenEditId !== null) clearDraft(word.id, fullscreenEditId);
      else clearDraft(word.id, null);
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

  const handleEditPrimary = () => {
    if (!primaryDef) return;
    if (isHandwritingDef(primaryDef)) {
      openHandwritingEdit(primaryDef);
    } else {
      openTypedEdit(primaryDef);
    }
  };

  if (loading) return <p className="py-8 text-center text-gray-400">Loading...</p>;
  if (!word) return <p className="py-8 text-center text-gray-400">Word not found</p>;

  const hasMultiple = word.definitions.length > 1;
  const showTabStrip = hasMultiple;
  const isHandwritingPrimary = primaryDef ? isHandwritingDef(primaryDef) : false;
  const isAiPrimary = primaryDef ? isAiDefinition(primaryDef) : false;
  const isEditingTyped = typedAdding || typedEditId !== null;
  const otherDefs = primaryDef ? word.definitions.filter((d) => d.id !== primaryDef.id) : word.definitions;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6 lg:py-8">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-indigo-500 hover:underline"
      >
        &larr; Back
      </button>

      <div className="mt-4 grid gap-6 lg:grid-cols-[18rem_1fr] lg:gap-10">
        {/* Left aside: word identity */}
        <aside className="space-y-4">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 lg:text-5xl">{word.text}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {editingPhonetic ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={phonetic}
                    onChange={(e) => setPhonetic(e.target.value)}
                    placeholder="/ɪˈfem.ər.əl/"
                    className="w-40 border-b border-gray-300 bg-transparent text-gray-500 focus:border-indigo-400 focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePhonetic()}
                  />
                  <button onClick={handleSavePhonetic} className="text-xs text-indigo-500 hover:underline">Save</button>
                  <button
                    onClick={() => { setEditingPhonetic(false); setPhonetic(word.phonetic || ''); }}
                    className="text-xs text-gray-400 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingPhonetic(true)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {word.phonetic || '+ Add phonetic'}
                </button>
              )}
              <span className={`rounded-full px-2 py-0.5 text-xs ${
                word.status === 'captured' ? 'bg-yellow-50 text-yellow-600'
                : word.status === 'enriched' ? 'bg-green-50 text-green-600'
                : 'bg-blue-50 text-blue-600'
              }`}>
                {word.status}
              </span>
            </div>
          </div>

          <button
            onClick={handleEnrich}
            disabled={enriching}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-50"
          >
            {enriching ? 'Loading...' : 'AI Enrich'}
          </button>

          {primaryDef && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-gray-400">Add another</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={openHandwritingAdd}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
                >
                  + Write
                </button>
                <button
                  onClick={openTypedAdd}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  + Type
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Right main: primary def + editor */}
        <main className="min-w-0 space-y-4">
          {primaryDef ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-medium uppercase tracking-wide text-indigo-500">{primaryDef.pos}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleEditPrimary}
                    className="rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteDefinition(primaryDef)}
                    className="rounded-md px-2 py-1 text-xs text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    title="Remove"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {isHandwritingPrimary && primaryDef.canvas_image ? (
                <img
                  src={primaryDef.canvas_image}
                  alt={`${word.text} handwritten definition`}
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-white"
                />
              ) : isHandwritingPrimary ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-600">
                  Handwritten source available, preview will be rebuilt on edit.
                </p>
              ) : (
                <div className="mt-3 space-y-2 rounded-xl border border-gray-200 bg-white p-5">
                  <p className="text-2xl leading-relaxed text-gray-800 lg:text-3xl">{primaryDef.meaning_zh}</p>
                  {primaryDef.meaning_en && !isAiPrimary && (
                    <p className="text-base leading-relaxed text-gray-500">{primaryDef.meaning_en}</p>
                  )}
                  {primaryDef.examples?.length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      {primaryDef.examples.slice(0, 2).map((example) => (
                        <div key={`${example.order}-${example.sentence_en}`} className="space-y-1">
                          <p className="text-sm leading-relaxed text-gray-700">{example.sentence_en}</p>
                          {example.sentence_zh && (
                            <p className="text-xs leading-relaxed text-gray-400">{example.sentence_zh}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
              <p className="text-sm text-gray-500">No definitions yet</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={openHandwritingAdd}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
                >
                  + Write definition
                </button>
                <button
                  onClick={openTypedAdd}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                >
                  + Type definition
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-400">
                Or use <button onClick={handleEnrich} className="text-indigo-500 hover:underline">AI Enrich</button> to suggest one.
              </p>
            </div>
          )}

          {/* Inline typed-form editor */}
          {isEditingTyped && (
            <div ref={typedEditorRef} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{typedEditId ? 'Edit typed definition' : 'New typed definition'}</p>
                <button
                  onClick={closeTyped}
                  className="rounded-md px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSaveTyped();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
                  <select
                    value={typedForm.pos}
                    onChange={(e) => setTypedForm({ ...typedForm, pos: e.target.value })}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  >
                    {POS_OPTIONS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={typedForm.meaning_en}
                    onChange={(e) => setTypedForm({ ...typedForm, meaning_en: e.target.value })}
                    placeholder="English meaning or note"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
                  />
                </div>
                <textarea
                  value={typedForm.meaning_zh}
                  onChange={(e) => setTypedForm({ ...typedForm, meaning_zh: e.target.value })}
                  placeholder="中文释义"
                  rows={3}
                  autoFocus
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-6 focus:border-indigo-400 focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!typedForm.meaning_zh.trim() || savingTyped}
                    className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-40"
                  >
                    {savingTyped ? 'Saving...' : typedEditId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab strip for other definitions */}
          {showTabStrip && (
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                {otherDefs.length} more
              </p>
              <div className="flex flex-wrap gap-2">
                {otherDefs.map((def) => (
                  <button
                    key={def.id}
                    onClick={() => handleSelectDef(def.id)}
                    className="group flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    {isHandwritingDef(def) && def.canvas_image ? (
                      <img
                        src={def.canvas_image}
                        alt=""
                        className="h-10 w-8 rounded border border-gray-100 object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-8 place-items-center rounded border border-gray-100 bg-gray-50 text-[10px] font-medium text-gray-400">
                        T
                      </span>
                    )}
                    <span className="flex flex-col text-xs">
                      <span className="font-medium text-gray-500">{def.pos}</span>
                      <span className="max-w-[8rem] truncate text-gray-700 group-hover:text-indigo-700">
                        {definitionLabel(def)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <CanvasFullscreen
        open={fullscreenOpen}
        title={fullscreenEditId !== null ? `Edit ${word.text}` : `Write definition for ${word.text}`}
        initialImage={fullscreenInitial.image}
        initialInk={fullscreenInitial.ink}
        draftKey={`detail-${word.id}-${fullscreenEditId ?? 'new'}`}
        resetKey={`${word.id}-${fullscreenEditId ?? 'new'}-fs`}
        saving={savingHandwriting}
        onSave={handleSaveHandwriting}
        onCancel={closeHandwriting}
      />
    </div>
  );
}
