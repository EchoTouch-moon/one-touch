import { useMemo } from 'react';

export interface KaoyanSentence {
  id: number;
  year: number;
  paper?: string;
  text: string;
}

export interface KaoyanInfo {
  translation: string;
  phonetic: string;
  sentences: KaoyanSentence[];
}

function inflections(word: string) {
  const forms = new Set([word]);
  if (word.endsWith('y') && word.length > 3) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }
  forms.add(`${word}s`);
  forms.add(`${word}es`);
  forms.add(`${word}ed`);
  forms.add(`${word}ing`);
  return [...forms];
}

export function HighlightedSentence({ text, word }: { text: string; word: string }) {
  const parts = useMemo(() => {
    const forms = inflections(word);
    const pattern = new RegExp(`\\b(${forms.join('|')})\\b`, 'gi');
    return text.split(pattern);
  }, [text, word]);

  const lowerForms = useMemo(() => new Set(inflections(word).map((form) => form.toLowerCase())), [word]);

  return (
    <p className="text-meta leading-relaxed text-ink-soft">
      {parts.map((part, i) =>
        lowerForms.has(part.toLowerCase()) ? (
          <span key={i} className="rounded-sm bg-brand-wash px-0.5 font-semibold text-brand-deep">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export function ExamSentenceCard({ sentence, word }: { sentence: KaoyanSentence; word: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-3.5">
      <span className="pill pill-accent mb-2.5">
        {sentence.year}
        {sentence.paper ? ` · ${sentence.paper}` : ''}
      </span>
      <HighlightedSentence text={sentence.text} word={word} />
    </div>
  );
}
