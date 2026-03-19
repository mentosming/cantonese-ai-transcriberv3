import { useState, useEffect } from 'react';

export const useTheme = () => {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cai_dark_mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  const [globalFontSize, setGlobalFontSize] = useState(0); // 0: Normal, 1: Large, 2: Extra Large

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('cai_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('cai_dark_mode', 'false');
    }
  }, [darkMode]);

  useEffect(() => {
    const sizes = ['16px', '18px', '20px'];
    document.documentElement.style.fontSize = sizes[globalFontSize];
  }, [globalFontSize]);

  const toggleTheme = () => setDarkMode(!darkMode);

  return { darkMode, toggleTheme, globalFontSize, setGlobalFontSize };
};
