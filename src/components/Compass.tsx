import React from "react";

interface CompassProps {
  heading: number;
}

export const Compass: React.FC<CompassProps> = ({ heading }) => {
  // Normalize the heading to ensure it's between 0-360
  const normalizedHeading = ((heading % 360) + 360) % 360;
  
  return (
    <div className="relative w-16 h-16 mb-2">
      {/* Compass background circle */}
      <div className="absolute inset-0 rounded-full bg-slate-900/85 backdrop-blur-md border border-slate-200/10 shadow-2xl"></div>
      
      {/* Compass needle */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: `rotate(${normalizedHeading}deg)` }}
      >
        <div className="w-1 h-8 flex flex-col">
          <div className="flex-1 bg-red-500 rounded-t-full"></div>
          <div className="flex-1 bg-white rounded-b-full"></div>
        </div>
      </div>
    </div>
  );
};