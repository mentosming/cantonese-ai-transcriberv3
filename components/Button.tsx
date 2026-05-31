import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  className = '', 
  disabled, 
  ...props 
}) => {
  const baseStyles = "px-4 py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]";

  const variants = {
    // Teal primary — the signature accent.
    primary: "bg-teal-500 text-white hover:bg-teal-600 focus:ring-teal-400 shadow-[0_2px_8px_-2px_rgba(17,156,137,0.5)]",
    secondary: "bg-surface text-ink border border-line-strong hover:border-teal-400 hover:bg-teal-50 focus:ring-teal-300 dark:bg-ink-800 dark:text-white dark:border-ink-600 dark:hover:border-teal-500 dark:hover:bg-ink-700",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 focus:ring-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/60",
    ghost: "text-ink-muted hover:text-ink hover:bg-canvas-sunk focus:ring-line-strong dark:text-paper-muted dark:hover:bg-ink-800 dark:hover:text-white"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;