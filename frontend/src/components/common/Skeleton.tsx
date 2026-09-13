interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string;
  height?: string;
  lines?: number;
  className?: string;
}

export default function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
}: SkeletonProps) {
  if (variant === 'circular') {
    return (
      <div
        className={`skeleton-shimmer rounded-full ${className}`}
        style={{ width: width || '40px', height: height || '40px' }}
      />
    );
  }

  if (variant === 'rectangular') {
    return (
      <div
        className={`skeleton-shimmer rounded-lg ${className}`}
        style={{ width: width || '100%', height: height || '100px' }}
      />
    );
  }

  // Text variant - multiple lines with varying widths
  const lineWidths = ['100%', '85%', '70%', '90%', '60%', '80%', '75%', '95%'];

  return (
    <div className={`space-y-2 ${className}`} style={{ width: width || '100%' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-shimmer rounded"
          style={{
            width: lines > 1 ? lineWidths[i % lineWidths.length] : '100%',
            height: height || '14px',
          }}
        />
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-card p-6 border-l-4 border-gray-200">
      <Skeleton width="60%" height="14px" className="mb-3" />
      <Skeleton width="40%" height="32px" />
    </div>
  );
}
