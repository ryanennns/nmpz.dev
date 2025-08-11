interface Props {
  totalScore: number;
  rounds: number;
}

export const GameHud = ({ totalScore, rounds }: Props) => {
  return (
    <div className="fixed left-4 top-4 flex items-center gap-2 z-20 bg-slate-900/70 backdrop-blur-md px-3 py-2 rounded-xl shadow-2xl">
      <span className="bg-slate-700 text-white rounded-full px-3 py-1 text-sm font-bold">
        Round {rounds}
      </span>
      <span className="bg-slate-700 text-white rounded-full px-3 py-1 text-sm font-bold">
        Total: {totalScore}
      </span>
    </div>
  );
};
