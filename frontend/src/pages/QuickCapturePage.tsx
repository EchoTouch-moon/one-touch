import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUserId, getAuthSessionEpoch } from '../api/authSession';
import { deleteDraftRecord, flushDraftWrites } from '../components/canvas-pad/draftStore';
import UnsavedChangesDialog from '../components/UnsavedChangesDialog';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { motion, AnimatePresence } from 'framer-motion';
import { useWordStore } from '../store/wordStore';
import { useSettingsStore, type DefinitionInputMode } from '../store/settingsStore';
import { suggestWords, addDefinition, listWords, MAX_PAGE_SIZE } from '../api/words';
import { lookupKaoyanWord, type KaoyanLookup } from '../api/kaoyan';
import { ExamSentenceCard } from '../components/kaoyan/SentenceHighlight';
import toast from 'react-hot-toast';
import type { Word } from '../types/word';
import CanvasPad from '../components/CanvasPad';

const POS_OPTIONS = ['n.', 'v.', 'vi.', 'vt.', 'adj.', 'adv.', 'prep.', 'conj.', 'pron.', 'phr.'];

type Tab = 'definition' | 'usage';
type Phase = 'pos' | 'form';

interface DefEntry {
  pos: string;
  meaning_zh: string;
  example_en: string;
  canvas_image: string | null;
  ink_data: string | null;
}

interface UsageEntry {
  pattern: string;
  meaning_zh: string;
  example_en: string;
}

function DictionaryReference({ modal, onClose, children }: { modal: boolean; onClose: () => void; children: ReactNode }) {
  if (!modal) return <div className="max-h-64 space-y-3 overflow-y-auto border-t border-line p-4">{children}</div>;
  return <Dialog open onClose={onClose} className="relative z-50">
    <div className="fixed inset-0 bg-ink/35 backdrop-blur-[2px]" aria-hidden="true" />
    <div className="fixed inset-0 flex items-center justify-center p-4"><DialogPanel className="card card-float max-h-[80dvh] w-full max-w-lg space-y-3 overflow-y-auto p-5">
      <div className="flex items-center justify-between gap-3">
        <DialogTitle className="font-display text-title font-semibold text-ink">Dictionary reference</DialogTitle>
        <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Back to writing</button>
      </div>
      {children}
    </DialogPanel></div>
  </Dialog>;
}

export default function QuickCapturePage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const capturingRef = useRef(false);
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const draftStorageKey = `onetouch-capture-editor-v2:${getCurrentUserId()}`;
  const [recoverable, setRecoverable] = useState(() => window.localStorage.getItem(draftStorageKey) !== null);
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const isValidEnglish = /^[a-zA-Z]+(?:[-'][a-zA-Z]+)*$/.test(text.trim());

  // Panel state
  const [capturedWord, setCapturedWord] = useState<Word | null>(null);
  const [tab, setTab] = useState<Tab>('definition');
  const [phase, setPhase] = useState<Phase>('pos');
  const [posIdx, setPosIdx] = useState(0);
  const [defForm, setDefForm] = useState<DefEntry>({ pos: 'n.', meaning_zh: '', example_en: '', canvas_image: null, ink_data: null });
  const [usageForm, setUsageForm] = useState<UsageEntry>({ pattern: '', meaning_zh: '', example_en: '' });
  const [savedDefs, setSavedDefs] = useState<DefEntry[]>([]);
  const [savedUsages, setSavedUsages] = useState<UsageEntry[]>([]);
  const savedInputMode = useSettingsStore((s) => s.definitionInputMode);
  const setSavedInputMode = useSettingsStore((s) => s.setDefinitionInputMode);
  const [inputMode, setInputMode] = useState<DefinitionInputMode | null>(savedInputMode);
  const [kaoyanInfo, setKaoyanInfo] = useState<KaoyanLookup | null>(null);
  const [kaoyanExpanded, setKaoyanExpanded] = useState(false);
  const [kaoyanSaved, setKaoyanSaved] = useState(false);
  const [prevCapturedId, setPrevCapturedId] = useState<number | null>(null);

  const dirty = Boolean(defForm.meaning_zh.trim() || defForm.example_en.trim() || defForm.ink_data || defForm.canvas_image || usageForm.pattern.trim() || usageForm.meaning_zh.trim() || usageForm.example_en.trim());
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (!capturedWord) return;
    window.localStorage.setItem(draftStorageKey, JSON.stringify({ capturedWord, defForm, usageForm, savedDefs, savedUsages, inputMode, tab, kaoyanSaved }));
    await flushDraftWrites();
  }, [capturedWord, defForm, usageForm, savedDefs, savedUsages, inputMode, tab, kaoyanSaved, draftStorageKey]);
  const discardDraft = useCallback(async () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    if (capturedWord) {
      const key = `onetouch-ink-draft:user-${getCurrentUserId()}:word-${capturedWord.id}`;
      await deleteDraftRecord(key);
      window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem(draftStorageKey);
    setRecoverable(false);
  }, [capturedWord, draftStorageKey]);
  const exitGuard = useUnsavedChanges(dirty, keepDraft, discardDraft);
  const restoreDraft = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(draftStorageKey) ?? 'null');
      if (!saved?.capturedWord || !saved.defForm || !saved.usageForm) return;
      setCapturedWord(saved.capturedWord); setDefForm(saved.defForm); setUsageForm(saved.usageForm);
      setSavedDefs(saved.savedDefs ?? []); setSavedUsages(saved.savedUsages ?? []);
      setInputMode(saved.inputMode ?? 'keyboard'); setTab(saved.tab ?? 'definition'); setPhase('form');
      setKaoyanSaved(Boolean(saved.kaoyanSaved)); setPrevCapturedId(saved.capturedWord.id);
    } catch { toast.error('Could not restore this draft. It has been preserved.'); }
  };
  useEffect(() => {
    if (!dirty || !capturedWord) return;
    draftTimer.current = setTimeout(() => { void keepDraft().catch(() => undefined); }, 300);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [dirty, capturedWord, keepDraft]);

  const capturedId = capturedWord?.id ?? null;
  if (capturedId !== prevCapturedId) {
    setPrevCapturedId(capturedId);
    setKaoyanInfo(null);
    setKaoyanExpanded(false);
    setKaoyanSaved(false);
  }

  useEffect(() => {
    if (!capturedWord) return;
    let canceled = false;
    void lookupKaoyanWord(capturedWord.text)
      .then((data) => {
        if (!canceled && data.in_lexicon) setKaoyanInfo(data);
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [capturedWord]);

  const saveKaoyanDefinition = useCallback(async () => {
    if (!capturedWord || !kaoyanInfo?.translation || kaoyanSaved || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      await addDefinition(capturedWord.id, {
        pos: 'def.',
        meaning_zh: kaoyanInfo.translation,
        examples: (kaoyanInfo.sentences ?? []).map((s) => ({ sentence_en: s.text })),
      });
      setKaoyanSaved(true);
      window.localStorage.removeItem(draftStorageKey);
      setRecoverable(false);
      toast.success('Dictionary definition saved');
    } catch {
      toast.error('Failed to save');
    } finally { savingRef.current = false; setSaving(false); }
  }, [capturedWord, kaoyanInfo, kaoyanSaved, draftStorageKey]);

  const inputRef = useRef<HTMLInputElement>(null);
  const meaningRef = useRef<HTMLInputElement>(null);
  const usageRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const captureWord = useWordStore((s) => s.captureWord);
  const todayCount = sessionWords.length;
  const recentWords = sessionWords.slice(0, 8);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await suggestWords(q);
        setSuggestions(results);
        setSelectedIdx(-1);
        setShowDropdown(results.length > 0);
      } catch { setSuggestions([]); setShowDropdown(false); }
    }, 200);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    fetchSuggestions(e.target.value);
  }, [fetchSuggestions]);

  const applySuggestion = useCallback(async (word: string) => {
    const epoch = getAuthSessionEpoch();
    try {
      const result = await listWords({ q: word, page_size: MAX_PAGE_SIZE });
      if (epoch !== getAuthSessionEpoch()) return;
      const existing = result.items.find(item => item.text.toLowerCase() === word.toLowerCase());
      if (existing) navigate(`/words/${existing.id}`);
      else setText(word);
      setShowDropdown(false);
    } catch { toast.error('Could not open the existing card. Retry when connected.'); }
  }, [navigate]);

  const resetPanel = useCallback(() => {
    setCapturedWord(null);
    setTab('definition');
    setPhase('pos');
    setPosIdx(0);
    setDefForm({ pos: 'n.', meaning_zh: '', example_en: '', canvas_image: null, ink_data: null });
    setUsageForm({ pattern: '', meaning_zh: '', example_en: '' });
    setSavedDefs([]);
    setSavedUsages([]);
    setInputMode(savedInputMode);
  }, [savedInputMode]);

  const chooseInputMode = useCallback((mode: DefinitionInputMode) => {
    setInputMode(mode);
    setSavedInputMode(mode);
    if (mode === 'keyboard') {
      setTimeout(() => meaningRef.current?.focus(), 50);
    }
  }, [setSavedInputMode]);

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setPhase('form');
    if (t === 'definition') {
      setTimeout(() => meaningRef.current?.focus(), 50);
    } else {
      setTimeout(() => usageRef.current?.focus(), 50);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !isValidEnglish || capturingRef.current) return;
    if (showDropdown && selectedIdx >= 0) { await applySuggestion(suggestions[selectedIdx]); return; }
    capturingRef.current = true; setCapturing(true);
    const epoch = getAuthSessionEpoch();
    const word = await captureWord(trimmed);
    capturingRef.current = false; setCapturing(false);
    if (epoch !== getAuthSessionEpoch()) return;
    if (word) {
      setSessionWords(previous => [word, ...previous]);
      setCapturedWord(word);
      setPhase('form');
      setInputMode(savedInputMode);
      setText('');
      setSuggestions([]);
      setShowDropdown(false);
    } else {
      // The word already exists: open its card rather than stranding the user here.
      const existing = await listWords({ q: trimmed, page_size: MAX_PAGE_SIZE }).catch(() => null);
      if (epoch !== getAuthSessionEpoch()) return;
      const match = existing?.items.find(item => item.text.toLowerCase() === trimmed.toLowerCase());
      if (match) { navigate(`/words/${match.id}`); return; }
      toast.error(existing ? `"${trimmed}" is already in your library. Open Words to find it.` : 'Could not capture this word. Please retry.');
      inputRef.current?.focus();
    }
  }, [text, captureWord, isValidEnglish, savedInputMode, showDropdown, selectedIdx, applySuggestion, suggestions, navigate]);

  const clearHandwritingDraft = useCallback(async (wordId: number) => {
    const key = `onetouch-ink-draft:user-${getCurrentUserId()}:word-${wordId}`;
    await deleteDraftRecord(key);
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(draftStorageKey);
  }, [draftStorageKey]);

  const handleSaveDef = useCallback(async () => {
    const hasHandwriting = Boolean(defForm.canvas_image || defForm.ink_data);
    const meaning = defForm.meaning_zh.trim() || (hasHandwriting ? 'Handwritten definition' : '');
    if (!capturedWord || !meaning || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const examples = defForm.example_en.trim() ? [{ sentence_en: defForm.example_en }] : [];
      await addDefinition(capturedWord.id, {
        pos: defForm.pos,
        meaning_zh: meaning,
        canvas_image: defForm.canvas_image,
        ink_data: defForm.ink_data,
        examples,
      });
      if (hasHandwriting) await clearHandwritingDraft(capturedWord.id);
      setSavedDefs((prev) => [...prev, { ...defForm, meaning_zh: meaning }]);
      setDefForm({ pos: defForm.pos, meaning_zh: '', example_en: '', canvas_image: null, ink_data: null });
      setPhase('form');
      window.localStorage.removeItem(draftStorageKey);
      setRecoverable(false);
      toast.success('Saved');
    } catch { toast.error('Failed to save'); } finally { savingRef.current = false; setSaving(false); }
  }, [capturedWord, defForm, draftStorageKey, clearHandwritingDraft]);

  const handleSaveHandwriting = useCallback(async () => {
    if (!capturedWord || (!defForm.canvas_image && !defForm.ink_data) || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      await addDefinition(capturedWord.id, {
        pos: defForm.pos,
        meaning_zh: 'Handwritten definition',
        canvas_image: defForm.canvas_image,
        ink_data: defForm.ink_data,
      });
      await clearHandwritingDraft(capturedWord.id);
      window.localStorage.removeItem(draftStorageKey);
      setRecoverable(false);
      toast.success('Saved');
      resetPanel();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      toast.error('Failed to save');
    } finally { savingRef.current = false; setSaving(false); }
  }, [capturedWord, clearHandwritingDraft, defForm.canvas_image, defForm.ink_data, defForm.pos, resetPanel, draftStorageKey]);

  const handleSaveUsage = useCallback(async () => {
    if (!capturedWord || !usageForm.pattern.trim() || savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const examples = usageForm.example_en.trim() ? [{ sentence_en: usageForm.example_en }] : [];
      await addDefinition(capturedWord.id, {
        pos: 'phr.', meaning_zh: usageForm.meaning_zh || usageForm.pattern,
        collocations: [{ pattern: usageForm.pattern, meaning_zh: usageForm.meaning_zh }], examples,
      });
      setSavedUsages((prev) => [...prev, { ...usageForm }]);
      setUsageForm({ pattern: '', meaning_zh: '', example_en: '' });
      window.localStorage.removeItem(draftStorageKey);
      setRecoverable(false);
      toast.success('Saved');
    } catch { toast.error('Failed to save'); } finally { savingRef.current = false; setSaving(false); }
  }, [capturedWord, usageForm, draftStorageKey]);

  const handleDone = useCallback(() => {
    if (capturedWord && savedDefs.length === 0 && savedUsages.length === 0 && !kaoyanSaved) {
      toast.error('Please save at least one definition first');
      return;
    }
    exitGuard.requestExit(() => { resetPanel(); setRecoverable(window.localStorage.getItem(draftStorageKey) !== null); });
  }, [capturedWord, savedDefs.length, savedUsages.length, kaoyanSaved, resetPanel, exitGuard, draftStorageKey]);

  const handleCancelCaptured = () => {
    exitGuard.requestExit(() => { resetPanel(); setRecoverable(window.localStorage.getItem(draftStorageKey) !== null); });
  };

  // POS phase keyboard handler — arrows, numbers, enter
  const handlePosKeyDown = useCallback((e: React.KeyboardEvent) => {
    const confirmPos = (idx: number) => {
      setPosIdx(idx);
      setDefForm((f) => ({ ...f, pos: POS_OPTIONS[idx] }));
      setPhase('form');
      setTimeout(() => meaningRef.current?.focus(), 30);
    };

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setPosIdx((i) => (i + 1) % POS_OPTIONS.length);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPosIdx((i) => (i <= 0 ? POS_OPTIONS.length - 1 : i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmPos(posIdx);
      return;
    }
    const num = parseInt(e.key);
    if (num >= 1 && num <= POS_OPTIONS.length) {
      e.preventDefault();
      confirmPos(num - 1);
      return;
    }
    if (e.nativeEvent.isComposing) return;
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      switchTab('usage');
      return;
    }
    if (e.key === 'Escape') { handleDone(); return; }
  }, [posIdx, switchTab, handleDone]);

  // Form input keyboard handler
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent, fieldType: 'meaning' | 'example') => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      switchTab(tab === 'definition' ? 'usage' : 'definition');
      return;
    }
    if (e.key === 'Escape') { handleDone(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (tab === 'definition') {
        if (fieldType === 'meaning' && defForm.example_en === '' && !defForm.canvas_image) {
          // Tab to example field
          const exampleEl = (e.target as HTMLElement).nextElementSibling as HTMLElement;
          exampleEl?.focus();
        } else {
          handleSaveDef();
        }
      } else {
        if (fieldType === 'meaning' && usageForm.example_en === '') {
          const exampleEl = (e.target as HTMLElement).nextElementSibling as HTMLElement;
          exampleEl?.focus();
        } else {
          handleSaveUsage();
        }
      }
    }
  }, [tab, defForm, usageForm, handleSaveDef, handleSaveUsage, switchTab, handleDone]);

  // Capture input keyboard handler
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => (i + 1) % suggestions.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
      else if (e.key === 'Tab' && selectedIdx >= 0) { e.preventDefault(); applySuggestion(suggestions[selectedIdx]); }
      else if (e.key === 'Escape') { setShowDropdown(false); }
    }
  }, [showDropdown, suggestions, selectedIdx, applySuggestion]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Auto-focus when panel opens
  useEffect(() => {
    if (capturedWord) {
      if (tab === 'definition' && phase === 'pos') {
        const el = document.querySelector<HTMLElement>('[data-pos-panel]');
        setTimeout(() => el?.focus(), 50);
      } else if (tab === 'definition' && phase === 'form') {
        setTimeout(() => meaningRef.current?.focus(), 50);
      } else {
        setTimeout(() => usageRef.current?.focus(), 50);
      }
    }
  }, [capturedWord, tab, phase]);

  // ── Panel UI ──
  if (capturedWord) {
    if (!inputMode) {
      return (
        <div className="page viewport-page flex items-center justify-center">
          <UnsavedChangesDialog {...exitGuard.dialog} />
          <div className="w-full max-w-xl">
            <p className="eyebrow text-center">Definition for</p>
            <h1 className="word mt-3 text-center text-display text-ink sm:text-word">{capturedWord.text}</h1>
            <p className="mx-auto mt-4 max-w-[36ch] text-center text-meta text-ink-mute">
              Write it by hand for a card you will actually recognise, or type it if you are in a hurry.
            </p>

            <div className="mt-9 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseInputMode('handwriting')}
                className="card card-interactive group p-6 text-left"
              >
                <span className="grid h-11 w-11 place-items-center rounded-md border border-line bg-well text-ink-soft transition-colors group-hover:border-brand-line group-hover:bg-brand-wash group-hover:text-brand-deep">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </span>
                <span className="mt-4 block font-display text-title font-semibold text-ink">Handwriting</span>
                <span className="mt-1.5 block text-micro leading-relaxed text-ink-mute">
                  A full canvas, stored as ink and shown back to you as your own card.
                </span>
              </button>

              <button
                type="button"
                onClick={() => chooseInputMode('keyboard')}
                className="card card-interactive group p-6 text-left"
              >
                <span className="grid h-11 w-11 place-items-center rounded-md border border-line bg-well text-ink-soft transition-colors group-hover:border-brand-line group-hover:bg-brand-wash group-hover:text-brand-deep">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h8" />
                  </svg>
                </span>
                <span className="mt-4 block font-display text-title font-semibold text-ink">Keyboard</span>
                <span className="mt-1.5 block text-micro leading-relaxed text-ink-mute">
                  Type the meaning and an optional example sentence. Fastest route.
                </span>
              </button>
            </div>

            <p className="mt-6 text-center text-micro text-ink-mute">
              You can add more definitions later from the word's card.
            </p>
          </div>
        </div>
      );
    }

    const kaoyanBanner = kaoyanInfo ? (
      <div className="mb-3 shrink-0 overflow-hidden rounded-md border border-brand-line bg-brand-wash/60">
        <button
          type="button"
          onClick={() => setKaoyanExpanded((v) => !v)}
          aria-expanded={kaoyanExpanded}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-brand-wash"
        >
          <span className="flex min-w-0 items-center gap-2 text-micro font-semibold text-brand-deep">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
              <path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
            </svg>
            <span className="truncate">In the Kaoyan dictionary</span>
            {(kaoyanInfo.sentences?.length ?? 0) > 0 && (
              <span className="pill pill-accent shrink-0">
                {kaoyanInfo.sentences?.length ?? 0} exam sentences
              </span>
            )}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 text-brand-deep transition-transform duration-[var(--dur-base)] ${kaoyanExpanded ? 'rotate-90' : ''}`}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {kaoyanExpanded && (
          <DictionaryReference modal={inputMode === 'handwriting'} onClose={() => setKaoyanExpanded(false)}>
            <div className="text-meta leading-relaxed text-ink-soft">
              {(kaoyanInfo.translation ?? '').split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            {(kaoyanInfo.sentences ?? []).map((s) => (
              <ExamSentenceCard key={s.id} sentence={s} word={capturedWord.text} />
            ))}
            <button
              type="button"
              onClick={saveKaoyanDefinition}
              disabled={kaoyanSaved || saving}
              className="btn btn-secondary btn-block"
            >
              {kaoyanSaved ? 'Saved as a text definition' : 'Save definition and examples'}
            </button>
          </DictionaryReference>
        )}
      </div>
    ) : null;

    if (inputMode === 'handwriting') {
      return (
        <div className="capture-editor flex flex-col px-3 py-3 sm:px-4">
          <UnsavedChangesDialog {...exitGuard.dialog} />
          <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-2">
              <button type="button" onClick={handleCancelCaptured} className="btn btn-secondary btn-sm shrink-0">
                Back
              </button>
              <div className="min-w-0 text-center">
                <p className="eyebrow">Handwritten definition</p>
                <h1 className="word mt-1 truncate text-xl text-ink">{capturedWord.text}</h1>
              </div>
              <button type="button" onClick={() => chooseInputMode('keyboard')} className="btn btn-ghost btn-sm shrink-0">
                Keyboard
              </button>
            </div>

            {kaoyanBanner}

            <CanvasPad
              fullHeight
              value={defForm.canvas_image}
              onChange={(value) => setDefForm((f) => ({ ...f, canvas_image: value }))}
              inkValue={defForm.ink_data}
              onInkChange={(value) => setDefForm((f) => ({ ...f, ink_data: value }))}
              resetKey={capturedWord.id}
              draftKey={`word-${capturedWord.id}`}
              className="min-h-0 flex-1"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveHandwriting}
                disabled={saving || (!defForm.canvas_image && !defForm.ink_data)}
                className="btn btn-primary"
              >
                {saving ? 'Saving…' : 'Save & next'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="page flex flex-col items-center">
        <div className="w-full max-w-lg">
          <UnsavedChangesDialog {...exitGuard.dialog} />
          {recoverable && (
            <button type="button" onClick={restoreDraft} className="btn btn-secondary btn-block mb-4">
              Continue editing your draft
            </button>
          )}

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="text-center">
              <p className="eyebrow">Definition for</p>
              <motion.h1
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.04, type: 'spring', stiffness: 260, damping: 24 }}
                className="word mt-3 text-display text-ink"
              >
                {capturedWord.text}
              </motion.h1>
            </div>

            {kaoyanBanner}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-well p-1">
                <button
                  type="button"
                  aria-pressed={tab === 'definition'}
                  onClick={() => switchTab('definition')}
                  className={`h-9 rounded-md px-3.5 text-micro font-semibold transition ${
                    tab === 'definition' ? 'bg-surface text-ink shadow-hair' : 'text-ink-mute hover:text-ink'
                  }`}
                >
                  Definition
                </button>
                <button
                  type="button"
                  aria-pressed={tab === 'usage'}
                  onClick={() => switchTab('usage')}
                  className={`h-9 rounded-md px-3.5 text-micro font-semibold transition ${
                    tab === 'usage' ? 'bg-surface text-ink shadow-hair' : 'text-ink-mute hover:text-ink'
                  }`}
                >
                  Usage
                </button>
              </div>
              <button type="button" onClick={() => chooseInputMode('handwriting')} className="btn btn-ghost btn-sm -mr-2.5">
                Write by hand
              </button>
            </div>

            <AnimatePresence>
              {(savedDefs.length > 0 || savedUsages.length > 0) && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 space-y-1.5 overflow-hidden"
                >
                  {savedDefs.map((d, i) => (
                    <motion.li
                      key={`${d.pos}-${d.meaning_zh}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2.5 text-meta text-ink-soft"
                    >
                      <span className="pill pill-brand">{d.pos}</span>
                      <span className="truncate">{d.meaning_zh}</span>
                    </motion.li>
                  ))}
                  {savedUsages.map((u, i) => (
                    <motion.li
                      key={`${u.pattern}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2.5 text-meta text-ink-soft"
                    >
                      <span className="pill pill-neutral">phr.</span>
                      <span className="truncate">{u.pattern} — {u.meaning_zh}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>

            <div className="card mt-3 p-5 outline-none">
              <AnimatePresence mode="wait">
                {tab === 'definition' && phase === 'pos' && (
                  <motion.div
                    key="pos"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16 }}
                    data-pos-panel
                    tabIndex={0}
                    onKeyDown={handlePosKeyDown}
                    className="outline-none"
                  >
                    <p className="mb-3 flex flex-wrap items-center justify-center gap-1.5 text-micro text-ink-mute">
                      Part of speech
                      <span className="flex items-center gap-1">
                        <kbd className="kbd">←</kbd>
                        <kbd className="kbd">→</kbd>
                        or
                        <kbd className="kbd">1–9</kbd>
                        to move,
                        <kbd className="kbd">Enter</kbd>
                        to confirm
                      </span>
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {POS_OPTIONS.map((p, i) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setPosIdx(i);
                            setDefForm((f) => ({ ...f, pos: p }));
                            setPhase('form');
                            setTimeout(() => meaningRef.current?.focus(), 30);
                          }}
                          className={`rounded-md border px-3 py-2 text-meta transition ${
                            posIdx === i
                              ? 'border-ink bg-ink text-[#f7f4ee]'
                              : 'border-line-strong bg-surface text-ink-soft hover:border-ink-faint hover:text-ink'
                          }`}
                        >
                          <span className={`num mr-1.5 text-xs ${posIdx === i ? 'text-white/55' : 'text-ink-mute'}`}>{i + 1}</span>
                          {p}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {tab === 'definition' && phase === 'form' && (
                  <motion.div
                    key="def-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16 }}
                    className="space-y-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="pill pill-brand">{defForm.pos}</span>
                      <button type="button" onClick={() => setPhase('pos')} className="text-micro text-ink-mute transition hover:text-ink">
                        change
                      </button>
                    </div>
                    <div>
                      <label className="label" htmlFor="capture-meaning">Meaning</label>
                      <input
                        id="capture-meaning"
                        ref={meaningRef}
                        type="text"
                        value={defForm.meaning_zh}
                        onChange={(e) => setDefForm((f) => ({ ...f, meaning_zh: e.target.value }))}
                        onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                        placeholder="中文释义"
                        aria-label="Chinese meaning"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="capture-example">
                        Example sentence <span className="font-normal text-ink-mute">optional</span>
                      </label>
                      <input
                        id="capture-example"
                        type="text"
                        value={defForm.example_en}
                        onChange={(e) => setDefForm((f) => ({ ...f, example_en: e.target.value }))}
                        onKeyDown={(e) => handleFormKeyDown(e, 'example')}
                        placeholder="A sentence you would actually use"
                        className="field"
                      />
                    </div>
                    <button type="button" onClick={handleSaveDef} disabled={saving || !defForm.meaning_zh.trim()} className="btn btn-primary btn-block">
                      {saving ? 'Saving…' : 'Save definition'}
                    </button>
                  </motion.div>
                )}

                {tab === 'usage' && (
                  <motion.div
                    key="usage-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.16 }}
                    className="space-y-3.5"
                  >
                    <div>
                      <label className="label" htmlFor="capture-pattern">Usage pattern</label>
                      <input
                        id="capture-pattern"
                        ref={usageRef}
                        type="text"
                        value={usageForm.pattern}
                        onChange={(e) => setUsageForm((f) => ({ ...f, pattern: e.target.value }))}
                        onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                        placeholder="e.g. make progress"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="capture-usage-meaning">Meaning</label>
                      <input
                        id="capture-usage-meaning"
                        type="text"
                        value={usageForm.meaning_zh}
                        onChange={(e) => setUsageForm((f) => ({ ...f, meaning_zh: e.target.value }))}
                        onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                        placeholder="中文释义"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="capture-usage-example">
                        Example sentence <span className="font-normal text-ink-mute">optional</span>
                      </label>
                      <input
                        id="capture-usage-example"
                        type="text"
                        value={usageForm.example_en}
                        onChange={(e) => setUsageForm((f) => ({ ...f, example_en: e.target.value }))}
                        onKeyDown={(e) => handleFormKeyDown(e, 'example')}
                        placeholder="A sentence you would actually use"
                        className="field"
                      />
                    </div>
                    <button type="button" disabled={saving || !usageForm.pattern.trim()} onClick={handleSaveUsage} className="btn btn-primary btn-block">
                      {saving ? 'Saving…' : 'Save usage'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-micro text-ink-mute">
                  <span className="flex items-center gap-1.5"><kbd className="kbd">~</kbd> switch</span>
                  <span className="flex items-center gap-1.5"><kbd className="kbd">Enter</kbd> save</span>
                  <span className="flex items-center gap-1.5"><kbd className="kbd">Esc</kbd> done</span>
                </span>
                <button type="button" onClick={handleDone} className="btn btn-ghost btn-sm -mr-2.5">Done</button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Capture input UI ──
  return (
    <div className="page viewport-page flex flex-col items-center justify-center">
      <div className="w-full max-w-xl">
        <UnsavedChangesDialog {...exitGuard.dialog} />

        {recoverable && (
          <button type="button" onClick={restoreDraft} className="btn btn-secondary btn-block mb-7">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
            Continue your unsaved draft
          </button>
        )}

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="eyebrow text-center">Capture</p>
          <h1 className="mt-3 text-center font-display text-display font-semibold text-ink">
            What word did you meet today?
          </h1>
          <p className="mx-auto mt-4 max-w-[38ch] text-center text-meta text-ink-mute">
            Type it here. On the next screen you decide whether to write the meaning by hand.
          </p>

          {/* The input is a ruled writing line rather than a box — the product's
              whole premise, stated in the first control a user touches. */}
          <form onSubmit={handleSubmit} className="relative mx-auto mt-10 max-w-md">
            <label htmlFor="capture-word" className="sr-only">Word to capture</label>
            <input
              id="capture-word"
              ref={inputRef}
              type="text"
              value={text}
              onChange={handleChange}
              onKeyDown={handleInputKeyDown}
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="capture-suggestions"
              aria-autocomplete="list"
              aria-activedescendant={selectedIdx >= 0 ? `capture-option-${selectedIdx}` : undefined}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder="e.g. perspective"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              className={`word w-full border-0 border-b-2 bg-transparent px-2 pb-2.5 text-center text-display text-ink
                          outline-none transition-colors duration-[var(--dur-base)]
                          placeholder:font-sans placeholder:text-lead placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-mute
                          sm:text-word
                          ${text.trim() && !isValidEnglish
                            ? 'border-warn'
                            : 'border-line-strong focus:border-brand'}`}
            />

            <AnimatePresence>
              {showDropdown && suggestions.length > 0 && (
                <motion.ul
                  id="capture-suggestions"
                  role="listbox"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-md border border-line bg-surface shadow-lift"
                >
                  {suggestions.map((word, idx) => (
                    <li
                      key={word}
                      id={`capture-option-${idx}`}
                      role="option"
                      aria-selected={idx === selectedIdx}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void applySuggestion(word)}
                      className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-meta transition-colors ${
                        idx === selectedIdx ? 'bg-brand-wash text-brand-deep' : 'text-ink-soft hover:bg-well'
                      }`}
                    >
                      <span className="truncate">{word}</span>
                      <span className="shrink-0 text-micro text-ink-mute">already saved</span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>

            <div className="mt-4 flex min-h-6 items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {text.trim() && !isValidEnglish ? (
                  <motion.p
                    key="invalid"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16 }}
                    className="text-micro text-warn"
                  >
                    Letters only — hyphens and apostrophes are fine.
                  </motion.p>
                ) : (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="text-micro text-ink-mute"
                  >
                    <span className="hover-only">Enter to capture</span>
                    <span className="touch-only">Letters, hyphens and apostrophes</span>
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={capturing || !isValidEnglish}
              className="btn btn-primary btn-lg btn-block"
            >
              {capturing ? 'Capturing…' : 'Capture word'}
            </button>
          </form>
        </motion.div>

        <div className="mt-7 flex items-center justify-center gap-2 text-micro text-ink-mute">
          <span className="font-variant-numeric tabular-nums text-ink-soft">{todayCount}</span>
          {todayCount === 1 ? 'word captured this session' : 'words captured this session'}
        </div>

        {recentWords.length > 0 && (
          <div className="mt-8 border-t border-line pt-6">
            <h2 className="eyebrow mb-3.5 text-center">Recently captured</h2>
            <ul className="flex flex-wrap justify-center gap-2">
              {recentWords.map((w, index) => (
                <li key={`${w.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => navigate(`/words/${w.id}`)}
                    className="card card-interactive flex min-h-11 items-center px-3.5 py-1.5"
                  >
                    <span className="word text-lead text-ink">{w.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
