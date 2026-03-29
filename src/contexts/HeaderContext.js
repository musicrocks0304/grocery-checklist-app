import React, { createContext, useContext, useState, useCallback } from 'react';

const HeaderContext = createContext();

export const HeaderProvider = ({ children }) => {
  const [headerContent, setHeaderContent] = useState(null);
  const setMobileHeader = useCallback((content) => setHeaderContent(content), []);
  const clearMobileHeader = useCallback(() => setHeaderContent(null), []);

  return (
    <HeaderContext.Provider value={{ headerContent, setMobileHeader, clearMobileHeader }}>
      {children}
    </HeaderContext.Provider>
  );
};

export const useHeader = () => {
  const ctx = useContext(HeaderContext);
  if (!ctx) throw new Error('useHeader must be used within a HeaderProvider');
  return ctx;
};
