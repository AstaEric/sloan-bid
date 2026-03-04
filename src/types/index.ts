export interface Section {
  id: string;
  days: string;
  time: string;
  dayKeys: string[]; // e.g. ['Mon', 'Wed']
  startHour: number;
  endHour: number;
}

export interface Course {
  id: string;
  number: string;
  title: string;
  professor: string;
  rating: number;
  reviewQuote: string;
  sections: Section[];
  isCompleted?: boolean;
}

export type Screen = 'login' | 'discover' | 'prioritize' | 'schedule';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

export interface ScheduledCourse {
  course: Course;
  section: Section;
  tier: 'need' | 'nice';
  bidPoints: number;
}

export interface ConflictInfo {
  courseA: Course;
  courseB: Course;
  section: Section;
}
