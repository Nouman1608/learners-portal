import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface BackButtonProps {
  to?: string; // Optional specific path to navigate to
  label?: string; // Optional label text
  className?: string; // Optional additional CSS classes
}

export default function BackButton({ to, label = 'Back', className = '' }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1); // Go back to previous page
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors ${className}`}
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
