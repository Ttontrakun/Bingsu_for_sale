import { useState, useRef, useEffect } from 'react';
import { HiChevronDown } from 'react-icons/hi';

function Dropdown({ options = [], selectedValue, onSelect, placeholder = "Select..." }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (value) => {
    onSelect(value);
    setIsOpen(false);
  };

  const selectedLabel = options.find(opt => opt.value === selectedValue)?.label || placeholder;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors min-w-[150px]"
      >
        <span className="text-gray-700">{selectedLabel}</span>
        <HiChevronDown 
          className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'transform rotate-180' : ''}`} 
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-fit min-w-[150px] max-w-md bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
          {options.length > 0 ? (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors whitespace-nowrap ${
                  selectedValue === option.value ? 'bg-yellow-50 text-yellow-600' : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
