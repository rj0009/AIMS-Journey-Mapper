import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { JourneyMapData, TranscriptItem, JourneyStage } from "../types";

// Note: In a real deployment, keys should be proxied or handled securely.
// Using process.env.API_KEY as per instructions.
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEYY });

// Define types locally inferred from the SDK instance since they are not exported directly
type LiveSession = Awaited<ReturnType<typeof ai.live.connect>>;

// --- Audio Handling Utilities ---

function createBlob(data: Float32Array): { data: string; mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp values to [-1, 1] range to prevent distortion before scaling
    const s = Math.max(-1, Math.min(1, data[i]));
    // Scale to 16-bit integer range
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  // Convert to binary string safely to avoid stack overflow with large buffers
  let binary = '';
  const bytes = new Uint8Array(int16.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- Live API Service ---

export class LiveApiService {
  private sessionPromise: Promise<LiveSession> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  async connect(
    onOpen: () => void,
    onMessage: (msg: LiveServerMessage) => void,
    onError: (err: ErrorEvent) => void,
    onClose: (evt: CloseEvent) => void
  ) {
    // CRITICAL: Store the promise so we can use it in callbacks to avoid race conditions
    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      callbacks: {
        onopen: async () => {
          onOpen();
          try {
            await this.startAudioStream();
          } catch (e) {
             console.error("Audio stream failed:", e);
             // Propagate error if audio fails
             onError(new ErrorEvent('error', { message: "Microphone access failed. Not Supported." }));
          }
        },
        onmessage: onMessage,
        onerror: onError,
        onclose: onClose,
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: `You are a helpful co-interviewer for a social service product manager mapping a customer journey.
        When asked to start, provide a brief, warm preamble setting the context and ask a gentle opening question.
        During the rest of the interview, primarily listen. 
        Only speak if you identify a critical missing piece of information regarding the user journey (e.g., missed touchpoints or emotions). 
        Do not repeat what the user says.`,
        inputAudioTranscription: {}, 
        outputAudioTranscription: {}
      },
    });

    // Await the initial connection to catch early errors
    await this.sessionPromise;
  }

  private async startAudioStream() {
    // Relaxed constraints: Remove specific sampleRate to prevent "Not Supported" / OverconstrainedError
    // Browser will give native rate, and AudioContext below will handle resampling to 16000.
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    // Explicitly request 16k for the processing context.
    // The browser handles the resampling from the mic's native rate to this context's rate.
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBlob = createBlob(inputData);
      
      // CRITICAL: Use the sessionPromise to ensure we send to a connected session
      this.sessionPromise?.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  async disconnect() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioContext) {
      await this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    
    if (this.sessionPromise) {
      const session = await this.sessionPromise;
      // Use type casting if close exists but isn't typed
      if (typeof (session as any).close === 'function') {
        (session as any).close();
      }
      this.sessionPromise = null;
    }
  }

  sendText(text: string) {
    this.sessionPromise?.then((session) => {
      // Cast to any because 'send' is not exposed in the LiveSession type definition
      // but is required to send client content like text turns.
      (session as any).send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        }
      });
    });
  }
}

// --- Content Generation Services ---

// Helper to ensure the model's JSON response has all required arrays
const sanitizeJourneyMap = (data: any): JourneyMapData => {
  if (!data || typeof data !== 'object') {
    throw new Error("Invalid data format received from AI");
  }
  return {
    title: data.title || "Untitled Journey",
    stages: (Array.isArray(data.stages) ? data.stages : []).map((stage: any) => ({
      name: stage.name || "Unknown Stage",
      userActions: Array.isArray(stage.userActions) ? stage.userActions : [],
      touchpoints: Array.isArray(stage.touchpoints) ? stage.touchpoints : [],
      emotions: stage.emotions || "😐",
      painPoints: Array.isArray(stage.painPoints) ? stage.painPoints : [],
      opportunities: Array.isArray(stage.opportunities) ? stage.opportunities : [],
    }))
  };
};

export const analyzeTranscriptForMap = async (transcriptHistory: TranscriptItem[]): Promise<JourneyMapData | null> => {
  if (transcriptHistory.length === 0) return null;

  // Convert structured history to a formatted string for the model
  const formattedTranscript = transcriptHistory.map(item => {
    // Labeling broadly to help the model, though we ask it to infer context below
    const speakerLabel = item.speaker === 'model' ? 'AI Co-Pilot' : 'Human (Microphone)';
    return `${speakerLabel}: ${item.text}`;
  }).join('\n\n');

  // Relaxed schema to ensure valid JSON even with partial data
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      stages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            userActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            touchpoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotions: { type: Type.STRING, description: "A single emoji representing the mood" },
            painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          // Removed 'required' for inner fields to allow flexible partial generation
        }
      }
    },
    required: ["title", "stages"]
  };

  // Timeout promise to prevent hanging indefinitely (increased to 90s for complex analysis)
  const timeoutMs = 90000;
  const timeoutPromise = new Promise<null>((_, reject) => 
    setTimeout(() => reject(new Error("Analysis timed out. The model took too long to respond.")), timeoutMs)
  );

  try {
    const apiCall = ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyze the following interview transcript and construct a Customer Journey Map for a social service agency.
      
      *** CRITICAL SPEAKER INSTRUCTION ***
      The lines labeled 'Human (Microphone)' contain speech from TWO different people sharing one device:
      1. **The Interviewer**: Asking questions, clarifying, guiding. (e.g., "How did that make you feel?", "And then what happened?")
      2. **The Interviewee (Client)**: Sharing their personal story, pain points, and journey. (e.g., "I felt lost," "I went to the counter.")
      
      **YOUR TASK**:
      - IGNORE the Interviewer's administrative questions/remarks.
      - **Map ONLY the Interviewee's journey.**
      - Infer the stages based on the Interviewee's narrative.
      
      Identify 5 key stages: Awareness, Consideration, Decision, Service Delivery, and Retention/Exit.
      If information for a stage is missing, make reasonable inferences based on the context or leave that specific field empty.
      
      Transcript:
      ${formattedTranscript}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    // Race against timeout
    const response: any = await Promise.race([apiCall, timeoutPromise]);

    if (!response || !response.text) {
      throw new Error("Empty response from AI");
    }

    // Handle potential Markdown wrapping in response
    let jsonText = response.text;
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const rawData = JSON.parse(jsonText);
    // Sanitize to prevent missing array errors (undefined.join)
    return sanitizeJourneyMap(rawData);

  } catch (error) {
    console.error("Analysis error:", error);
    throw error; // Re-throw so UI can handle it
  }
};

export const generateFollowUpQuestions = async (transcriptHistory: TranscriptItem[]): Promise<string[]> => {
  if (transcriptHistory.length === 0) return [];
  
  const formattedTranscript = transcriptHistory.slice(-10).map(item => 
    `${item.speaker === 'model' ? 'AI' : 'Human'}: ${item.text}`
  ).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Based on this interview snippet, suggest 3 empathetic follow-up questions for the Product Manager to ask the Client.
      Focus on uncovering hidden pain points.
      
      Snippet: 
      ${formattedTranscript}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["questions"]
        }
      }
    });

    const parsed = JSON.parse(response.text);
    return parsed.questions || [];
  } catch (e) {
    // console.error("Suggestion error:", e);
    return [];
  }
};

export const refineMapWithChat = async (currentMap: JourneyMapData, userPrompt: string): Promise<JourneyMapData> => {
  const schema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      stages: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            userActions: { type: Type.ARRAY, items: { type: Type.STRING } },
            touchpoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotions: { type: Type.STRING },
            painPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          // Relaxed schema here as well
        }
      }
    },
    required: ["title", "stages"]
  };

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Current Journey Map JSON: ${JSON.stringify(currentMap)}
    
    User Request: ${userPrompt}
    
    Update the Journey Map JSON based on the user's request. Maintain the structure.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });

  const rawData = JSON.parse(response.text);
  return sanitizeJourneyMap(rawData);
}

export const generateTouchpointImage = async (prompt: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: `Simple, flat vector illustration, social service context: ${prompt}` }]
        },
        config: {
            imageConfig: {
                aspectRatio: "1:1",
            }
        }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    return null;
  } catch (e) {
    console.error("Image gen failed", e);
    return null;
  }
}
