"use client";

import React from "react";

interface BarLoaderProps {
  bars?: number;           // Number of bars
  barWidth?: number;       // Width of each bar (px)
  barHeight?: number;      // Height of each bar (px)
  color?: string;          // Tailwind color class or HEX
  speed?: number;          // Animation duration multiplier (seconds)
  className?: string;
}

const BarLoader: React.FC<BarLoaderProps> = ({
  bars = 8,
  barWidth = 10,
  barHeight = 70,
  color = "bg-[#325238]",
  speed = 1.2,
  className,
}) => {
  const barsArray = Array.from({ length: bars });

  return (
    <div className={`relative flex justify-center items-end gap-1 ${className || ""}`}>
      {barsArray.map((_, i) => (
        <div
          key={i}
          className={`${color} rounded-t-xl origin-bottom animate-barLoader`}
          style={{
            width: `${barWidth}px`,
            height: `${barHeight}px`,
            animationDelay: `${(i + 1) * 0.1}s`,
            animationDuration: `${speed}s`,
          }}
        />
      ))}
    </div>
  );
};

export default BarLoader;
