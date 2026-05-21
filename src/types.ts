export interface KeyPointFlashcard {
  term: string;
  explanation: string;
}

export interface QuizQuestion {
  id?: string;
  question: string;
  options: string[];
  correctAnswer?: number; // Index in options (0, 1, 2, 3)
  answer?: string; // String choice (e.g. "A", "B", "C", "D")
  explanation: string;
}

export interface LectureNote {
  id: string;
  title: string;
  createdAt: string;
  sourceType: 'voice' | 'ppt' | 'youtube';
  sourceValue: string; // File name, URL, or placeholder
  transcript: string;
  summary: string;
  keyPoints: string[];
  quiz: QuizQuestion[];
  
  // New rich features matching the strict backend rules
  summary_one_minute?: string[];
  full_digest?: string;
  key_points_flashcards?: KeyPointFlashcard[];
}

export type ActiveTab = 'input' | 'notes' | 'quiz' | 'history' | 'cram' | 'settings';

export interface SavedSession {
  id: string;
  title: string;
  date: string;
}

