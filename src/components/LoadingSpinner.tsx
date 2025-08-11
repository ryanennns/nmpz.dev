export const LoadingSpinner = () => (
  <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 backdrop-blur-sm">
    <div className="flex flex-col items-center">
      <div className="w-10 h-10 border-3 border-green-500/30 border-t-green-500 rounded-full animate-spin"></div>
      <div className="mt-4 text-sm font-semibold text-white">
        Loading location...
      </div>
    </div>
  </div>
);
