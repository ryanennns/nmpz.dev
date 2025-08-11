import React, { useEffect } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  // Handle escape key for closing settings modal
  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent): void => {
      if (e.code === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscapeKey);
    return () => window.removeEventListener("keydown", handleEscapeKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Modal Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      {/* Modal Content */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="bg-slate-900/95 backdrop-blur-md p-6 rounded-xl shadow-2xl border border-slate-200/10 text-white max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Settings</h3>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-slate-300">Settings panel coming soon...</p>
        </div>
      </div>
    </>
  );
};