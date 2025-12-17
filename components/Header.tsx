import React from 'react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center px-6 justify-between shrink-0 no-print">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-ncss-purple rounded-lg flex items-center justify-center text-white font-bold text-lg">
          A
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">NCSS AIMS 2.0 <span className="text-ncss-teal font-light">Journey Mapper</span></h1>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Social Service Digital Unit</p>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex -space-x-2 overflow-hidden">
          <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src="https://picsum.photos/32/32?random=1" alt="PM" />
          <img className="inline-block h-8 w-8 rounded-full ring-2 ring-white" src="https://picsum.photos/32/32?random=2" alt="Social Worker" />
        </div>
        <div className="h-8 w-8 rounded-full bg-ncss-red text-white flex items-center justify-center font-bold" title="Logged in as JD">
          JD
        </div>
      </div>
    </header>
  );
};