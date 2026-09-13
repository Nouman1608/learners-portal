import { useEffect, useRef, useState } from 'react';
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (inputValue?: string) => void;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  requireInput?: string;
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputType?: string;
  hideCancel?: boolean;
}

const variantStyles = {
  danger: {
    icon: ExclamationTriangleIcon,
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
    confirmBtn: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    confirmBtn: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
  },
  info: {
    icon: InformationCircleIcon,
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700 focus:ring-indigo-500',
  },
};

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  requireInput,
  showInput,
  inputLabel,
  inputPlaceholder,
  inputType = 'text',
  hideCancel = false,
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const style = variantStyles[variant];
  const Icon = style.icon;

  const canConfirm = requireInput ? inputValue === requireInput : true;

  useEffect(() => {
    if (isOpen) {
      setInputValue('');
      // Focus input if present, otherwise trap focus in dialog
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Icon + Title */}
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 ${style.iconBg} rounded-full p-2`}>
              <Icon className={`h-6 w-6 ${style.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <div className="mt-2 text-sm text-gray-600">
                {typeof message === 'string' ? <p>{message}</p> : message}
              </div>
            </div>
          </div>

          {/* Input field */}
          {(requireInput || showInput) && (
            <div className="mt-4">
              {inputLabel && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {inputLabel}
                </label>
              )}
              <input
                ref={inputRef}
                type={inputType}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={inputPlaceholder || (requireInput ? `Type "${requireInput}" to confirm` : '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              {requireInput && (
                <p className="mt-1 text-xs text-gray-500">
                  Type <span className="font-mono font-medium text-gray-700">{requireInput}</span> to confirm
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 rounded-b-xl">
          {!hideCancel && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={() => onConfirm(inputValue || undefined)}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${style.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
