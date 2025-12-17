export interface TranscriptItem {
  id: string;
  speaker: 'user' | 'agent' | 'model';
  text: string;
  timestamp: Date;
}

export interface JourneyStage {
  name: string; // e.g., Awareness, Consideration
  userActions: string[];
  touchpoints: string[];
  emotions: string; // Emoji or description
  painPoints: string[];
  opportunities: string[];
}

export interface JourneyMapData {
  title: string;
  stages: JourneyStage[];
}

export interface Suggestion {
  id: string;
  type: 'question' | 'insight';
  text: string;
}

export enum ConnectionState {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  ERROR
}
