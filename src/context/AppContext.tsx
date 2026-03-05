import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Course, Screen, ChatMessage, ScheduledCourse } from '../types';
import { STUDENT } from '../data/courses';

interface AppState {
  screen: Screen;
  setScreen: (s: Screen) => void;
  addedCourses: Course[];
  addCourse: (c: Course) => void;
  removeCourse: (id: string) => void;
  needToHave: Course[];
  niceToHave: Course[];
  setNeedToHave: (courses: Course[]) => void;
  setNiceToHave: (courses: Course[]) => void;
  isChatOpen: boolean;
  toggleChat: () => void;
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  scheduledCourses: ScheduledCourse[];
  setScheduledCourses: (sc: ScheduledCourse[]) => void;
  bidPoints: Record<string, number>;
  setBidPoints: (bp: Record<string, number>) => void;
  student: typeof STUDENT;
}

const AppContext = createContext<AppState | null>(null);

const INITIAL_CHAT: ChatMessage[] = [
  {
    id: 'init',
    role: 'assistant',
    text: "Hi Astrid! I can help you think through your course priorities and schedule. What are your goals for this semester?",
  },
];

const AI_RESPONSES = [
  "Based on your priorities, I'd suggest putting more bid points on AI for Decision Makers — it fills up fast and has high demand.",
  "You have a conflict on Mon/Wed 10am. Since New Enterprises only has one section, I'd prioritize that and switch AI for Decision Makers to the Tue/Thu section.",
  "Your schedule looks solid! You have a good mix of quantitative and soft-skill courses. Ready to review your final bid?",
];

let aiResponseIndex = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [addedCourses, setAddedCourses] = useState<Course[]>([]);
  const [needToHave, setNeedToHave] = useState<Course[]>([]);
  const [niceToHave, setNiceToHave] = useState<Course[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [scheduledCourses, setScheduledCourses] = useState<ScheduledCourse[]>([]);
  const [bidPoints, setBidPoints] = useState<Record<string, number>>({});

  const addCourse = (c: Course) => {
    if (!addedCourses.find((x) => x.id === c.id)) {
      setAddedCourses((prev) => [...prev, c]);
    }
  };

  const removeCourse = (id: string) => {
    setAddedCourses((prev) => prev.filter((c) => c.id !== id));
    setNeedToHave((prev) => prev.filter((c) => c.id !== id));
    setNiceToHave((prev) => prev.filter((c) => c.id !== id));
  };

  const toggleChat = () => setIsChatOpen((v) => !v);

  const addChatMessage = (msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
    if (msg.role === 'user') {
      setTimeout(() => {
        const response = AI_RESPONSES[aiResponseIndex % AI_RESPONSES.length];
        aiResponseIndex++;
        setChatMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, role: 'assistant', text: response },
        ]);
      }, 800);
    }
  };

  return (
    <AppContext.Provider
      value={{
        screen,
        setScreen,
        addedCourses,
        addCourse,
        removeCourse,
        needToHave,
        niceToHave,
        setNeedToHave,
        setNiceToHave,
        isChatOpen,
        toggleChat,
        chatMessages,
        addChatMessage,
        scheduledCourses,
        setScheduledCourses,
        bidPoints,
        setBidPoints,
        student: STUDENT,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
