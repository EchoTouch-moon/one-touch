const grades = [
  { quality: 1, label: 'Again', dot: 'bg-bad', text: 'text-bad', hover: 'hover:border-bad/40 hover:bg-bad-wash' },
  { quality: 3, label: 'Hard', dot: 'bg-warn', text: 'text-warn', hover: 'hover:border-warn/40 hover:bg-warn-wash' },
  { quality: 4, label: 'Good', dot: 'bg-good', text: 'text-good', hover: 'hover:border-good/40 hover:bg-good-wash' },
  { quality: 5, label: 'Easy', dot: 'bg-brand', text: 'text-brand-deep', hover: 'hover:border-brand/40 hover:bg-brand-wash' },
];

interface ReviewControlsProps {
  onGrade: (quality: number) => void;
}

/**
 * The four recall grades. Colour is a secondary cue — each button also carries
 * its label and its 1–4 shortcut, so the row still reads without hue.
 */
export default function ReviewControls({ onGrade }: ReviewControlsProps) {
  return (
    <div className="mx-auto mt-3 flex w-full max-w-review gap-2">
      {grades.map((grade, index) => (
        <button
          key={grade.label}
          type="button"
          onClick={() => onGrade(grade.quality)}
          aria-keyshortcuts={String(index + 1)}
          className={`flex flex-1 flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-3
                      shadow-hair transition-[transform,box-shadow,border-color,background-color] duration-[var(--dur-base)]
                      hover:-translate-y-0.5 hover:shadow-card ${grade.hover}`}
        >
          <span className={`block h-1.5 w-1.5 rounded-full ${grade.dot}`} aria-hidden="true" />
          <span className={`block text-micro font-semibold ${grade.text}`}>{grade.label}</span>
          <span className="num hidden text-2xs font-medium text-ink-mute sm:block" aria-hidden="true">
            {index + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
