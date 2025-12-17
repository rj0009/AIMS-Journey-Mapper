import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { LiveSession } from './components/LiveSession';
import { JourneyMapViz } from './components/JourneyMapViz';
import { ChatRefiner } from './components/ChatRefiner';
import { JourneyMapData, TranscriptItem } from './types';
import { analyzeTranscriptForMap, generateFollowUpQuestions, refineMapWithChat } from './services/geminiService';

export default function App() {
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptItem[]>([]);
  const [journeyMap, setJourneyMap] = useState<JourneyMapData | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([
    "Could you walk me through your first experience with us?",
    "What were you feeling when you first sought help?",
    "Were there any obstacles in the application process?"
  ]);

  // Periodic analysis for suggestions (Debounced)
  useEffect(() => {
    // Only analyze if we have enough history (e.g., at least 2 turns)
    if (transcriptHistory.length < 2) return;

    const timer = setTimeout(async () => {
      const questions = await generateFollowUpQuestions(transcriptHistory);
      if (questions && questions.length > 0) {
        setSuggestions(questions);
      }
    }, 4000); // Check every few seconds of inactivity or after updates

    return () => clearTimeout(timer);
  }, [transcriptHistory]);

  const handleGenerateMap = async () => {
    if (transcriptHistory.length === 0) {
      alert("No transcript available yet. Please start the interview and speak first.");
      return;
    }

    setIsMapLoading(true);
    try {
      const map = await analyzeTranscriptForMap(transcriptHistory);
      if (map) {
        setJourneyMap(map);
      } else {
        throw new Error("Result was empty");
      }
    } catch (e: any) {
      console.error("Map Generation Error:", e);
      alert(`Failed to generate map: ${e.message || "Unknown error"}. Please try again.`);
    } finally {
      setIsMapLoading(false);
    }
  };

  const handleRefineMap = async (prompt: string) => {
    if (!journeyMap) return;
    setIsMapLoading(true);
    try {
      const newMap = await refineMapWithChat(journeyMap, prompt);
      setJourneyMap(newMap);
    } catch (e) {
      console.error("Refinement Error:", e);
      alert("Failed to refine map. Please try again.");
    } finally {
      setIsMapLoading(false);
    }
  };

  const handleTranscriptUpdate = useCallback((text: string) => {
    // We strictly use transcriptHistory for analysis now, but this callback 
    // satisfies the interface if we needed streaming text for other visualizers.
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header />
      
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        
        {/* Left Column: Live Interaction - HIDDEN IN PRINT */}
        <div className="w-1/3 flex flex-col gap-4 min-w-[350px] no-print">
          {/* Live Transcript & Audio */}
          <div className="flex-1 min-h-0">
            <LiveSession 
              onTranscriptUpdate={handleTranscriptUpdate} 
              transcriptHistory={transcriptHistory} 
              setTranscriptHistory={setTranscriptHistory}
            />
          </div>

          {/* AI Suggestions Panel */}
          <div className="bg-gradient-to-br from-ncss-purple to-purple-900 rounded-xl p-4 shadow-md text-white shrink-0">
            <h3 className="font-bold text-sm uppercase tracking-wide opacity-80 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              AI Co-Pilot Suggestions
            </h3>
            {suggestions.length > 0 ? (
              <ul className="space-y-2">
                {suggestions.map((s, i) => (
                  <li key={i} className="text-sm bg-white/10 p-2 rounded border border-white/10 hover:bg-white/20 transition-colors cursor-pointer">
                    "{s}"
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/50 italic">Listening to context for suggestions...</p>
            )}
            
            <div className="mt-4 pt-3 border-t border-white/20">
              <button 
                onClick={handleGenerateMap}
                disabled={isMapLoading || transcriptHistory.length === 0}
                className="w-full bg-white text-ncss-purple font-bold py-2 px-4 rounded shadow hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
              >
                {isMapLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-ncss-purple" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    Generate Journey Map
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Visualization */}
        <div className="flex-1 flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="flex-1 min-h-0 relative">
             <JourneyMapViz data={journeyMap} isLoading={isMapLoading} />
          </div>
          {journeyMap && (
             <ChatRefiner onSendMessage={handleRefineMap} isProcessing={isMapLoading} />
          )}
        </div>

      </main>
    </div>
  );
}