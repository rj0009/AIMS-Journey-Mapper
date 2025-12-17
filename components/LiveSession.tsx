import React, { useEffect, useRef, useState } from 'react';
import { ConnectionState, TranscriptItem } from '../types';
import { LiveApiService } from '../services/geminiService';
import { LiveServerMessage } from '@google/genai';

interface LiveSessionProps {
  onTranscriptUpdate: (text: string) => void;
  transcriptHistory: TranscriptItem[];
  setTranscriptHistory: React.Dispatch<React.SetStateAction<TranscriptItem[]>>;
}

export const LiveSession: React.FC<LiveSessionProps> = ({ onTranscriptUpdate, transcriptHistory, setTranscriptHistory }) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const liveService = useRef<LiveApiService>(new LiveApiService());
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Manual Input State
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [pastedText, setPastedText] = useState('');
  
  // Ref for the debounce timer to commit text during pauses
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Temporary buffers for streaming text
  const currentInputRef = useRef<string>('');
  const currentOutputRef = useRef<string>('');
  // We use a state to force re-render for streaming text visualization
  const [liveInputText, setLiveInputText] = useState('');
  const [liveOutputText, setLiveOutputText] = useState('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      liveService.current.disconnect();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptHistory, liveInputText, liveOutputText, showPasteInput]);

  const commitInputToHistory = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    if (currentInputRef.current.trim()) {
      setTranscriptHistory(prev => [
        ...prev, 
        { id: Date.now().toString() + '-user', speaker: 'user', text: currentInputRef.current.trim(), timestamp: new Date() }
      ]);
      currentInputRef.current = '';
      setLiveInputText('');
    }
  };

  const handleManualSubmit = () => {
    if (!pastedText.trim()) return;
    
    setTranscriptHistory(prev => [
      ...prev,
      { 
        id: Date.now().toString() + '-manual', 
        speaker: 'user', 
        text: pastedText.trim(), 
        timestamp: new Date() 
      }
    ]);
    setPastedText('');
    setShowPasteInput(false);
  };

  const handleConnect = async () => {
    setConnectionState(ConnectionState.CONNECTING);
    try {
      await liveService.current.connect(
        () => {
          setConnectionState(ConnectionState.CONNECTED);
          // Trigger the kickoff preamble
          liveService.current.sendText("Please start the session with a brief, warm preamble for a social service journey mapping interview and ask the first opening question.");
        },
        (msg: LiveServerMessage) => {
          const content = msg.serverContent;
          
          if (content?.inputTranscription) {
            const text = content.inputTranscription.text;
            if (text) {
              currentInputRef.current += text;
              setLiveInputText(currentInputRef.current);
              onTranscriptUpdate(text); 

              // Reset debounce timer on every new chunk
              if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
              // If no new text for 1.5s, assume speaker paused and commit
              debounceTimerRef.current = setTimeout(commitInputToHistory, 1500);
            }
          }

          if (content?.outputTranscription) {
            const text = content.outputTranscription.text;
            if (text) {
              currentOutputRef.current += text;
              setLiveOutputText(currentOutputRef.current);
            }
          }

          if (content?.turnComplete) {
            // If turn completes, force commit immediately
            commitInputToHistory();

            if (currentOutputRef.current.trim()) {
              setTranscriptHistory(prev => [
                ...prev, 
                { id: Date.now().toString() + '-agent', speaker: 'model', text: currentOutputRef.current.trim(), timestamp: new Date() }
              ]);
              currentOutputRef.current = '';
              setLiveOutputText('');
            }
          }
        },
        (err) => {
          console.error("Live API Error:", err);
          setConnectionState(ConnectionState.ERROR);
        },
        () => setConnectionState(ConnectionState.DISCONNECTED)
      );
    } catch (e) {
      console.error("Connection Failed:", e);
      setConnectionState(ConnectionState.ERROR);
    }
  };

  const handleDisconnect = async () => {
    await liveService.current.disconnect();
    setConnectionState(ConnectionState.DISCONNECTED);
    // Cleanup any lingering partial text
    commitInputToHistory();
    setLiveInputText('');
    setLiveOutputText('');
    currentInputRef.current = '';
    currentOutputRef.current = '';
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connectionState === ConnectionState.CONNECTED ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></span>
          Live Session
        </h2>
        <div className="flex gap-2">
           <button 
            onClick={() => setShowPasteInput(!showPasteInput)}
            className={`text-xs px-3 py-1 rounded font-medium border transition-colors ${showPasteInput ? 'bg-gray-200 text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {showPasteInput ? 'Cancel Paste' : 'Paste Text'}
          </button>
          
          {connectionState === ConnectionState.CONNECTED ? (
             <button onClick={handleDisconnect} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200 font-medium">
               End Session
             </button>
          ) : (
            <button onClick={handleConnect} disabled={connectionState === ConnectionState.CONNECTING} className="text-xs bg-ncss-purple text-white px-3 py-1 rounded hover:bg-purple-800 font-medium disabled:opacity-50">
              {connectionState === ConnectionState.CONNECTING ? 'Connecting...' : 'Start Interview'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {showPasteInput && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste existing transcript or notes here..."
              className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-ncss-purple focus:outline-none focus:border-ncss-purple mb-2 resize-none bg-white"
            />
            <button 
              onClick={handleManualSubmit}
              disabled={!pastedText.trim()}
              className="w-full bg-slate-800 text-white text-xs font-bold py-2 rounded hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              Add to Transcript
            </button>
          </div>
        )}

        <div className="p-4 space-y-4">
          {transcriptHistory.length === 0 && !liveInputText && !showPasteInput && (
            <div className="text-center text-gray-400 mt-10 text-sm italic">
              Waiting for input...
              <br/>Start live interview or paste text.
            </div>
          )}
          
          {/* Committed History */}
          {transcriptHistory.map((item) => (
            <div key={item.id} className={`flex ${item.speaker === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                item.speaker === 'user' 
                  ? 'bg-gray-100 text-gray-800 rounded-bl-none' 
                  : 'bg-ncss-teal/10 text-ncss-teal rounded-br-none border border-ncss-teal/20'
              }`}>
                <div className="text-xs font-bold mb-1 opacity-70">
                  {item.speaker === 'user' ? 'Interviewee / User' : 'Co-Interviewer (Gemini)'}
                </div>
                {item.text}
              </div>
            </div>
          ))}

          {/* Live Streaming Buffers */}
          {liveInputText && (
            <div className="flex justify-start opacity-70">
              <div className="max-w-[85%] rounded-lg p-3 text-sm bg-gray-50 text-gray-600 border border-dashed border-gray-300 rounded-bl-none">
                <div className="text-xs font-bold mb-1 opacity-70">Speaking...</div>
                {liveInputText}
                <span className="inline-block w-1 h-3 ml-1 bg-gray-400 animate-pulse"/>
              </div>
            </div>
          )}
           {liveOutputText && (
            <div className="flex justify-end opacity-70">
              <div className="max-w-[85%] rounded-lg p-3 text-sm bg-teal-50 text-teal-600 border border-dashed border-teal-200 rounded-br-none">
                <div className="text-xs font-bold mb-1 opacity-70">Thinking...</div>
                {liveOutputText}
                <span className="inline-block w-1 h-3 ml-1 bg-teal-400 animate-pulse"/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};