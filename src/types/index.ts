export interface Section {
  id: string;
  days: string;
  time: string;
  dayKeys: string[]; // e.g. ['Mon', 'Wed']
  startHour: number;
  endHour: number;
}

export type Term = 'Full' | 'H3' | 'H4';

export interface Course {
  id: string;
  number: string;
  title: string;
  professor: string;
  rating: number;
  reviewQuote: string;
  description: string;
  sections: Section[];
  term: Term;
  units: number;
  isCompleted?: boolean;
}

export type Screen = 'login' | 'discover' | 'prioritize' | 'schedule' | 'browse';

export interface ChatAction {
  label: string;
  value: string;
}

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  actions?: ChatAction[];
  actionsHandled?: boolean;
}
