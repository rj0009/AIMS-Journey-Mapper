import React, { useState } from 'react';
import { JourneyMapData } from '../types';
import { generateTouchpointImage } from '../services/geminiService';

interface Props {
  data: JourneyMapData | null;
  isLoading: boolean;
}

export const JourneyMapViz: React.FC<Props> = ({ data, isLoading }) => {
  const [images, setImages] = useState<Record<string, string>>({});
  const [loadingImage, setLoadingImage] = useState<string | null>(null);

  const handleGenerateImage = async (stageName: string, prompt: string) => {
    if (loadingImage) return;
    setLoadingImage(stageName);
    const imgData = await generateTouchpointImage(prompt);
    if (imgData) {
      setImages(prev => ({ ...prev, [stageName]: imgData }));
    }
    setLoadingImage(null);
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (e) {
      alert("Print blocked. Please use the 'Download Report' button instead.");
    }
  };

  const handleDownloadHTML = () => {
    if (!data) return;

    // Use default empty arrays in the template string to prevent .join() on undefined errors
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>${data.title} - Journey Map</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="bg-gray-50 p-8 font-sans text-slate-800">
        <div class="max-w-[1600px] mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-200">
          <div class="border-b border-gray-200 pb-6 mb-6">
            <h1 class="text-3xl font-bold text-ncss-purple mb-2">${data.title}</h1>
            <p class="text-sm text-gray-500 uppercase tracking-wider">NCSS AIMS 2.0 Generated Report</p>
          </div>

          <div class="overflow-x-auto pb-4">
            <div class="min-w-max grid grid-cols-[150px_repeat(${(data.stages || []).length},300px)] gap-6">
              
              <!-- Row Headers -->
              <div class="pt-12 space-y-6 font-bold text-gray-400 text-right pr-4 text-sm uppercase tracking-wide">
                <div class="h-32">User Actions</div>
                <div class="h-48">Touchpoints</div>
                <div class="h-24">Thinking/Feeling</div>
                <div class="h-32 text-red-500">Pain Points</div>
                <div class="h-32 text-green-600">Opportunities</div>
              </div>

              <!-- Stage Columns -->
              ${(data.stages || []).map((stage) => `
                <div class="flex flex-col gap-6">
                  <div class="font-bold text-xl text-slate-800 pb-2 border-b-4 border-teal-500">
                    ${stage.name || 'Stage'}
                  </div>

                  <!-- User Actions -->
                  <div class="h-32 bg-gray-50 p-4 rounded-lg border border-gray-100 overflow-y-auto text-sm">
                    <ul class="list-disc pl-4 space-y-1">
                      ${(stage.userActions || []).map(a => `<li class="text-gray-700">${a}</li>`).join('')}
                    </ul>
                  </div>

                  <!-- Touchpoints & Image -->
                  <div class="h-48 bg-white p-4 rounded-lg border border-gray-200 relative shadow-sm">
                    <div class="text-sm font-semibold text-purple-700 mb-2 h-10 overflow-hidden text-ellipsis">
                      ${(stage.touchpoints || []).join(', ')}
                    </div>
                    <div class="w-full h-28 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                      ${images[stage.name] 
                        ? `<img src="${images[stage.name]}" class="w-full h-full object-cover" />`
                        : `<span class="text-xs text-gray-400">No visualization generated</span>`
                      }
                    </div>
                  </div>

                  <!-- Emotions -->
                  <div class="h-24 flex items-center justify-center bg-white rounded-lg border border-gray-100 shadow-sm">
                    <span class="text-5xl" title="${stage.emotions}">${stage.emotions || ''}</span>
                  </div>

                  <!-- Pain Points -->
                  <div class="h-32 bg-red-50 p-4 rounded-lg border border-red-100 overflow-y-auto text-sm">
                    ${(stage.painPoints || []).map(p => `
                      <div class="flex gap-2 mb-2 text-gray-800">
                        <span class="text-red-500 shrink-0">⚠️</span>
                        <span>${p}</span>
                      </div>
                    `).join('')}
                  </div>

                  <!-- Opportunities -->
                  <div class="h-32 bg-green-50 p-4 rounded-lg border border-green-100 overflow-y-auto text-sm">
                    ${(stage.opportunities || []).map(o => `
                      <div class="flex gap-2 mb-2 text-gray-800">
                        <span class="text-green-600 shrink-0">💡</span>
                        <span>${o}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}

            </div>
          </div>
          
          <div class="mt-8 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            Generated by Gemini 2.0 Flash • NCSS AIMS Journey Mapper
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50/50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-ncss-teal border-t-transparent rounded-full animate-spin"></div>
          <p className="text-ncss-teal font-medium">Analyzing transcript & building map...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl m-4">
        <p>No journey map data available. Start an interview to generate.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden printable-area bg-white relative">
      {/* Header with higher z-index to ensure button is clickable */}
      <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-white shrink-0 relative z-[100]">
        <h2 className="text-xl font-bold text-gray-800">{data.title || 'Untitled Journey'}</h2>
        <div className="flex space-x-2 no-print">
           <button 
             type="button"
             onClick={handleDownloadHTML}
             className="flex items-center gap-2 bg-ncss-teal hover:bg-teal-700 text-white px-4 py-2 rounded-md shadow-sm text-sm font-bold transition-all cursor-pointer active:scale-95"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
             </svg>
             Download Report
           </button>
           <button 
             type="button"
             className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-md shadow-sm text-sm font-medium transition-all cursor-pointer active:scale-95" 
             onClick={handlePrint}
             title="Browser Print"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
             </svg>
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto bg-gray-50 p-6 print:bg-white print:p-0 z-10">
        <div className="min-w-max grid grid-cols-[150px_repeat(5,minmax(280px,1fr))] gap-4">
          
          {/* Header Row */}
          <div className="font-bold text-gray-400 text-sm uppercase tracking-wider py-2">Stage</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="font-bold text-slate-800 text-lg py-2 border-b-4 border-ncss-teal/50">
              {stage.name}
            </div>
          ))}

          {/* User Actions Lane */}
          <div className="font-semibold text-gray-600 text-sm py-4 border-r border-gray-200 pr-4">User Actions</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="p-4 bg-white rounded-lg shadow-sm border border-gray-100 space-y-2">
              {(stage.userActions || []).map((action, idx) => (
                <div key={idx} className="text-sm text-gray-700 bg-gray-50 p-2 rounded border border-gray-100">
                  {action}
                </div>
              ))}
            </div>
          ))}

          {/* Touchpoints Visual Lane */}
          <div className="font-semibold text-gray-600 text-sm py-4 border-r border-gray-200 pr-4">Touchpoints</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="p-4 space-y-3 relative group">
              <div className="text-sm text-ncss-purple font-medium mb-2">
                {(stage.touchpoints || []).join(", ")}
              </div>
              
              {/* Image Generation Slot */}
              <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center group-hover:shadow-md transition-shadow">
                 {images[stage.name] ? (
                    <img src={images[stage.name]} alt={stage.name} className="w-full h-full object-cover" />
                 ) : (
                    <div className="text-center p-2">
                      <button 
                        type="button"
                        onClick={() => handleGenerateImage(stage.name, `Scene showing: ${(stage.userActions || [])[0]} with touchpoints: ${(stage.touchpoints || []).join(', ')}`)}
                        className="text-xs bg-white text-ncss-teal border border-ncss-teal px-2 py-1 rounded hover:bg-ncss-teal hover:text-white transition-colors no-print cursor-pointer"
                        disabled={loadingImage === stage.name}
                      >
                        {loadingImage === stage.name ? 'Generating...' : 'Visualize'}
                      </button>
                    </div>
                 )}
              </div>
            </div>
          ))}

          {/* Emotions Lane */}
          <div className="font-semibold text-gray-600 text-sm py-4 border-r border-gray-200 pr-4">Thinking & Feeling</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="p-4 flex items-center justify-center">
              <div className="text-4xl filter drop-shadow-sm hover:scale-110 transition-transform cursor-help" title={stage.emotions}>
                {stage.emotions}
              </div>
            </div>
          ))}

          {/* Pain Points Lane */}
          <div className="font-semibold text-gray-600 text-sm py-4 border-r border-gray-200 pr-4 text-ncss-red">Pain Points</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="p-4">
               {(stage.painPoints || []).map((pt, idx) => (
                <div key={idx} className="flex items-start gap-2 mb-2 text-sm text-gray-700 bg-red-50 p-2 rounded-md border border-red-100">
                  <span className="text-red-500 mt-0.5">⚠️</span> {pt}
                </div>
              ))}
            </div>
          ))}

          {/* Opportunities Lane */}
          <div className="font-semibold text-gray-600 text-sm py-4 border-r border-gray-200 pr-4 text-green-600">Opportunities</div>
          {(data.stages || []).map((stage, i) => (
            <div key={i} className="p-4">
               {(stage.opportunities || []).map((opt, idx) => (
                <div key={idx} className="flex items-start gap-2 mb-2 text-sm text-gray-700 bg-green-50 p-2 rounded-md border border-green-100">
                   <span className="text-green-500 mt-0.5">💡</span> {opt}
                </div>
              ))}
            </div>
          ))}

        </div>
      </div>
    </div>
  );
};