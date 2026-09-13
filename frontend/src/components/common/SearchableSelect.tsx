import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'default';
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  error,
  required = false,
  disabled = false,
  className = '',
  size = 'default',
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (option.sublabel && option.sublabel.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Get selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideDropdown = dropdownRef.current && !dropdownRef.current.contains(target);
      const isOutsideButton = buttonRef.current && !buttonRef.current.contains(target);

      if (isOutsideDropdown && isOutsideButton) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update dropdown position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const updatePosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
          });
        }
      };

      updatePosition();

      // Focus search input
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }

      // Update position on scroll or resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {/* Selected Value Display / Trigger */}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full text-left border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
            size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'
          } ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer'
          } ${error ? 'border-red-300' : 'border-gray-300'} ${
            isOpen ? 'ring-2 ring-blue-500 border-transparent' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 truncate">
              {selectedOption ? (
                <div>
                  <div className="text-gray-900">{selectedOption.label}</div>
                  {selectedOption.sublabel && (
                    <div className="text-xs text-gray-500">{selectedOption.sublabel}</div>
                  )}
                </div>
              ) : (
                <span className="text-gray-400">{placeholder}</span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-2">
              {value && !disabled && (
                <XMarkIcon
                  className="h-4 w-4 text-gray-400 hover:text-gray-600"
                  onClick={handleClear}
                />
              )}
              <ChevronDownIcon
                className={`h-5 w-5 text-gray-400 transition-transform ${
                  isOpen ? 'transform rotate-180' : ''
                }`}
              />
            </div>
          </div>
        </button>

        {/* Dropdown Menu - Rendered via Portal */}
        {isOpen && createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-hidden"
            style={{
              top: `${dropdownPosition.top + 4}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
          >
            {/* Search Input */}
            <div className="p-2 border-b border-gray-200 sticky top-0 bg-white">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            {/* Options List */}
            <div className="overflow-y-auto max-h-60">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`w-full px-4 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                      option.value === value ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className="text-sm text-gray-900">{option.label}</div>
                    {option.sublabel && (
                      <div className="text-xs text-gray-500">{option.sublabel}</div>
                    )}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No options found
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
