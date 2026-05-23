import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWordStore } from '../store/wordStore';
import { useSettingsStore, type DefinitionInputMode } from '../store/settingsStore';
import { suggestWords, addDefinition } from '../api/words';
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

export default function QuickCapturePage() {
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

  const inputRef = useRef<HTMLInputElement>(null);
  const meaningRef = useRef<HTMLInputElement>(null);
  const usageRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const captureWord = useWordStore((s) => s.captureWord);
  const words = useWordStore((s) => s.words);
  const todayCount = words.length;
  const recentWords = words.slice(0, 8);

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

  const applySuggestion = useCallback((word: string) => {
    setText(word);
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  }, []);

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
    if (!trimmed || !isValidEnglish) return;
    const word = await captureWord(trimmed);
    if (word) {
      setCapturedWord(word);
      setPhase('form');
      setInputMode(savedInputMode);
      setText('');
      setSuggestions([]);
      setShowDropdown(false);
    } else {
      toast.error('Word already exists or failed');
      inputRef.current?.focus();
    }
  }, [text, captureWord, isValidEnglish, savedInputMode]);

  const handleSaveDef = useCallback(async () => {
    const hasHandwriting = Boolean(defForm.canvas_image || defForm.ink_data);
    const meaning = defForm.meaning_zh.trim() || (hasHandwriting ? 'Handwritten definition' : '');
    if (!capturedWord || !meaning) return;
    try {
      const examples = defForm.example_en.trim() ? [{ sentence_en: defForm.example_en }] : [];
      await addDefinition(capturedWord.id, {
        pos: defForm.pos,
        meaning_zh: meaning,
        canvas_image: defForm.canvas_image,
        ink_data: defForm.ink_data,
        examples,
      });
      setSavedDefs((prev) => [...prev, { ...defForm, meaning_zh: meaning }]);
      setDefForm({ pos: defForm.pos, meaning_zh: '', example_en: '', canvas_image: null, ink_data: null });
      setPhase('form');
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
  }, [capturedWord, defForm]);

  const clearHandwritingDraft = useCallback((wordId: number) => {
    try {
      window.localStorage.removeItem(`glm-words-ink-draft:word-${wordId}`);
    } catch {
      // Draft cleanup is best-effort.
    }
  }, []);

  const handleSaveHandwriting = useCallback(async () => {
    if (!capturedWord || (!defForm.canvas_image && !defForm.ink_data)) return;
    try {
      await addDefinition(capturedWord.id, {
        pos: defForm.pos,
        meaning_zh: 'Handwritten definition',
        canvas_image: defForm.canvas_image,
        ink_data: defForm.ink_data,
      });
      clearHandwritingDraft(capturedWord.id);
      toast.success('Saved');
      resetPanel();
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch {
      toast.error('Failed to save');
    }
  }, [capturedWord, clearHandwritingDraft, defForm.canvas_image, defForm.ink_data, defForm.pos, resetPanel]);

  const handleSaveUsage = useCallback(async () => {
    if (!capturedWord || !usageForm.pattern.trim()) return;
    try {
      const examples = usageForm.example_en.trim() ? [{ sentence_en: usageForm.example_en }] : [];
      await addDefinition(capturedWord.id, {
        pos: 'phr.', meaning_zh: usageForm.meaning_zh || usageForm.pattern,
        collocations: [{ pattern: usageForm.pattern, meaning_zh: usageForm.meaning_zh }], examples,
      });
      setSavedUsages((prev) => [...prev, { ...usageForm }]);
      setUsageForm({ pattern: '', meaning_zh: '', example_en: '' });
      toast.success('Saved');
    } catch { toast.error('Failed to save'); }
  }, [capturedWord, usageForm]);

  const handleDone = useCallback(() => {
    if (capturedWord && savedDefs.length === 0 && savedUsages.length === 0) {
      toast.error('Please save at least one definition first');
      return;
    }
    resetPanel();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [capturedWord, savedDefs.length, savedUsages.length, resetPanel]);

  const handleCancelCaptured = useCallback(() => {
    if (capturedWord) clearHandwritingDraft(capturedWord.id);
    resetPanel();
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [capturedWord, clearHandwritingDraft, resetPanel]);

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
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      switchTab('usage');
      return;
    }
    if (e.key === 'Escape') { handleDone(); return; }
  }, [posIdx, switchTab, handleDone]);

  // Form input keyboard handler
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent, fieldType: 'meaning' | 'example') => {
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
        <div className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-4">
          <div className="w-full max-w-xl">
            <p className="mb-2 text-center text-sm text-gray-400">Choose definition input for</p>
            <h1 className="mb-8 text-center text-4xl font-semibold text-gray-950">{capturedWord.text}</h1>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseInputMode('handwriting')}
                className="rounded-xl border border-indigo-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50"
              >
                <span className="block text-lg font-semibold text-gray-900">Handwriting</span>
                <span className="mt-2 block text-sm leading-6 text-gray-500">Open a full canvas and save the handwritten card.</span>
              </button>
              <button
                type="button"
                onClick={() => chooseInputMode('keyboard')}
                className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-gray-400 hover:bg-gray-50"
              >
                <span className="block text-lg font-semibold text-gray-900">Keyboard</span>
                <span className="mt-2 block text-sm leading-6 text-gray-500">Type a text definition and optional example.</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (inputMode === 'handwriting') {
      return (
        <div className="flex min-h-[calc(100dvh-3rem)] flex-col bg-gray-50 px-3 py-3 sm:min-h-[calc(100dvh-3.5rem)] sm:px-5 sm:py-5">
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCancelCaptured}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Back
              </button>
              <div className="min-w-0 text-center">
                <p className="text-xs font-medium uppercase text-gray-300">Handwritten definition</p>
                <h1 className="truncate text-3xl font-semibold text-gray-950">{capturedWord.text}</h1>
              </div>
              <button
                type="button"
                onClick={() => chooseInputMode('keyboard')}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
              >
                Keyboard
              </button>
            </div>

            <CanvasPad
              value={defForm.canvas_image}
              onChange={(value) => setDefForm((f) => ({ ...f, canvas_image: value }))}
              inkValue={defForm.ink_data}
              onInkChange={(value) => setDefForm((f) => ({ ...f, ink_data: value }))}
              resetKey={capturedWord.id}
              draftKey={`word-${capturedWord.id}`}
              className="min-h-0 flex-1 shadow-sm"
            />

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveHandwriting}
                disabled={!defForm.canvas_image && !defForm.ink_data}
                className="rounded-lg bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-4">
        <div className="w-full max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <div className="text-center mb-5">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-gray-400"
              >
                Adding details for
              </motion.span>
              <motion.h1
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05, type: 'spring', stiffness: 200 }}
                className="text-3xl font-bold text-gray-900 mt-1"
              >
                {capturedWord.text}
              </motion.h1>
            </div>

            {/* Mode indicator */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-200 ${
                tab === 'definition' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400'
              }`}>
                Definition
              </span>
              <span className="text-gray-300 text-xs">~</span>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all duration-200 ${
                tab === 'usage' ? 'bg-green-100 text-green-700' : 'text-gray-400'
              }`}>
                Usage
              </span>
              <button
                type="button"
                onClick={() => chooseInputMode('handwriting')}
                className="text-xs font-medium text-gray-400 transition hover:text-indigo-600"
              >
                Handwriting
              </button>
            </div>

            {/* Saved entries */}
            <AnimatePresence>
              {savedDefs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-3 space-y-1 overflow-hidden"
                >
                  {savedDefs.map((d, i) => (
                    <motion.div
                      key={`${d.pos}-${d.meaning_zh}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-sm text-gray-500"
                    >
                      <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">{d.pos}</span>
                      <span>{d.meaning_zh}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {savedUsages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-3 space-y-1 overflow-hidden"
                >
                  {savedUsages.map((u, i) => (
                    <motion.div
                      key={`${u.pattern}-${i}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 text-sm text-gray-500"
                    >
                      <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">phr.</span>
                      <span>{u.pattern} — {u.meaning_zh}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Panel body */}
            <div
              className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 outline-none"
            >
              <AnimatePresence mode="wait">
                {tab === 'definition' && phase === 'pos' && (
                  <motion.div
                    key="pos"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    data-pos-panel
                    tabIndex={0}
                    onKeyDown={handlePosKeyDown}
                    className="outline-none"
                  >
                    <p className="text-xs text-gray-400 mb-3 text-center">
                      <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">←</kbd>
                      <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">→</kbd> or
                      <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">1-9</kbd> to select,
                      <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> to confirm
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {POS_OPTIONS.map((p, i) => (
                        <button
                          key={p}
                          onClick={() => {
                            setPosIdx(i);
                            setDefForm((f) => ({ ...f, pos: p }));
                            setPhase('form');
                            setTimeout(() => meaningRef.current?.focus(), 30);
                          }}
                          className={`px-3 py-1.5 text-sm rounded-lg border transition-all duration-150 ${
                            posIdx === i
                              ? 'bg-indigo-500 text-white border-indigo-500 scale-105'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                          }`}
                        >
                          <span className={`text-xs mr-1 ${posIdx === i ? 'text-indigo-200' : 'text-gray-400'}`}>{i + 1}</span>{p}
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
                    transition={{ duration: 0.15 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded">{defForm.pos}</span>
                      <button onClick={() => setPhase('pos')} className="text-xs text-gray-400 hover:text-gray-600">
                        change
                      </button>
                    </div>
                    <input
                      ref={meaningRef}
                      type="text"
                      value={defForm.meaning_zh}
                      onChange={(e) => setDefForm((f) => ({ ...f, meaning_zh: e.target.value }))}
                      onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                      placeholder="中文释义，可留空直接手写"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:border-indigo-400 focus:outline-none text-sm"
                    />
                    <input
                      type="text"
                      value={defForm.example_en}
                      onChange={(e) => setDefForm((f) => ({ ...f, example_en: e.target.value }))}
                      onKeyDown={(e) => handleFormKeyDown(e, 'example')}
                      placeholder="Example sentence (optional)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-400 focus:outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleSaveDef}
                      disabled={!defForm.meaning_zh.trim()}
                      className="w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-40"
                    >
                      Save definition
                    </button>
                  </motion.div>
                )}

                {tab === 'usage' && (
                  <motion.div
                    key="usage-form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-3"
                  >
                    <input
                      ref={usageRef}
                      type="text"
                      value={usageForm.pattern}
                      onChange={(e) => setUsageForm((f) => ({ ...f, pattern: e.target.value }))}
                      onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                      placeholder="Usage pattern (e.g. make progress)"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:border-indigo-400 focus:outline-none text-sm"
                    />
                    <input
                      type="text"
                      value={usageForm.meaning_zh}
                      onChange={(e) => setUsageForm((f) => ({ ...f, meaning_zh: e.target.value }))}
                      onKeyDown={(e) => handleFormKeyDown(e, 'meaning')}
                      placeholder="中文释义"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-400 focus:outline-none text-sm"
                    />
                    <input
                      type="text"
                      value={usageForm.example_en}
                      onChange={(e) => setUsageForm((f) => ({ ...f, example_en: e.target.value }))}
                      onKeyDown={(e) => handleFormKeyDown(e, 'example')}
                      placeholder="Example sentence (optional)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:border-indigo-400 focus:outline-none text-sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Footer hints */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  <kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">~</kbd> switch
                  {' '}<kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Enter</kbd> save
                  {' '}<kbd className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">Esc</kbd> done
                </span>
                <button onClick={handleDone} className="text-xs text-gray-400 hover:text-gray-600 transition">
                  Done
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Capture input UI ──
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold text-center text-gray-800 mb-8">
          Quick Capture
        </h1>

        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleInputKeyDown}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Type a word and press Enter..."
            autoFocus
            className={`w-full text-2xl text-center py-4 px-6 border-2 rounded-xl
                       focus:outline-none transition-colors placeholder:text-gray-300
                       ${text.trim() && !isValidEnglish
                         ? 'border-amber-300 focus:border-amber-400'
                         : 'border-gray-200 focus:border-indigo-400'}`}
          />

          <AnimatePresence>
            {showDropdown && suggestions.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200
                           rounded-lg shadow-lg overflow-hidden z-10"
              >
                {suggestions.map((word, idx) => (
                  <li
                    key={word}
                    onMouseDown={() => applySuggestion(word)}
                    className={`px-5 py-2.5 cursor-pointer text-base transition-colors
                      ${idx === selectedIdx ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {word}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>

          {text.trim() && !isValidEnglish && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-amber-500 text-center mt-2"
            >
              English word only (letters, hyphens allowed)
            </motion.p>
          )}
        </form>

        <p className="text-sm text-gray-400 text-center mt-4">
          {todayCount} word{todayCount !== 1 ? 's' : ''} in this session
        </p>

        {recentWords.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-gray-500 mb-3">Recently captured</h2>
            <div className="flex flex-wrap gap-2">
              {recentWords.map((w) => (
                <span
                  key={w.id}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm
                             bg-indigo-50 text-indigo-700 border border-indigo-100"
                >
                  {w.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
