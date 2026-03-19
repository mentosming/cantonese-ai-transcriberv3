import { useState, useEffect } from 'react';
import { loginAdminWithGoogle, validateLicenseKey, saveLicense, getStoredLicense, clearLicense, logoutAdmin } from '../services/authService';

export const useAuth = () => {
  const [isPro, setIsPro] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [licenseInput, setLicenseInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const checkSavedLicense = async () => {
      const savedKey = getStoredLicense();
      if (savedKey) {
        const isValid = await validateLicenseKey(savedKey);
        if (isValid) {
          setIsPro(true);
        } else {
          clearLicense();
        }
      }
    };
    checkSavedLicense();
  }, []);

  const handleAdminLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      await loginAdminWithGoogle();
      setShowLoginModal(false);
      setShowAdminPanel(true);
      setIsPro(true);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLicenseUnlock = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const isValid = await validateLicenseKey(licenseInput);
      if (isValid) {
        saveLicense(licenseInput);
        setIsPro(true);
        setShowLoginModal(false);
        setLicenseInput('');
        alert("成功解鎖完全版功能！");
      } else {
        setAuthError("無效的通行碼，請確認後再試。");
      }
    } catch (err) {
      setAuthError("驗證過程發生錯誤，請檢查網絡連接。");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutAdmin();
    setShowAdminPanel(false);
    const savedKey = getStoredLicense();
    if (!savedKey) setIsPro(false);
  };

  return {
    isPro,
    showLoginModal, setShowLoginModal,
    showAdminPanel, setShowAdminPanel,
    licenseInput, setLicenseInput,
    authLoading, authError,
    handleAdminLogin, handleLicenseUnlock, handleLogout,
  };
};
