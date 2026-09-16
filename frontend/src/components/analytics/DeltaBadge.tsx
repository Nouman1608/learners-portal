import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/24/solid';

interface DeltaBadgeProps {
  /** Percentage change, or null when there is no previous figure to compare to. */
  changePercent: number | null;
  /** Set when a fall is the good outcome, e.g. overdue fees or drop-outs. */
  invert?: boolean;
  label?: string;
}

/**
 * Shows movement against the previous period of the same length.
 */
export default function DeltaBadge({ changePercent, invert = false, label = 'vs previous period' }: DeltaBadgeProps) {
  if (changePercent === null || !isFinite(changePercent)) {
    return <p className="mt-1 text-xs text-gray-400">No comparable data</p>;
  }

  const rounded = Math.round(changePercent * 10) / 10;
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  const isGood = invert ? !isUp : isUp;

  const tone = isFlat
    ? 'text-gray-500'
    : isGood
      ? 'text-green-600'
      : 'text-red-600';

  return (
    <p className={`mt-1 flex items-center text-xs font-medium ${tone}`}>
      {!isFlat && (
        isUp
          ? <ArrowUpIcon className="h-3 w-3 mr-0.5" aria-hidden="true" />
          : <ArrowDownIcon className="h-3 w-3 mr-0.5" aria-hidden="true" />
      )}
      {isFlat ? 'No change' : `${Math.abs(rounded)}%`}
      <span className="ml-1 font-normal text-gray-500">{label}</span>
    </p>
  );
}
