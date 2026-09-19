"use client";

import React from "react";
import BarLoader from "./bar-loader";

const BarLoaderDemo: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#f6f4ee] rounded-2xl border border-black/10">
      <h1 className="text-2xl font-serif font-medium mb-8 text-[#191919]">
        Animated Bar Loader Demo
      </h1>

      {/* Default Loader */}
      <BarLoader className="mb-10" color="bg-[#325238]" />

      {/* Customized Loader */}
      <BarLoader
        bars={12}
        barWidth={8}
        barHeight={60}
        color="bg-[#d96b27]"
        speed={1.5}
      />
    </div>
  );
};

export default BarLoaderDemo;
