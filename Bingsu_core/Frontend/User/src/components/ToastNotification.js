import { useState, useEffect } from 'react';
import { HiX, HiCheckCircle, HiInformationCircle, HiExclamationCircle } from 'react-icons/hi';

// Toast Context/Provider (optional - can be used globally)
let toastId = 0;
const toastListeners = new Set();

export const showToast = (message, type = 'success', duration = 3000) => {
  const id = toastId++;
  toastListeners.forEach(listener => listener({ id, message, type, duration }));
  return id;
};

export const useToast = () => {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const listener = (toast) => {
      setToasts(prev => [...prev, toast]);
      
      // Auto remove after duration
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, toast.duration);
    };

    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return { toasts, removeToast };
};

// Toast Container Component
function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className='fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm w-full'>
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

// Individual Toast Item
function ToastItem({ toast, onClose }) {
  const { message, type } = toast;

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          icon: <HiCheckCircle className='text-green-600 text-xl' />,
          text: 'text-green-800'
        };
      case 'error':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          icon: <HiExclamationCircle className='text-red-600 text-xl' />,
          text: 'text-red-800'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-200',
          icon: <HiExclamationCircle className='text-yellow-600 text-xl' />,
          text: 'text-yellow-800'
        };
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          icon: <HiInformationCircle className='text-blue-600 text-xl' />,
          text: 'text-blue-800'
        };
    }
  };

  const styles = getToastStyles();

  return (
    <div
      className={`${styles.bg} ${styles.border} border rounded-lg shadow-lg p-4 flex items-start gap-3 animate-slide-in-right`}
    >
      <div className='flex-shrink-0 mt-0.5'>
        {styles.icon}
      </div>
      <div className={`flex-1 ${styles.text} text-sm font-medium`}>
        {message}
      </div>
      <button
        onClick={onClose}
        className={`flex-shrink-0 ${styles.text} hover:opacity-70 transition-opacity`}
      >
        <HiX className='text-lg' />
      </button>
    </div>
  );
}

export default ToastContainer;
