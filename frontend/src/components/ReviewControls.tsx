const grades = [
  { quality: 1, label: 'Again', color: 'bg-red-500 hover:bg-red-600' },
  { quality: 3, label: 'Hard', color: 'bg-yellow-500 hover:bg-yellow-600' },
  { quality: 4, label: 'Good', color: 'bg-green-500 hover:bg-green-600' },
  { quality: 5, label: 'Easy', color: 'bg-blue-500 hover:bg-blue-600' },
];

interface ReviewControlsProps {
  onGrade: (quality: number) => void;
}

export default function ReviewControls({ onGrade }: ReviewControlsProps) {
  return (
    <div className="mx-auto mt-4 flex w-full max-w-[20rem] justify-between gap-2 px-1 sm:mt-5">
      {grades.map((g) => (
        <button
          key={g.label}
          onClick={() => onGrade(g.quality)}
          className={`flex-1 rounded-lg px-3 py-3 text-sm font-semibold text-white transition ${g.color}`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
