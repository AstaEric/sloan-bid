import { createContext, useContext, useState, useRef, type ReactNode } from 'react';
import type { Course, Screen, ChatMessage } from '../types';
import { STUDENT } from '../data/courses';
import { generateAIResponse } from '../utils/aiCounselor';

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
  sectionOverrides: Record<string, string>;
  setSectionOverride: (courseId: string, sectionId: string) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [addedCourses, setAddedCourses] = useState<Course[]>([]);
  const [needToHave, setNeedToHave] = useState<Course[]>([]);
  const [niceToHave, setNiceToHave] = useState<Course[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string>>({});

  // Refs for stale-closure prevention in setTimeout
  const needRef = useRef(needToHave);
  needRef.current = needToHave;
  const niceRef = useRef(niceToHave);
  niceRef.current = niceToHave;
  const overridesRef = useRef(sectionOverrides);
  overridesRef.current = sectionOverrides;

  const addCourse = (c: Course) => {
    if (!addedCourses.find((x) => x.id === c.id)) {
      setAddedCourses((prev) => [...prev, c]);
    }
  };

  const removeCourse = (id: string) => {
    setAddedCourses((prev) => prev.filter((c) => c.id !== id));
    setNeedToHave((prev) => prev.filter((c) => c.id !== id));
    setNiceToHave((prev) => prev.filter((c) => c.id !== id));
    setSectionOverrides((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleChat = () => setIsChatOpen((v) => !v);

  const setSectionOverride = (courseId: string, sectionId: string) => {
    setSectionOverrides((prev) => ({ ...prev, [courseId]: sectionId }));
  };

  const addChatMessage = (msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
    if (msg.role === 'user') {
      setTimeout(() => {
        const result = generateAIResponse(msg.text, {
          needToHave: needRef.current,
          niceToHave: niceRef.current,
          sectionOverrides: overridesRef.current,
        });

        if (result.sectionOverride) {
          setSectionOverrides((prev) => ({
            ...prev,
            [result.sectionOverride!.courseId]: result.sectionOverride!.sectionId,
          }));
        }

        setChatMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, role: 'assistant', text: result.text },
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
        sectionOverrides,
        setSectionOverride,
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
