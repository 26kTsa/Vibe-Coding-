/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Mic, MicOff, Video, FileText, Lightbulb, 
  CheckCircle, TrendingUp, Trophy, Play, Square, Flame, 
  BookOpen, ChevronRight, Copy, Plus, Trash, RotateCcw, 
  Code, Info, Smartphone, FileSpreadsheet, ExternalLink,
  BookMarked, HelpCircle, AlertCircle, RefreshCw, ThumbsUp,
  Settings, LogOut, X
} from 'lucide-react';
import { LectureNote, QuizQuestion, ActiveTab, KeyPointFlashcard } from './types';
import { PRESETS } from './data/presets';
import { INITIAL_CRAM_DB, CramItem } from './data/cramDb';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('input');
  
  // Input fields
  const [sourceType, setSourceType] = useState<'voice' | 'ppt' | 'youtube'>('voice');
  const [lectureTitle, setLectureTitle] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  
  // Slide Upload state
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [uploadedFileMimeType, setUploadedFileMimeType] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  
  // Microphone recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordInterval = useRef<any>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // App notes database
  const [notesList, setNotesList] = useState<LectureNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active quiz state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  // AI Prompt Generator Parameters
  const [coachPlatform, setCoachPlatform] = useState<'Lovable' | 'Bolt.new' | 'Claude Code'>('Lovable');
  const [coachBackend, setCoachBackend] = useState<'LocalStorage' | 'Supabase'>('LocalStorage');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Authentication & Web Settings States
  const [currentUser, setCurrentUser] = useState<{ email: string; customName: string } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const [settingsName, setSettingsName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsOldPassword, setSettingsOldPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Mobile Sidebar & Modals
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showHomeIntro, setShowHomeIntro] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  // File Upload states and reference mapping
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Helper functions for Taiwan calendar days (synchronized to Asia/Taipei timezone)
  const getTaiwanDateDetails = (offsetDays = 0) => {
    const d = new Date();
    if (offsetDays !== 0) {
      d.setDate(d.getDate() - offsetDays);
    }
    const formatter = new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short'
    });
    const parts = formatter.formatToParts(d);
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    const weekday = parts.find(p => p.type === 'weekday')?.value || '';
    
    const key = `${month}/${day}`;
    return {
      key,
      display: `${month}/${day} (${weekday})`,
      isToday: offsetDays === 0
    };
  };

  const getTaiwan30Days = (): { key: string; display: string; isToday: boolean }[] => {
    const list = [];
    for (let i = 0; i < 30; i++) {
      list.push(getTaiwanDateDetails(i));
    }
    return list;
  };

  // Daily Streak and Attendance Logs (Taiwan Time system, 30 days maximum)
  const [checkInLogs, setCheckInLogs] = useState<{[key: string]: boolean}>(() => {
    try {
      const savedLogs = localStorage.getItem('organizer_checkin_logs_v2');
      if (savedLogs) {
        return JSON.parse(savedLogs);
      }
    } catch (e) {
      console.error(e);
    }
    
    // Seed initial active state for first 3 days within Asia/Taipei timezone so it starts initialized beautifully
    const initialLogs: {[key: string]: boolean} = {};
    for (let i = 0; i < 30; i++) {
      const d = getTaiwanDateDetails(i);
      initialLogs[d.key] = i < 3;
    }
    return initialLogs;
  });

  // Automatically save logs on change
  useEffect(() => {
    try {
      localStorage.setItem('organizer_checkin_logs_v2', JSON.stringify(checkInLogs));
    } catch (e) {
      console.error(e);
    }
  }, [checkInLogs]);

  // Helper to calculate consecutive check-in days backwards from today starting on Taiwan UTC+8
  const calculateStreak = (logs: {[key: string]: boolean}) => {
    let streakCount = 0;
    const todayKey = getTaiwanDateDetails(0).key;
    const yesterdayKey = getTaiwanDateDetails(1).key;
    
    let startIndex = 0;
    if (logs[todayKey]) {
      startIndex = 0;
    } else if (logs[yesterdayKey]) {
      startIndex = 1;
    } else {
      return 0; // Streak broken: neither today nor yesterday has been checked in
    }
    
    for (let i = startIndex; i < 30; i++) {
      const dateKey = getTaiwanDateDetails(i).key;
      if (logs[dateKey]) {
        streakCount++;
      } else {
        break;
      }
    }
    return Math.min(streakCount, 30);
  };

  const streakDays = calculateStreak(checkInLogs);

  // Initialize Users DB and Current User on Mount
  useEffect(() => {
    try {
      // Setup demo account if not exists
      const usersDb = localStorage.getItem('organizer_users_db');
      if (!usersDb) {
        const initialDb = {
          'demo@example.com': {
            email: 'demo@example.com',
            password: 'password',
            customName: '傑克學長'
          }
        };
        localStorage.setItem('organizer_users_db', JSON.stringify(initialDb));
      }

      const activeUser = localStorage.getItem('organizer_current_user');
      if (activeUser) {
        setCurrentUser(JSON.parse(activeUser));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Sync settings inputs when tab changes or user changes
  useEffect(() => {
    if (currentUser) {
      setSettingsName(currentUser.customName);
      setSettingsEmail(currentUser.email);
    }
  }, [currentUser, activeTab]);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);

    const email = authEmail.trim();
    const password = authPassword.trim();
    const name = authName.trim();

    if (!email || !password) {
      setAuthError('請填寫所有必要欄位（Email 與 密碼）');
      return;
    }

    try {
      const usersDb = JSON.parse(localStorage.getItem('organizer_users_db') || '{}');

      if (authMode === 'login') {
        const matched = usersDb[email];
        if (!matched) {
          setAuthError('找無此帳號，請確認 Email 是否正確，或切換至註冊！');
          return;
        }
        if (matched.password !== password) {
          setAuthError('密碼輸入錯誤，請再試一次！');
          return;
        }
        
        // Success
        const userObj = { email: matched.email, customName: matched.customName };
        setCurrentUser(userObj);
        localStorage.setItem('organizer_current_user', JSON.stringify(userObj));
      } else {
        // Signup
        if (!name) {
          setAuthError('註冊帳號需要提供您的自訂名稱！');
          return;
        }
        if (usersDb[email]) {
          setAuthError('此 Email 帳號已被註冊！請直接嘗試登入。');
          return;
        }

        // Create new
        const newRecord = { email, password, customName: name };
        usersDb[email] = newRecord;
        localStorage.setItem('organizer_users_db', JSON.stringify(usersDb));

        setAuthSuccess('帳號建立成功！已為您自動登入！');
        setTimeout(() => {
          const userObj = { email, customName: name };
          setCurrentUser(userObj);
          localStorage.setItem('organizer_current_user', JSON.stringify(userObj));
        }, 800);
      }
    } catch (err) {
      setAuthError('操作系統失敗，請重新再試。');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(null);

    if (!settingsName.trim() || !settingsEmail.trim()) {
      setSettingsError('自訂名稱與 Email 不能為空！');
      return;
    }

    try {
      const usersDb = JSON.parse(localStorage.getItem('organizer_users_db') || '{}');
      const emailKey = currentUser?.email || '';

      if (usersDb[emailKey]) {
        // If changing password is filled
        if (settingsNewPassword) {
          if (!settingsOldPassword) {
            setSettingsError('欲變更密碼，請先輸入舊密碼驗證！');
            return;
          }
          if (usersDb[emailKey].password !== settingsOldPassword) {
            setSettingsError('舊密碼核對錯誤！暫沒能為您變更新密碼。');
            return;
          }
          usersDb[emailKey].password = settingsNewPassword;
        }

        // Update data
        usersDb[emailKey].customName = settingsName;
        localStorage.setItem('organizer_users_db', JSON.stringify(usersDb));

        const updatedUser = { email: currentUser?.email || settingsEmail, customName: settingsName };
        setCurrentUser(updatedUser);
        localStorage.setItem('organizer_current_user', JSON.stringify(updatedUser));
        
        setSettingsSuccess('個人資料設定已成功儲存 ⚙️');
        setSettingsOldPassword('');
        setSettingsNewPassword('');
      } else {
        setSettingsError('找不到當前登入者之本機使用者記錄！');
      }
    } catch (e) {
      setSettingsError('更新儲存失敗，請重試。');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('organizer_current_user');
    setActiveTab('input');
    setAuthEmail('');
    setAuthPassword('');
    setAuthName('');
    setAuthError(null);
    setAuthSuccess(null);
  };

  // Audio stream visualization
  const [visualizerBars, setVisualizerBars] = useState<number[]>(Array(15).fill(10));
  const visualInterval = useRef<NodeJS.Timeout | null>(null);

  // Sub-navigation state for interactive flashcard and one-minute study review
  const [activeSubNotesTab, setActiveSubNotesTab] = useState<'digest' | 'flashcards' | 'notebook_chat'>('digest');
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  // Multi-source grounded interactive states
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [notebookChatQuery, setNotebookChatQuery] = useState('');
  const [notebookChatHistory, setNotebookChatHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [activeGuideType, setActiveGuideType] = useState<'faq' | 'study_guide' | 'timeline' | 'briefing' | null>(null);
  const [generatedGuideContent, setGeneratedGuideContent] = useState<string | null>(null);
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [highlightedSectionText, setHighlightedSectionText] = useState<string | null>(null);

  // Cram Hub Search & filter states
  const [cramGrade, setCramGrade] = useState<string>('');
  const [cramSubject, setCramSubject] = useState<string>('');
  const [cramResults, setCramResults] = useState<CramItem[]>(INITIAL_CRAM_DB);
  const [isSearchingCram, setIsSearchingCram] = useState<boolean>(false);
  const [cramErrorMessage, setCramErrorMessage] = useState<string | null>(null);
  const [likedCrams, setLikedCrams] = useState<Record<string, number>>({});


  // Load active note & history from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_lecture_notes');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Normalize loaded notes quiz questions to make sure correctAnswer (number indices) is always generated or filled accurately
        const normalized = parsed.map((n: LectureNote) => ({
          ...n,
          quiz: n.quiz ? n.quiz.map(q => {
            let corrVal = q.correctAnswer;
            if (typeof corrVal !== 'number' && typeof q.answer === 'string') {
              corrVal = q.answer.trim().toUpperCase().charCodeAt(0) - 65;
            }
            if (typeof corrVal !== 'number') {
              corrVal = 0;
            }
            return {
              ...q,
              correctAnswer: corrVal,
              answer: q.answer || String.fromCharCode(65 + corrVal)
            };
          }) : []
        }));
        setNotesList(normalized);
        if (normalized.length > 0) {
          setActiveNoteId(normalized[0].id);
        }
      } else {
        // Hydrate mock historical session if empty so user gets high fidelity feels immediately
        const mockNote: LectureNote = {
          id: 'mock-initial',
          title: 'JavaScript 異步程式設計與 Event Loop',
          createdAt: new Date().toLocaleDateString('zh-TW') + ' ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
          sourceType: 'youtube',
          sourceValue: 'https://youtube.com/watch?v=event-loop',
          transcript: `1. JavaScript 是單線程設計，其非同步機制完全依賴「事件循環（Event Loop）」機制。\n2. 同步任務直接依序推入 Call Stack 執行；非同步任務則進入背景，完成後排在 Callback Queue 中待命。\n3. Microtask Queue 包括 Promise.then, process.nextTick。Macrotask Queue 包括 setTimeout, setInterval, I/O。\n4. 每次事件循環，Call Stack 一旦清空，JS 引擎必先徹底清空整個 Microtask Queue，而後才取出一個 Macrotask 執行。`,
          summary: '這堂課說明了 JavaScript 的事件驅動模型 (Event-Driven Architecture) 的核心：Event Loop。單線程的 JS 得以不阻塞運作，完全仰賴將非同步回調發送至 Microtask 與 Macrotask 隊列，並依照特定優先順序載入調度，這是前端工程師最關鍵的進階基石。',
          keyPoints: [
            'JS 屬於單執行緒 (Single-threaded) 語言，具有一張 Call Stack。',
            '事件循環專責在堆疊清空時，將隊列中等待執行的回調函數移回堆疊.（LIFO 結構）',
            '微任務 (Microtasks) 優先級嚴格高於宏任務 (Macrotasks)。',
            '理解 Microtask 的清空順序，能解決大部分的複雜非同步競態問題 (Race Conditions)。'
          ],
          summary_one_minute: [
            'JS 屬於單執行緒 (Single-threaded) 語言，具有一張 Call Stack。',
            '事件循環專責在堆疊清空時，將隊列中等待執行的回調函數移回堆疊。',
            '微任務 (Microtasks) 優先級嚴格高於宏任務 (Macrotasks)。',
            '理解 Microtask 的清空順序，能解決大部分的複雜非同步競態問題。'
          ],
          full_digest: `### 🚀 什麼是事件循環 (Event Loop)？
JavaScript 是一門**單執行緒**的程式語言。這表示它在同一時間只能執行一個任務。為了在不阻塞網頁渲染的情況下處理非同步操作（如 AJAX、API 呼叫、網頁定時器等），瀏覽器與 Node.js 提供了事件循環機制來協調這些回調的載入。

### 📌 宏任務與微任務的核心差異
在 JavaScript 的執行機制中，任務佇列分為兩大類，它們在每次迴圈中的優先級是完全不同的：

1. **Microtask Queue (微任務佇列)**
   * **成員**：\`Promise.then()\`、\`MutationObserver\`、\`process.nextTick\`。
   * **特色**：優先處理等級最高。每當呼叫堆疊清空，Event Loop **必先徹底清空**所有的微任務才會往下執行。
   
2. **Macrotask Queue (宏任務佇列)**
   * **成員**：\`setTimeout\`、\`setInterval\`、\`setImmediate\`、I/O 操作。
   * **特色**：每次事件循環只會從中取出**一個**宏任務來執行，隨後再次去檢查與排空微任務。`,
          key_points_flashcards: [
            { term: 'Call Stack (呼叫堆疊)', explanation: '負責追蹤當前正在執行中的程式碼區塊。符合 LIFO (後進先出) 結構。當任務執行完，就會被彈出。' },
            { term: 'Event Loop (事件循環)', explanation: '專責監控堆疊。當偵測到堆疊為空時，會自佇列中移取下一個非同步任務回調推入堆疊中執行。' },
            { term: 'Microtask Queue (微任務隊列)', explanation: '專門排入 Promise.then、MutationObserver回調的隊列。優先順序在所有 Macrotask 之前。' },
            { term: 'Macrotask Queue (宏任務隊列)', explanation: '存放系統時間器（setTimeout）、網路載入或 I/O 回調。每次迴圈只會調用其中一個執行。' }
          ],
          quiz: [
            {
              id: 'q1',
              question: '下列何者不屬於 Microtask (微任務)？',
              options: ['Promise.then() 回調', 'process.nextTick', 'setTimeout 回調', 'MutationObserver 回調'],
              answer: 'C',
              correctAnswer: 2,
              explanation: 'setTimeout 會在 Web API 背景計時結束後排入 Macrotask Queue (宏任務隊列)，其他三者皆會排入 Microtask Queue，其優先處理級更高。'
            },
            {
              id: 'q2',
              question: '在事件循環中，當 Call Stack 被清空時，Event Loop 會優先清空哪個隊列？',
              options: ['Macrotask Queue', 'Microtask Queue', '兩者隨機挑選', '完全不再清空'],
              answer: 'B',
              correctAnswer: 1,
              explanation: '每次 Call Stack 清空之後，Event Loop 絕對會先保證 Microtask Queue 是完全排空的，接著才讀取一個 Macrotask 執行。'
            }
          ]
        };
        setNotesList([mockNote]);
        setActiveNoteId(mockNote.id);
        localStorage.setItem('ai_lecture_notes', JSON.stringify([mockNote]));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Save changes to localStorage helper
  const saveNotesToLocal = (newNotes: LectureNote[]) => {
    setNotesList(newNotes);
    localStorage.setItem('ai_lecture_notes', JSON.stringify(newNotes));
  };

  // Synchronize selected sources when activeNoteId changes or new notes arrive
  useEffect(() => {
    if (activeNoteId) {
      setSelectedSourceIds(prev => {
        if (!prev.includes(activeNoteId)) {
          return [...prev, activeNoteId];
        }
        return prev;
      });
    }
  }, [activeNoteId]);

  // Selected Source Checklist Toggler
  const handleToggleSource = (noteId: string) => {
    setSelectedSourceIds(prev => {
      if (prev.includes(noteId)) {
        // Keep at least one source selected for a clean state
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== noteId);
      } else {
        return [...prev, noteId];
      }
    });
  };

  // Parse PPT, PDF, TXT text slides or paragraphs into outline
  const getOutlineSections = (note: LectureNote) => {
    const sections: { title: string; textToFind: string; isHeading: boolean }[] = [];
    const textToParse = note.full_digest || note.transcript || "";
    const lines = textToParse.split('\n');
    let headingCount = 0;
    
    // Check if there are Markdown headings
    for (const line of lines) {
      if (line.trim().startsWith('#')) {
        const cleanTitle = line.replace(/^#+\s*/, '').trim();
        sections.push({
          title: cleanTitle,
          textToFind: line.trim(),
          isHeading: true
        });
        headingCount++;
      }
    }
    
    // If no markdown headings, create logical sections from paragraphs
    if (headingCount === 0) {
      const paragraphs = textToParse.split(/\n\s*\n/).filter(p => p.trim().length > 20);
      paragraphs.forEach((para, idx) => {
        if (idx < 5) { // Limit to top 5 logical outline chapters
          const firstWords = para.trim().substring(0, 25) + '...';
          sections.push({
            title: `第 ${idx + 1} 章：${firstWords}`,
            textToFind: para.trim(),
            isHeading: false
          });
        }
      });
    }
    
    return sections;
  };

  // Helper to parse bold stars and file citations [1], [2] dynamically!
  const parseInlineFormatting = (inputText: string) => {
    if (!inputText) return '';
    const parts: React.ReactNode[] = [];
    let keyIdx = 0;

    // A simple parser for bold and bracket citations [1], [2], [1][2], etc.
    const regex = /(\*\*.*?\*\*|\[\d+\])/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(inputText)) !== null) {
      const matchText = match[0];
      const matchIndex = match.index;

      // Add text before match
      if (matchIndex > lastIndex) {
        parts.push(inputText.substring(lastIndex, matchIndex));
      }

      const cleanMatch = matchText.trim();
      if (cleanMatch.startsWith('**') && cleanMatch.endsWith('**')) {
        const innerSecret = cleanMatch.substring(2, cleanMatch.length - 2);
        parts.push(<strong key={`b-${keyIdx++}`} className="font-bold text-[#111110]">{innerSecret}</strong>);
      } else if (cleanMatch.startsWith('[') && cleanMatch.endsWith(']')) {
        const num = cleanMatch.substring(1, cleanMatch.length - 1);
        parts.push(
          <button
            key={`cite-${keyIdx++}`}
            onClick={() => handleCitationClick(num)}
            className="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-[9px] font-extrabold text-amber-700 bg-amber-100 hover:bg-amber-200 active:scale-95 rounded border border-amber-300 font-mono transition-colors shadow-none cursor-pointer"
            title={`點擊查看文件來源 [${num}] 詳細資訊`}
          >
            {num}
          </button>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < inputText.length) {
      parts.push(inputText.substring(lastIndex));
    }

    return parts.length > 0 ? parts : inputText;
  };

  const handleCitationClick = (numStr: string) => {
    const idx = parseInt(numStr, 10) - 1;
    if (idx >= 0 && idx < selectedSourceIds.length) {
      const matchedId = selectedSourceIds[idx];
      const note = notesList.find(n => n.id === matchedId);
      if (note) {
        // Highlight citation origin
        setErrorMessage(`📖 引用自來源 [${numStr}]：《${note.title}》`);
        setTimeout(() => setErrorMessage(null), 5000);
      }
    }
  };

  const renderMarkdownText = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
      <div className="space-y-3.5 text-xs text-[#37352F] leading-relaxed font-sans">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-2" />;
          
          let content = line;
          
          // Headings
          if (trimmed.startsWith('###')) {
            content = trimmed.replace(/^###\s*/, '');
            return <h4 key={idx} className="text-sm font-bold text-[#111110] mt-4 mb-2 flex items-center gap-1 border-b border-[#F1F1EF] pb-1 font-sans">{content}</h4>;
          }
          if (trimmed.startsWith('##')) {
            content = trimmed.replace(/^##\s*/, '');
            return <h3 key={idx} className="text-base font-bold text-[#111110] mt-5 mb-2 flex items-center gap-1.5 font-sans">{content}</h3>;
          }
          if (trimmed.startsWith('#')) {
            content = trimmed.replace(/^#\s*/, '');
            return <h2 key={idx} className="text-lg font-bold text-[#111110] mt-6 mb-3 flex items-center gap-2 font-sans">{content}</h2>;
          }
          
          // Blockquotes
          if (trimmed.startsWith('>')) {
            content = trimmed.replace(/^>\s*/, '');
            return (
              <blockquote key={idx} className="border-l-4 border-amber-500 pl-3.5 py-1 my-3 bg-[#FAF9E0] rounded-r text-[#5A5A57] font-medium italic">
                {parseInlineFormatting(content)}
              </blockquote>
            );
          }
          
          // Lists
          if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
            content = trimmed.replace(/^[\*\-]\s*/, '');
            return (
              <li key={idx} className="list-disc ml-4 pl-1 text-[#37352F]">
                {parseInlineFormatting(content)}
              </li>
            );
          }
          
          // Standard paragraphs
          return (
            <p key={idx} className="leading-relaxed text-[#37352F] font-medium whitespace-pre-line">
              {parseInlineFormatting(content)}
            </p>
          );
        })}
      </div>
    );
  };

  // Grounded Multi-Source Chat
  const handleSendNotebookChat = async () => {
    if (!notebookChatQuery.trim()) return;
    if (selectedSourceIds.length === 0) {
      setErrorMessage('請先選取至少一個文件筆記作為對話來源背景。');
      return;
    }

    const userMessage = notebookChatQuery;
    setNotebookChatQuery('');
    setNotebookChatHistory(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsChatting(true);

    try {
      const sourceTexts = selectedSourceIds.map((id, index) => {
        const note = notesList.find(n => n.id === id);
        if (!note) return "";
        return `【來源 [${index + 1}] 標題: ${note.title}】：\n${note.transcript}\n\n詳細章節及文摘概要:\n${note.full_digest || note.summary}`;
      }).filter(text => text.length > 0);

      const response = await fetch('/api/notebook/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sourceTexts,
          query: userMessage
        })
      });

      if (!response.ok) {
        throw new Error('AI 智慧對話解析失敗');
      }

      const data = await response.json();
      setNotebookChatHistory(prev => [...prev, { role: 'assistant', text: data.answer }]);
    } catch (e: any) {
      console.error(e);
      setNotebookChatHistory(prev => [...prev, { 
        role: 'assistant', 
        text: `⚠️ 系統提示：智慧對話發生錯誤（${e.message || '連線逾時'}）。請確認是否正確配置了 API Key，或切換下方 preset 樣板體驗不需設定的即時反應。` 
      }]);
    } finally {
      setIsChatting(false);
    }
  };

  // Study guide generators
  const handleGenerateNotebookGuide = async (guideType: 'faq' | 'study_guide' | 'timeline' | 'briefing') => {
    if (selectedSourceIds.length === 0) {
      setErrorMessage('請先勾選至少一個講義投影片或筆記檔案作為生成來源。');
      return;
    }

    setActiveGuideType(guideType);
    setIsGeneratingGuide(true);
    setGeneratedGuideContent(null);

    try {
      const sourceTexts = selectedSourceIds.map((id, index) => {
        const note = notesList.find(n => n.id === id);
        if (!note) return "";
        return `【來源 [${index + 1}] 標題: ${note.title}】\n${note.transcript}\n\n詳細文摘概要:\n${note.full_digest || note.summary}`;
      }).filter(text => text.length > 0);

      const response = await fetch('/api/notebook/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: sourceTexts,
          guideType
        })
      });

      if (!response.ok) {
        throw new Error('智慧文件導覽生成錯誤');
      }

      const data = await response.json();
      setGeneratedGuideContent(data.content);
    } catch (e: any) {
      console.error(e);
      setGeneratedGuideContent(`⚠️ 導覽生成失敗: ${e.message || '網路通訊阻礙，請確認 API Key 是否設定正確。'}`);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  // Handle Preset Clicks
  const selectPreset = (preset: typeof PRESETS[0]) => {
    setLectureTitle(preset.title);
    setSourceType(preset.sourceType);
    if (preset.sourceType === 'youtube') {
      setYtUrl(preset.sourceValue);
      setCustomContent(preset.content);
    } else if (preset.sourceType === 'ppt') {
      setCustomContent(preset.content);
    } else {
      setCustomContent(preset.content);
    }
  };

  // Audio voice recording utilizing real MediaRecorder API
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      
      // Determine best supported MIME type
      let selectedMimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
          selectedMimeType = 'audio/ogg';
        }
        if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
          selectedMimeType = 'audio/mp4';
        }
        if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
          selectedMimeType = 'audio/wav';
        }
        if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
          selectedMimeType = ''; // Use browser default
        }
      }

      const recorder = new MediaRecorder(stream, selectedMimeType ? { mimeType: selectedMimeType } : undefined);
      mediaRecorderRef.current = recorder;
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Stop all tracks on the stream to release the mic
        stream.getTracks().forEach(track => track.stop());

        if (audioChunksRef.current.length === 0) {
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        
        setIsTranscribingAudio(true);
        setErrorMessage(null);

        try {
          // Convert audio blob to base64
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Url = reader.result as string;
            const base64Data = base64Url.split(',')[1];

            // Send to our real backend speech-to-text API
            const response = await fetch('/api/transcribe-audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Data,
                mimeType: recorder.mimeType || 'audio/webm'
              })
            });

            if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.error || '語音轉文字請求失敗。');
            }

            const data = await response.json();
            if (data.transcript) {
              setCustomContent(data.transcript);
            }
            setIsTranscribingAudio(false);
          };
        } catch (error: any) {
          console.error('Transcription error:', error);
          setErrorMessage(`語音轉換失敗：${error.message || '請手動輸入重點段落內容。'}`);
          setIsTranscribingAudio(false);
        }
      };

      recorder.start(250); // Slice audio in 250ms chunks to keep it safe

      setIsRecording(true);
      setRecordSeconds(0);
      setLectureTitle(`課堂錄音筆記 - ${new Date().toLocaleDateString('zh-TW')}`);
      
      if (recordInterval.current) clearInterval(recordInterval.current);
      recordInterval.current = setInterval(() => {
        setRecordSeconds(prev => prev + 1);
      }, 1000);

      if (visualInterval.current) clearInterval(visualInterval.current);
      visualInterval.current = setInterval(() => {
        setVisualizerBars(Array(15).fill(0).map(() => Math.floor(Math.random() * 45) + 8));
      }, 150);

    } catch (err: any) {
      console.error('Mic permission denied or unsupported:', err);
      setErrorMessage('無法取得麥克風權限或瀏覽器不支援錄音。請確認已開啟權限，或直接貼上講義。');
      
      // Fallback mockup simulated fallback so it continues to work in headless preview contexts
      setIsRecording(true);
      setRecordSeconds(0);
      setLectureTitle(`課堂錄音筆記 (演示範本) - ${new Date().toLocaleDateString('zh-TW')}`);
      if (recordInterval.current) clearInterval(recordInterval.current);
      recordInterval.current = setInterval(() => {
        setRecordSeconds(prev => prev + 1);
      }, 1000);
      if (visualInterval.current) clearInterval(visualInterval.current);
      visualInterval.current = setInterval(() => {
        setVisualizerBars(Array(15).fill(0).map(() => Math.floor(Math.random() * 45) + 8));
      }, 150);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordInterval.current) clearInterval(recordInterval.current);
    if (visualInterval.current) clearInterval(visualInterval.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      // Mockup simulated fallback if mediaRecorder didn't capture or in sandbox fallback
      if (customContent.trim() === '') {
        setCustomContent(
          `[系統演示] 這是一份模擬的語音錄音逐字稿。語音轉換文字模組已完成高精度比對：本課主講電腦科學的極限運算、時間複雜度，與空間複雜度分析，我們需要特別理解 Big-O 符號的使用，尤其是 O(1) 與 O(log n) 的二分搜尋演算法效能。`
        );
      }
    }
  };

  // Drag and drop / file input click-to-trigger processors
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePickedFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handlePickedFile(e.target.files[0]);
    }
  };

  const handlePickedFile = (file: File) => {
    if (!file) return;
    setLectureTitle(file.name.replace(/\.[^/.]+$/, "")); // Auto populate lecture title
    setUploadedFileName(file.name);
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();

    if (extension === 'txt' || extension === 'md' || extension === 'json' || extension === 'csv') {
      reader.onload = (event) => {
        if (event.target?.result && typeof event.target.result === 'string') {
          setCustomContent(event.target.result);
          try {
            const base64Str = btoa(unescape(encodeURIComponent(event.target.result)));
            setUploadedFileBase64(base64Str);
            setUploadedFileMimeType('text/plain');
          } catch (e) {
            console.error('Text base64 conversion failed:', e);
          }
        }
      };
      reader.readAsText(file);
    } else {
      // PDF, PPT, images, doc...
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        if (base64Url && base64Url.includes(',')) {
          const base64Data = base64Url.split(',')[1];
          setUploadedFileBase64(base64Data);
          
          let fileType = file.type || 'application/octet-stream';
          if (!file.type) {
            if (extension === 'pdf') fileType = 'application/pdf';
            else if (extension === 'jpg' || extension === 'jpeg') fileType = 'image/jpeg';
            else if (extension === 'png') fileType = 'image/png';
            else if (extension === 'webp') fileType = 'image/webp';
          }
          setUploadedFileMimeType(fileType);
          
          const fileSizeKBs = Math.round(file.size / 1024);
          const outputText = [
            `=== 📥 已成功載入真實講義檔案 ===`,
            `檔案名稱：${file.name}`,
            `檔案大小：${fileSizeKBs} KB`,
            `檔案類型：${fileType}`,
            ``,
            `✨ [真實內容讀取模式已啟動] ✨`,
            `本系統已完成講義檔案的無損波型/結構預載。`,
            `當您點擊下方的「開始生成筆記與複習題」時，`,
            `後端 AI 引擎 (Gemini Multimodal Brain) 將 100% 直讀此檔案的真實內容及文字，不再使用隨機模擬生成。`,
            `如果您上傳的是 PDF 講義或精美簡報圖片，AI 將全面辨識圖表與公式，提煉考點！`
          ].join('\n');
          setCustomContent(outputText);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Fire Gemini AI API Request
  const handleSubmitToAI = async () => {
    let finalSourceVal = '';
    let contentToSubmit = customContent;

    if (sourceType === 'youtube') {
      if (!ytUrl.trim()) {
        setErrorMessage('請填寫 YouTube 影片連結。');
        return;
      }
      finalSourceVal = ytUrl;
      // Synthesize transcript outline for summary if custom transcript text isn't written
      if (!contentToSubmit.trim()) {
        contentToSubmit = `請分析此 YouTube 線上影片連結：${ytUrl}。探討課程核心邏輯、大綱摘要，並產生相應的考題與重點。`;
      }
    } else if (sourceType === 'ppt') {
      finalSourceVal = uploadedFileName || 'PPT投影片檔.pdf';
      if (!contentToSubmit.trim()) {
        setErrorMessage('請上傳您的投影片文字大綱或直接在此貼入投影片說明。');
        return;
      }
    } else {
      finalSourceVal = `音訊錄製 (${recordSeconds} 秒)`;
      if (!contentToSubmit.trim()) {
        setErrorMessage('請輸入或直接使用語音記錄轉出的逐字稿。');
        return;
      }
    }

    const titleToUse = lectureTitle.trim() || `AI課堂整理筆記 - ${new Date().toLocaleString('zh-TW')}`;
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType,
          title: titleToUse,
          content: contentToSubmit,
          ytUrl: sourceType === 'youtube' ? ytUrl : undefined,
          fileBase64: sourceType === 'ppt' ? uploadedFileBase64 : undefined,
          fileMimeType: sourceType === 'ppt' ? uploadedFileMimeType : undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '後端生成筆記失敗');
      }

      const generatedData = await response.json();

      const rawQuiz = generatedData.quiz || [];
      const normalizedQuiz = rawQuiz.map((q: any) => {
        let corrVal = q.correctAnswer;
        if (typeof corrVal !== 'number' && typeof q.answer === 'string') {
          corrVal = q.answer.trim().toUpperCase().charCodeAt(0) - 65;
        }
        if (typeof corrVal !== 'number') {
          corrVal = 0;
        }
        return {
          ...q,
          correctAnswer: corrVal,
          answer: q.answer || String.fromCharCode(65 + corrVal)
        };
      });

      const newNote: LectureNote = {
        id: 'note-' + Date.now(),
        title: titleToUse,
        createdAt: new Date().toLocaleDateString('zh-TW') + ' ' + new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
        sourceType,
        sourceValue: finalSourceVal,
        transcript: generatedData.transcript || '',
        summary: generatedData.full_digest || generatedData.summary || '',
        keyPoints: generatedData.summary_one_minute || generatedData.keyPoints || [],
        quiz: normalizedQuiz,
        
        // Save modern rich structures
        summary_one_minute: generatedData.summary_one_minute,
        full_digest: generatedData.full_digest,
        key_points_flashcards: generatedData.key_points_flashcards,
      };

      const updated = [newNote, ...notesList];
      saveNotesToLocal(updated);
      setActiveNoteId(newNote.id);
      
      // Update streak and push to summary tab
      const todayKey = getTaiwanDateDetails(0).key;
      setCheckInLogs(prev => ({
        ...prev,
        [todayKey]: true
      }));
      setActiveTab('notes');

      // Clear fields
      setLectureTitle('');
      setCustomContent('');
      setYtUrl('');
      setUploadedFileBase64(null);
      setUploadedFileMimeType(null);
      setUploadedFileName(null);

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '連線逾時或 API Key 異常，請點擊上方 preset 樣板體驗不需設定的即時反應');
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Note Helper
  const deleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = notesList.filter(n => n.id !== noteId);
    saveNotesToLocal(updated);
    if (activeNoteId === noteId) {
      setActiveNoteId(updated.length > 0 ? updated[0].id : null);
    }
  };

  // Active quiz handling
  const activeNote = notesList.find(n => n.id === activeNoteId);
  const quizQuestions = activeNote?.quiz || [];

  const handleSelectAnswer = (index: number) => {
    if (isAnswerSubmitted) return;
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null || isAnswerSubmitted) return;
    
    // Check if correct (supports both indices and letter mappings)
    let isCorrect = false;
    const currentQuestion = quizQuestions[currentQuestionIndex];
    if (typeof currentQuestion.correctAnswer === 'number') {
      isCorrect = selectedAnswer === currentQuestion.correctAnswer;
    } else if (typeof currentQuestion.answer === 'string') {
      const letterIdx = currentQuestion.answer.trim().toUpperCase().charCodeAt(0) - 65; // A=0, B=1...
      isCorrect = selectedAnswer === letterIdx;
    }
    
    if (isCorrect) {
      setQuizScore(prev => prev + 1);
    }
    setIsAnswerSubmitted(true);
  };

  const handleNextQuestion = () => {
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    
    if (currentQuestionIndex + 1 < quizQuestions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setIsAnswerSubmitted(false);
    setQuizScore(0);
    setQuizFinished(false);
  };

  // Copy structured note text to clipboard
  const handleCopyNote = () => {
    if (!activeNote) return;
    const text = `
【${activeNote.title}】
時間：${activeNote.createdAt}
來源：${activeNote.sourceType.toUpperCase()} (${activeNote.sourceValue})

【核心摘要】
${activeNote.summary}

【重點提煉】
${activeNote.keyPoints.map((kp, idx) => `${idx + 1}. ${kp}`).join('\n')}

---
由 AI課堂筆記整理器 生成
    `.trim();
    navigator.clipboard.writeText(text);
  };

  // Generate Prompts for AI coding tools dynamically
  const generateCodingPrompt = () => {
    return `
# 角色定義
你是一位網頁開發大師，精通在 ${coachPlatform} 中利用 React, Tailwind CSS 製作極致美觀、高流暢度、完美覆蓋手機端（Mobile-First）的 MVP 單頁應用。

# 產品需求：AI 課堂筆記整理器 (AI Lecture Note Organizer)
協助學生快速整合錄音、投影片 PPT 及 YouTube 影片，並直接調用 AI 解析生成結構化筆記、記憶核心要點，並提供高可玩性的自我複習測驗。

# 技術棧要求
- **前端工具架構**: React 18+, Vite, Tailwind CSS 4+
- **資料持久化機制**: 使用 ${coachBackend} 來存儲歷史筆記與測驗得分績效。
- **UI風調與質感要求**:
  - 精緻的極簡美學風格（米白、白、深柔調炭灰），配以乾淨對比度與流暢動畫。
  - 充分利用卡片式與欄位結構。
    `.trim();
  };

  const handleCopyPromptText = () => {
    navigator.clipboard.writeText(generateCodingPrompt());
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] font-sans text-[#37352F] flex items-center justify-center antialiased p-4">
        <div className="max-w-md w-full bg-white border border-[#E9E9E6] rounded-xl shadow-xs p-8 flex flex-col gap-6">
          
          {/* Logo element */}
          <div className="flex flex-col items-center text-center gap-1.5 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E9E9E6] shadow-2xs flex items-center justify-center text-2xl mb-1.5">
              🎓
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#37352F]">AI 課堂筆記整理器</h1>
            <p className="text-xs text-[#7C7B77] max-w-[280px]">
              專為學生量身打造的多軌筆記整理、重點提卡與考前複習心法系統
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
            
            {authError && (
              <div className="bg-[#FDF2F2] border border-[#E85D5D]/30 text-red-750 p-3 rounded text-xs font-semibold">
                ⚠️ {authError}
              </div>
            )}

            {authSuccess && (
              <div className="bg-[#EEF6EE] border border-[#7FBC7F]/30 text-emerald-800 p-3 rounded text-xs font-semibold">
                🎉 {authSuccess}
              </div>
            )}

            {authMode === 'signup' && (
              <div>
                <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                  自訂學員顯示名稱
                </label>
                <input 
                  type="text"
                  placeholder="例如：傑克學長、阿明..."
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F]"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                電子郵件 Email 帳號
              </label>
              <input 
                type="email"
                placeholder="請輸入您的 Email 地址"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F] select-all"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5 flex justify-between items-center">
                <span>帳戶安全密碼</span>
              </label>
              <input 
                type="password"
                placeholder="輸入您的密碼"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F]"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-bold py-3 rounded cursor-pointer transition-all active:scale-98 mt-2 shadow-xs text-center animate-none"
            >
              {authMode === 'login' ? '立即登入工作區' : '註冊並自動登入'}
            </button>
          </form>

          {/* Switch flow */}
          <div className="border-t border-[#F1F1EF] pt-4.5 text-center flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login');
                setAuthError(null);
                setAuthSuccess(null);
              }}
              className="text-xs font-semibold text-[#7C7B77] hover:text-[#37352F] transition-colors cursor-pointer"
            >
              {authMode === 'login' ? '沒有帳號？點此切換至註冊帳號' : '已有帳號？點此切換至登入介面'}
            </button>


          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] font-sans text-[#37352F] flex antialiased selection:bg-[#E3E2E0]/40 selection:text-[#37352F] h-screen overflow-hidden">
      
      {/* 1. Left Sidebar - Workspace (Desktop only) */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#F7F7F5] border-r border-[#E9E9E6] select-none text-[13px] h-full overflow-y-auto">
        {/* Workspace identifier block */}
        <div className="px-4 py-3.5 border-b border-[#E9E9E6]/60 flex items-center justify-between hover:bg-[#F1F1EF] transition-colors cursor-pointer">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded bg-white border border-[#E9E9E6] flex items-center justify-center text-sm font-bold shrink-0">
              👨‍🎓
            </div>
            <span className="font-bold text-[#37352F] truncate">
              {currentUser ? `${currentUser.customName}的筆記整理器` : '學員的筆記整理器'}
            </span>
          </div>
          <span className="text-[#A4A29E] text-[10px]">▼</span>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 py-3 px-2.5 flex flex-col gap-5">
          {/* Menu items */}
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => setActiveTab('input')}
              className={`w-full py-1.5 px-2 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'input' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
              }`}
            >
              <span className="text-sm">➕</span>
              <span>新增課堂整理</span>
            </button>
            <button
              onClick={() => setActiveTab('cram')}
              className={`w-full py-1.5 px-2 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'cram' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
              }`}
            >
              <span className="text-sm">🏮</span>
              <span>考前懶人包庫</span>
            </button>
          </div>

          {/* Quick Stats Callout inside Sidebar */}
          <div className="p-3 bg-[#FAF3E0] rounded border border-[#F5E6C0] flex items-start gap-2 text-[11.5px] text-[#A16207]">
            <span className="text-base leading-none">🔥</span>
            <div>
              <span className="font-bold">今日已打卡學習！</span>
              <p className="text-[10px] text-[#A16207]/80 mt-0.5">已連續維持 {streakDays} 天學習紀錄，繼續保持！</p>
            </div>
          </div>

          {/* Notes Archive Listing in Left Tree */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            <span className="px-2 text-[10px] font-bold text-[#A4A29E] uppercase tracking-wider block mb-1">
              📌 我的課程筆記庫 ({notesList.length})
            </span>
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1 max-h-[350px]">
              {notesList.map((note) => {
                const isActive = note.id === activeNoteId;
                const isSelected = selectedSourceIds.includes(note.id);
                return (
                  <div
                    key={note.id}
                    className={`w-full group flex items-center gap-2 py-1 px-1.5 rounded-md transition-all ${
                      isActive 
                        ? 'bg-[#E3E2E0]/50 text-[#37352F]' 
                        : 'text-[#585754] hover:bg-[#F1F1EF] hover:text-[#37352F]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSource(note.id)}
                      className="w-3.5 h-3.5 rounded accent-amber-600 cursor-pointer shrink-0 border border-[#C2C2BE]"
                      title={isSelected ? "取消勾選此來源基底" : "將此檔案加為背景對話來源"}
                    />
                    <button
                      onClick={() => {
                        setActiveNoteId(note.id);
                        setActiveTab('notes');
                      }}
                      className="flex-1 text-left min-w-0 transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
                    >
                      <span className="shrink-0 text-xs">
                        {note.sourceType === 'youtube' && '📺'}
                        {note.sourceType === 'ppt' && '📄'}
                        {note.sourceType === 'voice' && '🎙️'}
                      </span>
                      <span className={`truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{note.title}</span>
                    </button>
                    
                    {/* Tiny delete icon */}
                    <button
                      onClick={(e) => deleteNote(note.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 font-bold px-1 rounded transition-opacity cursor-pointer text-[10px]"
                      title="刪除筆記"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {notesList.length === 0 && (
                <span className="px-2 text-[11px] text-[#A4A29E] italic">尚無存檔筆記</span>
              )}
            </div>
          </div>
        </div>

        {/* Footer Area inside Left Sidebar */}
        <div className="p-3 border-t border-[#E9E9E6] text-[11px] text-[#7C7B77] flex flex-col gap-2">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full py-1.5 px-2 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'settings' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>網頁設定</span>
          </button>
          
          {currentUser && (
            <div className="flex flex-col gap-1 bg-[#F1F1EF]/70 p-2 rounded border border-[#E9E9E6]/40">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[#37352F] truncate select-text">{currentUser.customName}</span>
                <button 
                  onClick={handleLogout}
                  className="p-1 text-[#7C7B77] hover:text-[#E85D5D] hover:bg-[#FDF2F2] rounded cursor-pointer transition-colors"
                  title="登出帳號"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[9.5px] text-[#A4A29E] truncate select-text">{currentUser.email}</span>
            </div>
          )}
          <p className="px-1 select-none font-mono text-[9.5px] text-[#A4A29E]">UTC: 2026-05-21</p>
        </div>
      </aside>

      {/* 2. Main Scrollable Document Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto bg-white relative">
        
        {/* Breadcrumb Topbar */}
        <header className="flex items-center justify-between text-[13px] text-[#7C7B77] py-3.5 px-6 border-b border-[#F1F1EF] sticky top-0 bg-white/95 backdrop-blur-md z-30">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Hamburger menu for mobile devices */}
            <button 
              onClick={() => setIsMobileSidebarOpen(true)}
              className="md:hidden p-1 mr-1 hover:bg-[#F1F1EF] rounded text-[#37352F] cursor-pointer"
              title="開啟選單"
            >
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span 
              onClick={() => {
                setActiveTab('input');
                setShowHomeIntro(true);
              }} 
              className="hover:bg-[#F1F1EF] px-1.5 py-1 rounded cursor-pointer truncate transition-colors text-teal-850 font-bold flex items-center gap-1 bg-[#FAF9F6] border border-[#E9E9E6]" 
              title="點選引導說明這個AI課堂筆記整理器"
            >
              🏡 Home 主頁
            </span>
            <span className="text-[#A4A29E] shrink-0 hidden sm:inline">/</span>
            <span onClick={() => setActiveTab('input')} className="hover:bg-[#F1F1EF] px-1.5 py-1 rounded cursor-pointer truncate font-medium text-[#37352F] transition-colors hidden sm:inline">🧠 AI課堂筆記整理器</span>
            <span className="text-[#A4A29E] shrink-0">/</span>
            <span className="text-[#A4A29E] font-mono capitalize truncate">
              {activeTab === 'input' && '➕ 新增整理'}
              {activeTab === 'notes' && '📓 課堂筆記'}
              {activeTab === 'quiz' && '🏆 自我測驗'}
              {activeTab === 'history' && '📂 封存檔案'}
              {activeTab === 'settings' && '⚙️ 網頁設定'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div 
              onClick={() => setShowCheckInModal(true)}
              className="flex items-center gap-1 bg-[#FAF3E0] hover:bg-[#F5E6C0] text-[#D97706] px-2.5 py-1 rounded text-xs font-semibold border border-[#F5E6C0] cursor-pointer transition-all active:scale-95"
              title="查看每天10點刷新的打卡紀錄"
            >
              <Flame className="w-3.5 h-3.5 fill-current animate-pulse" />
              <span>{streakDays} 天學習</span>
            </div>
            {/* Quick Share button - Copies direct Vercel link */}
            <button 
              onClick={() => {
                navigator.clipboard.writeText('https://vibe-coding-silk-eight.vercel.app/');
                setCopiedShareLink(true);
                setTimeout(() => setCopiedShareLink(false), 2000);
              }}
              className={`p-1.5 rounded cursor-pointer transition-all flex items-center gap-1 border ${
                copiedShareLink 
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200 px-2' 
                  : 'text-[#7C7B77] hover:bg-[#F1F1EF] border-transparent'
              }`}
              title="分享與連線狀態"
            >
              <span className="text-[12px] font-bold px-1">
                {copiedShareLink ? '✅ 已複製 Vibe-Coding 連結' : '🔗 複製分享連結'}
              </span>
            </button>
            <button 
              onClick={() => setShowBookmarkModal(true)}
              className="p-1.5 hover:bg-[#F1F1EF] rounded text-[#7C7B77] cursor-pointer flex items-center gap-1 active:scale-95 transition-all text-amber-600 hover:text-amber-700 bg-amber-50/50 hover:bg-amber-100/50 border border-amber-200" 
              title="加入 Google 書籤"
            >
              <span className="text-[12px] font-bold">⭐️ 加入 Google 書籤</span>
            </button>
          </div>
        </header>

        {/* Cover Graphic / Minimal Banner */}
        <div className="w-full h-32 bg-[#F1F1EF] relative shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-[#DFDFDE]/50 to-[#EAEAEA]/50"></div>
        </div>

        {/* Floating Emoji Icon Container */}
        <div className="max-w-3xl w-full mx-auto px-6 md:px-12 relative -mt-10 select-none z-10">
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#E9E9E6] shadow-sm flex items-center justify-center text-3xl">
            🧠
          </div>
        </div>

        {/* Title Block */}
        <div className="max-w-3xl w-full mx-auto px-6 md:px-12 pt-4 pb-2">
          <h1 className="text-3xl font-bold text-[#37352F] tracking-tight flex items-center gap-2">
            📚 課堂筆記整理器
          </h1>
          <p className="text-[#5A5A57] font-semibold text-xs mt-2 bg-amber-50 text-amber-900 px-3 py-2 rounded-md border border-amber-200 leading-relaxed">
            🚀 <b>講義投影片與 YouTube 影片深度智慧解析！</b>
            <span className="block mt-1 font-medium text-[11px] text-[#78350F]">
              支援在此整合複數語音、PDF/PPT 講義檔案、及 YouTube 課堂線上影片，進行全自動大綱解析、高密度筆記精練、數位卡片，並可多來源交叉提問與產生一鍵 AI 自修導引地圖！
            </span>
          </p>
        </div>

        {/* Navigation Tabs (Simulated Database View Selector) */}
        <div className="max-w-3xl w-full mx-auto px-6 md:px-12 mt-4 shrink-0">
          <div className="flex flex-wrap gap-1 border-b border-[#E9E9E6] text-[13px] text-[#7C7B77]">
            <button
              onClick={() => setActiveTab('input')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'input'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-[#37352F]" />
              <span>新增整理</span>
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'notes'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-[#37352F]" />
              <span>課堂筆記</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('quiz');
                handleRestartQuiz();
              }}
              disabled={!activeNote}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                activeTab === 'quiz'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-[#37352F]" />
              <span>回顧複習</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'history'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 text-[#37352F]" />
              <span>封存記錄 ({notesList.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('cram')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'cram'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#37352F]" />
              <span>考前懶人包</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium cursor-pointer transition-all ${
                activeTab === 'settings'
                  ? 'border-[#37352F] text-[#37352F] font-semibold'
                  : 'border-transparent hover:text-[#37352F] hover:bg-[#F7F7F5]'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-[#37352F]" />
              <span>網頁設定</span>
            </button>
          </div>
        </div>

        {/* Dynamic Display Panel */}
        <div className="max-w-3xl w-full mx-auto px-6 md:px-12 py-6 flex-1 flex flex-col gap-6">
          
          <AnimatePresence mode="wait">
            
            {/* TAB 1: INPUT SCREEN */}
            {activeTab === 'input' && (
              <motion.div 
                key="input-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-5"
              >
                {/* Intro banner */}
                <div className="bg-[#F1F1EF] text-[#37352F] rounded-lg p-5 border border-[#E9E9E6] flex gap-3.5 items-start">
                  <div className="text-2xl mt-0.5 select-none font-sans">💡</div>
                  <div>
                    <h4 className="font-semibold text-xs text-[#37352F] tracking-wide uppercase leading-tight mb-1">
                      課堂精智中樞
                    </h4>
                    <p className="text-xs text-[#5A5A57] leading-relaxed">
                      無縫管理您的學術材料：放一隻錄音筆，貼上教授提供的簡報投影片，或直接匯入線上 YouTube 影片學術筆記。後端的 <b>Gemini 3.5 AI 晶片解構</b> 會立刻為您精練、整理並佈署多軌回顧考題！
                    </p>
                  </div>
                </div>

                {/* Preset Fast Testing panel */}
                <div className="border border-[#E9E9E6] bg-white rounded-lg p-4">
                  <h3 className="text-[11px] font-bold text-[#7C7B77] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <span>⚡ 課堂演示快速範本 (點擊一鍵讀取體驗)</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPreset(p)}
                        className="p-3 rounded-md border border-[#E9E9E6] bg-white hover:bg-[#F7F7F5] text-left transition-all cursor-pointer flex flex-col gap-1 w-full"
                      >
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-[#7C7B77] capitalize">
                          {p.sourceType === 'youtube' && <span className="text-red-500">📺 YouTube</span>}
                          {p.sourceType === 'ppt' && <span className="text-blue-500">📄 簡報講義</span>}
                          {p.sourceType === 'voice' && <span className="text-violet-500">🎙️ 語音錄音</span>}
                        </div>
                        <span className="text-xs font-bold text-[#37352F] truncate w-full">{p.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input selection panel */}
                <div className="border border-[#E9E9E6] rounded-lg bg-white overflow-hidden shadow-xs">
                  
                  {/* Selector Bar */}
                  <div className="flex border-b border-[#E9E9E6] bg-[#F7F7F5]">
                    <button
                      onClick={() => setSourceType('voice')}
                      className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        sourceType === 'voice' ? 'bg-white border-r border-[#E9E9E6] text-[#37352F] font-bold' : 'text-[#7C7B77] hover:bg-[#F1F1EF] border-r border-[#E9E9E6] last:border-r-0'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      語音錄製筆記
                    </button>
                    <button
                      onClick={() => setSourceType('ppt')}
                      className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        sourceType === 'ppt' ? 'bg-white border-x border-[#E9E9E6] first:border-l-0 last:border-r-0 text-[#37352F] font-bold' : 'text-[#7C7B77] hover:bg-[#F1F1EF] border-x border-[#E9E9E6] first:border-l-0 last:border-r-0'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      講義投影片
                    </button>
                    <button
                      onClick={() => setSourceType('youtube')}
                      className={`flex-1 py-3 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        sourceType === 'youtube' ? 'bg-white border-l border-[#E9E9E6] text-[#37352F] font-bold' : 'text-[#7C7B77] hover:bg-[#F1F1EF] border-l border-[#E9E9E6]'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      YouTube連結
                    </button>
                  </div>

                  {/* Configured fields */}
                  <div className="p-5 flex flex-col gap-4">
                    
                    {/* Common Title */}
                    <div>
                      <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">筆記 / 課堂主題名稱</label>
                      <input
                        type="text"
                        value={lectureTitle}
                        onChange={(e) => setLectureTitle(e.target.value)}
                        placeholder="例如：微積分、機器學習與梯度下降法演算法、通識課筆記..."
                        className="w-full px-3.5 py-2 text-xs bg-white border border-[#E9E9E6] text-[#37352F] placeholder:text-[#A4A29E] rounded outline-none focus:border-[#37352F] transition-all font-medium"
                      />
                    </div>

                    {/* Source 1: Voice recording */}
                    {sourceType === 'voice' && (
                      <div className="flex flex-col gap-4 relative">
                        {isTranscribingAudio && (
                          <div className="absolute inset-0 bg-white/95 rounded-md flex flex-col items-center justify-center gap-2.5 z-20 border border-amber-300 p-6 shadow-sm">
                            <span className="text-[11px] font-bold text-amber-600 animate-pulse flex items-center gap-1.5 font-mono">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                              </span>
                              極精密語音轉文字進行中 (Speech-to-Text)
                            </span>
                            <p className="text-[11px] text-[#5A5A57] font-semibold text-center leading-relaxed max-w-[340px]">
                              本系統正在將麥克風錄製的真實音訊訊號編碼成無損波型，傳送至後端 <span className="text-amber-700 bg-amber-50 font-mono px-1 rounded">Gemini Multimodal Brain</span> 進行 100% 真實逐字稿智慧轉譯，請稍候...
                            </p>
                            <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mt-2"></div>
                          </div>
                        )}
                        <div className="p-4 bg-[#F7F7F5] border border-[#E9E9E6] border-dashed rounded-md flex flex-col items-center justify-center py-6">
                          {isRecording ? (
                            <div className="flex flex-col items-center gap-2.5">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-red-500 animate-pulse flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-600 animate-ping"></span>
                                錄音進行中...
                              </span>
                              <div className="text-3xl font-mono font-bold text-[#37352F]">
                                {Math.floor(recordSeconds / 60).toString().padStart(2, '0')}:
                                {(recordSeconds % 60).toString().padStart(2, '0')}
                              </div>
                              
                              {/* Waveform indicator */}
                              <div className="flex items-end justify-center gap-1 h-8 py-1 select-none pointer-events-none">
                                {visualizerBars.map((val, i) => (
                                  <motion.div
                                    key={i}
                                    style={{ height: `${val / 1.5}px` }}
                                    className="w-1 bg-[#37352F] rounded-full"
                                    animate={{ height: val / 1.5 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                  />
                                ))}
                              </div>

                              <button
                                onClick={stopRecording}
                                className="mt-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-3 shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                              >
                                <Square className="w-4 h-4 fill-white" />
                              </button>
                            </div>
                          ) : (
                            <div className="text-center flex flex-col items-center gap-2">
                              <button
                                onClick={startRecording}
                                className="bg-[#23221E] text-white rounded-full p-4 hover:bg-[#37352F] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
                              >
                                <Mic className="w-5.5 h-5.5" />
                              </button>
                              <span className="text-xs font-bold text-[#37352F] mt-1">點擊已錄製聲音</span>
                              <span className="text-[10px] text-[#7C7B77]">(將動態申請錄音麥克風權限以確保真實性)</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                            逐字稿文本與手動輸入塊 (可直接貼上，支援 Markdown)
                          </label>
                          <textarea
                            value={customContent}
                            onChange={(e) => setCustomContent(e.target.value)}
                            rows={5}
                            placeholder="錄製完成後，AI 識字逐字稿會自動寫入此處。您也可以在此直接撰寫備忘或貼上原文，Gemini 將以其為底層原料來提煉知識..."
                            className="w-full p-3.5 text-xs bg-white border border-[#E9E9E6] text-[#37352F] placeholder:text-[#A4A29E] rounded outline-none focus:border-[#37352F] transition-all font-medium leading-relaxed font-sans"
                          />
                        </div>
                      </div>
                    )}

                    {/* Source 2: Slide PPT */}
                    {sourceType === 'ppt' && (
                      <div className="flex flex-col gap-4">
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          onChange={handleFileChange} 
                          className="hidden" 
                          accept=".ppt,.pptx,.pdf,.txt,.md,.csv,.doc,.docx"
                        />
                        
                        {uploadedFileName && (
                          <div className="p-3.5 bg-amber-50/65 border border-amber-200/80 rounded-md flex items-center justify-between text-xs text-[#37352F] shadow-xs">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                                <FileText className="w-4 h-4 text-amber-700" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-[11px] text-[#23221E] truncate max-w-[200px] sm:max-w-[300px]">
                                  {uploadedFileName}
                                </span>
                                <span className="text-[10px] text-amber-800 font-semibold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  真實內容讀取模式已就緒，AI 將精準辨識與解析
                                </span>
                              </div>
                            </div>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadedFileBase64(null);
                                setUploadedFileMimeType(null);
                                setUploadedFileName(null);
                                setCustomContent('');
                              }}
                              className="text-gray-400 hover:text-red-500 font-bold p-1 bg-white hover:bg-red-50 rounded border border-gray-200 cursor-pointer transition-colors"
                              title="移除已選檔案"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleFileDrop}
                          className={`border border-dashed rounded-md p-5 text-center flex flex-col items-center justify-center py-8 cursor-pointer transition-all select-none ${
                            dragActive 
                              ? 'border-amber-500 bg-amber-50/40 text-amber-900 scale-[0.99] shadow-inner' 
                              : 'border-[#E9E9E6] bg-[#F7F7F5] hover:bg-[#F1F1EF] text-[#37352F]'
                          }`}
                          title="點選或拖曳講義投影片"
                        >
                          <FileSpreadsheet className={`w-8 h-8 mb-2 transition-transform ${dragActive ? 'text-amber-500 scale-110 animate-pulse' : 'text-[#7C7B77]'}`} />
                          <span className="text-xs font-bold block">
                            {dragActive ? '放開滑鼠即可讀取講義投影片！' : '拖曳講義投影片 PPT / PDF 至此，或點擊選取'}
                          </span>
                          <span className="text-[10px] text-[#7C7B77] mt-1 block">
                            支援 PPT、PDF、TXT、Markdown 等投影片或筆記檔案，一鍵解析大綱投影片
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                            簡報備忘錄 / 點大綱貼上
                          </label>
                          <textarea
                            value={customContent}
                            onChange={(e) => setCustomContent(e.target.value)}
                            rows={6}
                            placeholder="貼上投影片複製過來的重點文本段落，或整篇文章內容。點選下方發布後，AI 會轉譯為極美簡練的筆記與問答卡。"
                            className="w-full p-3.5 text-xs bg-white border border-[#E9E9E6] text-[#37352F] placeholder:text-[#A4A29E] rounded outline-none focus:border-[#37352F] transition-all font-medium leading-relaxed font-sans"
                          />
                        </div>
                      </div>
                    )}

                    {/* Source 3: Youtube videos */}
                    {sourceType === 'youtube' && (
                      <div className="flex flex-col gap-4">
                        <div>
                          <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">YouTube 影片連結 URL</label>
                          <input
                            type="text"
                            value={ytUrl}
                            onChange={(e) => setYtUrl(e.target.value)}
                            placeholder="https://www.youtube.com/watch?v=..."
                            className="w-full px-3.5 py-2 text-xs bg-white border border-[#E9E9E6] text-[#37352F] placeholder:text-[#A4A29E] rounded outline-none focus:border-[#37352F] transition-all font-medium"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                            配合處理的學習導向 (影片總結重點，選填)
                          </label>
                          <textarea
                            value={customContent}
                            onChange={(e) => setCustomContent(e.target.value)}
                            rows={4}
                            placeholder="您可以為本段 YouTube 課程影片提供部分備用大綱，或者留空，系統將驅動模型依影片專屬學術路徑直接深入出題與精編筆記..."
                            className="w-full p-3.5 text-xs bg-white border border-[#E9E9E6] text-[#37352F] placeholder:text-[#A4A29E] rounded outline-none focus:border-[#37352F] transition-all font-medium leading-relaxed font-sans"
                          />
                        </div>
                      </div>
                    )}

                    {/* Error indicator */}
                    {errorMessage && (
                      <div className="p-3 bg-[#FDF2F2] text-[#8A1F1F] rounded border border-[#E85D5D]/20 text-xs font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Submit action button */}
                    <button
                      onClick={handleSubmitToAI}
                      disabled={isProcessing}
                      className="w-full mt-2 bg-[#23221E] hover:bg-[#37352F] text-white rounded py-3 font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-all hover:scale-[1.005] active:scale-[0.99] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>AI 智慧關聯大腦分析中 (3~5秒)...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>一鍵導入學習教材並分析</span>
                        </>
                      )}
                    </button>

                  </div>

                </div>

              </motion.div>
            )}

            {/* TAB 2: ACTIVE LECTURE NOTES & OUTLINES */}
            {activeTab === 'notes' && (
              <motion.div 
                key="notes-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {!activeNote ? (
                  <div className="border border-[#E9E9E6] rounded-lg p-10 text-center flex flex-col items-center justify-center gap-3 bg-white">
                    <div className="text-4xl">🗒️</div>
                    <div>
                      <h3 className="text-sm font-bold text-[#37352F]">目前尚無啟用中的筆記項目</h3>
                      <p className="text-xs text-[#7C7B77] mt-1">請前往第一個標籤「新建整理」，手動導入或選擇快速範本體驗！</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    
                    {/* Notes Metadata Card */}
                    <div className="border border-[#E9E9E6] p-4 rounded-lg bg-[#F7F7F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[#37352F]">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-white text-[#5A5A57] border border-[#E9E9E6]">
                            {activeNote.sourceType === 'youtube' && '📺 YouTube 線上課'}
                            {activeNote.sourceType === 'ppt' && '📄 投影片講義'}
                            {activeNote.sourceType === 'voice' && '🎙️ 行動錄音'}
                          </span>
                          <span className="text-[10px] text-[#A4A29E] font-medium">{activeNote.createdAt}</span>
                        </div>
                        <h2 className="text-base font-bold text-[#37352F]">{activeNote.title}</h2>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <button
                          onClick={handleCopyNote}
                          className="bg-white border border-[#E9E9E6] hover:bg-[#F1F1EF] text-[#37352F] px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          複製重點
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('quiz');
                            handleRestartQuiz();
                          }}
                          className="bg-[#23221E] hover:bg-[#37352F] text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-xs"
                        >
                          <Trophy className="w-3.5 h-3.5" />
                          開始自我測驗
                        </button>
                      </div>
                    </div>

                    {/* Multi-source Track Panel and Action Guides */}
                    <div className="bg-[#FAF9F5] border border-amber-200 p-4 rounded-lg text-xs text-[#37352F] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-150 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded border border-amber-300">
                            多來源智慧關聯分析模式
                          </span>
                          <span className="text-[11px] font-bold text-[#37352F]">
                            📚 目前已關聯架構：{selectedSourceIds.length} 個學習教材來源
                          </span>
                        </div>
                        <p className="text-[10px] text-[#7C7B77] mt-0.5 leading-relaxed">
                          您可以在左側「課程筆記庫」勾選/取消勾選複數講義簡報、YouTube影片或語音檔案。下方所有「智慧指引」與「對話框」將一併完美融合這些勾選材料進行交叉提問與宏觀研討！
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedSourceIds.map((id, index) => {
                            const note = notesList.find(n => n.id === id);
                            if (!note) return null;
                            return (
                              <span key={id} className="inline-flex items-center gap-1 text-[10px] font-bold bg-white text-[#585754] border border-[#E9E9E6] px-2 py-0.5 rounded">
                                <span className="text-amber-600 font-mono">[{index + 1}]</span>
                                <span className="truncate max-w-[130px]">{note.title}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 w-full xl:w-auto shrink-0">
                        <span className="text-[10px] font-bold text-[#7C7B77] uppercase tracking-wide">一鍵生成智慧指引地圖：</span>
                        <div className="grid grid-cols-2 lg:flex gap-1.5">
                          <button
                            onClick={() => handleGenerateNotebookGuide('faq')}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-950 font-bold border border-[#E9E9E6] hover:border-amber-300 rounded text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="生成常規高機率考題常見問答 (FAQ)"
                          >
                            💡 常問問答 FAQ
                          </button>
                          <button
                            onClick={() => handleGenerateNotebookGuide('study_guide')}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-950 font-bold border border-[#E9E9E6] hover:border-amber-300 rounded text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="規劃漸進自修學習攻略路線圖 Study Guide"
                          >
                            🗺️ 自修導引 Guide
                          </button>
                          <button
                            onClick={() => handleGenerateNotebookGuide('timeline')}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-950 font-bold border border-[#E9E9E6] hover:border-amber-300 rounded text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="梳理投影片概念邏輯演進時間軸 Timeline"
                          >
                            ⏳ 觀念時間軸 Timeline
                          </button>
                          <button
                            onClick={() => handleGenerateNotebookGuide('briefing')}
                            className="px-2.5 py-1.5 bg-white hover:bg-amber-50 text-amber-950 font-bold border border-[#E9E9E6] hover:border-amber-300 rounded text-[11px] transition-all flex items-center justify-center gap-1 cursor-pointer"
                            title="產出專業簡潔的學術簡報手記 Briefing"
                          >
                            📑 亮點筆記手冊
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Sub tabs selector */}
                    <div className="flex gap-1 p-1 bg-[#F1F1EF] rounded-lg self-start text-xs select-none shadow-inner border border-[#E9E9E6]/60">
                      <button
                        onClick={() => setActiveSubNotesTab('digest')}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                          activeSubNotesTab === 'digest' ? 'bg-white text-[#37352F] shadow-xs' : 'text-[#7C7B77] hover:text-[#37352F]'
                        }`}
                      >
                        📓 統整大綱與詳細文摘
                      </button>
                      <button
                        onClick={() => {
                          setActiveSubNotesTab('flashcards');
                          setFlippedCards({}); // Reset card flips on switch
                        }}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                          activeSubNotesTab === 'flashcards' ? 'bg-white text-[#37352F] shadow-xs' : 'text-[#7C7B77] hover:text-[#37352F]'
                        }`}
                      >
                        🎴 數位記憶卡 ({activeNote.key_points_flashcards?.length || activeNote.keyPoints?.length || 0})
                      </button>
                      <button
                        onClick={() => setActiveSubNotesTab('notebook_chat')}
                        className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          activeSubNotesTab === 'notebook_chat' ? 'bg-white text-[#37352F] shadow-xs animate-pulse-once' : 'text-[#7C7B77] hover:text-[#37352F]'
                        }`}
                      >
                        💬 智慧多來源對話 ({selectedSourceIds.length} 個來源奠基)
                      </button>
                    </div>

                    {/* Bento Layout Grid for Note Content */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      
                      {/* Left Block (takes 2 cols on wide, 1 otherwise) */}
                      <div className="md:col-span-2 flex flex-col gap-5">
                        
                        {activeSubNotesTab === 'digest' && (
                          <>
                            {/* Summary Block */}
                            <div className="border border-[#E9E9E6] p-5 rounded-lg bg-white flex flex-col gap-3">
                              <h3 className="text-xs font-bold text-[#37352F] uppercase tracking-wider flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-amber-500" />
                                一分鐘快速大綱（白話精簡）
                              </h3>
                              <div className="flex flex-col gap-2">
                                {(activeNote.summary_one_minute || activeNote.keyPoints || []).map((point, index) => (
                                  <div key={index} className="flex gap-2.5 items-start bg-[#EEF6EE]/40 border border-[#7FBC7F]/25 p-3 rounded-lg text-xs">
                                    <span className="text-emerald-600 font-bold">✓</span>
                                    <span className="text-[#1E4620] font-semibold leading-relaxed">{point}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Detailed Structured Note Block */}
                            <div className="border border-[#E9E9E6] p-5 rounded-lg bg-white flex flex-col gap-3">
                              <h3 className="text-xs font-bold text-[#37352F] uppercase tracking-wider flex items-center gap-2 mb-1">
                                <Lightbulb className="w-4 h-4 text-emerald-500" />
                                完整精華章節筆記 (AI 深度重構投影片精簡稿)
                              </h3>
                              <div className="text-xs text-[#5A5A57] leading-relaxed whitespace-pre-wrap font-medium prose prose-sm max-w-none">
                                {activeNote.full_digest || activeNote.summary}
                              </div>
                            </div>
                          </>
                        )}

                        {activeSubNotesTab === 'flashcards' && (
                          /* Interactive Memory Flashcards View */
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-[11px] font-bold text-[#7C7B77] uppercase tracking-wider flex items-center gap-1.5">
                                💡 記憶學：點擊下方記憶卡，即可雙面翻看學術詞彙之白話解讀與生活化舉例！
                              </h3>
                              <button 
                                onClick={() => setFlippedCards({})}
                                className="text-[10px] text-[#23221E] bg-[#F1F1EF] px-2 py-1 rounded border border-[#E9E9E6] hover:bg-[#E3E2E0] font-bold cursor-pointer"
                              >
                                回復雙面原狀
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {activeNote.key_points_flashcards && activeNote.key_points_flashcards.length > 0 ? (
                                activeNote.key_points_flashcards.map((card, idx) => {
                                  const isFlipped = !!flippedCards[idx];
                                  return (
                                    <div
                                      key={idx}
                                      onClick={() => {
                                        setFlippedCards(prev => ({ ...prev, [idx]: !prev[idx] }));
                                      }}
                                      className="h-40 rounded-xl border border-[#E9E9E6] bg-white transition-all duration-300 relative overflow-hidden cursor-pointer shadow-xs select-none hover:shadow-md flex flex-col"
                                    >
                                      <AnimatePresence mode="wait">
                                        {!isFlipped ? (
                                          <motion.div
                                            key="front"
                                            initial={{ opacity: 0, scale: 0.96 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.96 }}
                                            className="absolute inset-0 p-4.5 flex flex-col justify-between"
                                          >
                                            <div>
                                              <span className="text-[9px] font-bold text-[#D97706] uppercase tracking-wider bg-[#FDF6E2] px-2 py-0.5 rounded border border-[#F5E6C0]">
                                                卡片 CONCEPT {idx + 1}
                                              </span>
                                              <h4 className="text-xs font-bold text-[#37352F] mt-3.5 tracking-tight leading-snug">
                                                {card.term}
                                              </h4>
                                            </div>
                                            <span className="text-[9px] text-[#A4A29E] font-medium mt-auto">
                                              🔍 點選翻看白話語意
                                            </span>
                                          </motion.div>
                                        ) : (
                                          <motion.div
                                            key="back"
                                            initial={{ opacity: 0, scale: 0.96 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.96 }}
                                            className="absolute inset-0 p-4.5 bg-[#FAF9E0] text-[#1E302F] flex flex-col justify-between border-l-4 border-amber-400"
                                          >
                                            <div className="overflow-y-auto flex-1 pr-1">
                                              <span className="text-[9px] font-bold text-teal-800 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                                                學長生活化剖析
                                              </span>
                                              <p className="text-[11px] font-semibold text-[#5A5A57] leading-relaxed mt-2.5">
                                                {card.explanation}
                                              </p>
                                            </div>
                                            <span className="text-[9px] text-teal-700/80 font-bold block pt-1 mt-1 border-t border-teal-100 shrink-0">
                                              再次點擊可收起
                                            </span>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })
                              ) : (
                                /* Fallback converting older keyPoints list */
                                activeNote.keyPoints.map((pt, idx) => {
                                  const isFlipped = !!flippedCards[idx];
                                  const parts = pt.split(/[:：]/);
                                  const term = parts[0] || `核心概念 ${idx + 1}`;
                                  const explanation = parts.slice(1).join('：') || pt;
                                  return (
                                    <div
                                      key={idx}
                                      onClick={() => {
                                        setFlippedCards(prev => ({ ...prev, [idx]: !prev[idx] }));
                                      }}
                                      className="h-40 rounded-xl border border-[#E9E9E6] bg-white transition-all duration-300 relative overflow-hidden cursor-pointer shadow-xs select-none hover:shadow-md flex flex-col"
                                    >
                                      <AnimatePresence mode="wait">
                                        {!isFlipped ? (
                                          <motion.div
                                            key="front"
                                            initial={{ opacity: 0, scale: 0.96 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.96 }}
                                            className="absolute inset-0 p-4.5 flex flex-col justify-between"
                                          >
                                            <div>
                                              <span className="text-[9px] font-bold text-[#D97706] uppercase tracking-wider bg-[#FDF6E2] px-2 py-0.5 rounded border border-[#F5E6C0]">
                                                卡片 CONCEPT {idx + 1}
                                              </span>
                                              <h4 className="text-xs font-bold text-[#37352F] mt-3.5 tracking-tight leading-snug">
                                                {term}
                                              </h4>
                                            </div>
                                            <span className="text-[9px] text-[#A4A29E] font-medium mt-auto">
                                              🔍 點選翻看詳細語意
                                            </span>
                                          </motion.div>
                                        ) : (
                                          <motion.div
                                            key="back"
                                            initial={{ opacity: 0, scale: 0.96 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.96 }}
                                            className="absolute inset-0 p-4.5 bg-[#FAF9E0] text-[#1E302F] flex flex-col justify-between border-l-4 border-amber-400"
                                          >
                                            <div className="overflow-y-auto flex-1 pr-1">
                                              <span className="text-[9px] font-bold text-teal-800 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                                                解析內容
                                              </span>
                                              <p className="text-[11px] font-semibold text-[#5A5A57] leading-relaxed mt-2.5">
                                                {explanation}
                                              </p>
                                            </div>
                                            <span className="text-[9px] text-teal-700/80 font-bold block pt-1 mt-1 border-t border-teal-100 shrink-0">
                                              再次點擊可收起
                                            </span>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {activeSubNotesTab === 'notebook_chat' && (
                          /* Multi-source Grounded Conversation View */
                          <div className="border border-[#E9E9E6] rounded-lg bg-white overflow-hidden flex flex-col h-[520px] shadow-xs">
                            {/* Chat Header */}
                            <div className="bg-[#FAF9F5] border-b border-[#E9E9E6] px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-[#37352F]">Grounded Chat Room</span>
                                  <span className="text-[10px] text-amber-800 font-semibold">
                                    講答字句 100% 來自已關聯的 {selectedSourceIds.length} 份文件事實 [1] [2]...
                                  </span>
                                </div>
                              </div>
                              <button
                                onClick={() => setNotebookChatHistory([])}
                                className="text-[10px] text-gray-500 hover:text-red-500 font-bold bg-white px-2 py-1 rounded border border-gray-200 cursor-pointer"
                                title="清空聊天對話紀錄"
                              >
                                清空對話
                              </button>
                            </div>

                            {/* Conversation Scroll Area */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/20">
                              {notebookChatHistory.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-[#5A5A57]">
                                  <div className="text-3xl mb-3">💬</div>
                                  <h4 className="text-xs font-bold text-[#37352F]">開啟講義文件之間的極致對話</h4>
                                  <p className="text-[11px] text-[#7C7B77] max-w-[380px] mt-1 leading-relaxed">
                                    您可以針對簡報內容進行深入提問。AI 將完全限制在講義事實中回答，並自動為關鍵句標記對應的 [來源編號]！
                                  </p>
                                  
                                  {/* Quick queries list */}
                                  <div className="mt-5 w-full max-w-[420px] flex flex-col gap-2 text-left">
                                    <span className="text-[10px] font-bold text-[#7C7B77] uppercase tracking-wide">推薦提問：</span>
                                    <button
                                      onClick={() => {
                                        setNotebookChatQuery("請用條列式，為我整理這幾份講義中最核心的 5 個核心精華考點。");
                                      }}
                                      className="p-2.5 text-[11px] font-semibold bg-white hover:bg-amber-50/50 text-[#37352F] border border-[#E9E9E6] hover:border-amber-300 rounded-lg text-left transition-all cursor-pointer"
                                    >
                                      📝 整理幾份講義中最精華的 5 個核心考點
                                    </button>
                                    <button
                                      onClick={() => {
                                        setNotebookChatQuery("有哪些重要學術概念或名詞定義在這些資料中被詳細討論？");
                                      }}
                                      className="p-2.5 text-[11px] font-semibold bg-white hover:bg-amber-50/50 text-[#37352F] border border-[#E9E9E6] hover:border-amber-300 rounded-lg text-left transition-all cursor-pointer"
                                    >
                                      🔍 列出在資料中被詳細定義的核心學術名詞
                                    </button>
                                    <button
                                      onClick={() => {
                                        setNotebookChatQuery("請幫我出一題與本講義最相關的進階模擬問答思考題，並在下方提供解析與來源標註。");
                                      }}
                                      className="p-2.5 text-[11px] font-semibold bg-white hover:bg-amber-50/50 text-[#37352F] border border-[#E9E9E6] hover:border-amber-300 rounded-lg text-left transition-all cursor-pointer"
                                    >
                                      🧠 出一題相關的申論反思題，並隨附答案解析
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {notebookChatHistory.map((msg, i) => (
                                    <div
                                      key={i}
                                      className={`flex flex-col ${
                                        msg.role === 'user' ? 'items-end' : 'items-start'
                                      }`}
                                    >
                                      <div
                                        className={`max-w-[85%] rounded-xl px-4 py-3 text-xs leading-relaxed ${
                                          msg.role === 'user'
                                            ? 'bg-[#23221E] text-white font-semibold'
                                            : 'bg-white border border-[#E9E9E6] text-[#37352F] shadow-2xs font-medium'
                                        }`}
                                      >
                                        {msg.role === 'user' ? (
                                          <p className="whitespace-pre-line">{msg.text}</p>
                                        ) : (
                                          renderMarkdownText(msg.text)
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  {isChatting && (
                                    <div className="flex items-center gap-2.5 text-xs text-amber-700 font-bold bg-amber-50 border border-amber-200 p-3 rounded-lg animate-pulse w-fit">
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      <span>AI 智慧關聯大腦正在交叉驗證文獻事實...</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Chat Input form */}
                            <div className="bg-[#FAF9F5] border-t border-[#E9E9E6] p-3 flex gap-2">
                              <input
                                type="text"
                                value={notebookChatQuery}
                                onChange={(e) => setNotebookChatQuery(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSendNotebookChat();
                                  }
                                }}
                                disabled={isChatting}
                                placeholder="輸入對教材的任何問題，例如「解釋第二頁的公式機制」..."
                                className="flex-1 px-3.5 py-2.5 text-xs bg-white border border-[#E9E9E6] rounded-lg outline-none focus:border-amber-600 transition-colors font-medium text-[#37352F]"
                              />
                              <button
                                onClick={handleSendNotebookChat}
                                disabled={isChatting}
                                className="px-4 py-2 bg-[#23221E] hover:bg-[#37352F] text-white rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                詢問
                              </button>
                            </div>
                          </div>
                        )}
                        
                      </div>

                      {/* Right Block: PPT/PDF Slide Chapter Outline Jump Index and Original Rebuilt Transcript */}
                      <div className="flex flex-col gap-5 md:col-span-1">
                        
                        {/* Outline Jump Menu Card */}
                        <div className="border border-amber-200 p-4 rounded-lg bg-[#FAF9E0]/40 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[11px] font-bold text-amber-950 uppercase tracking-wide flex items-center gap-1.5 animate-fade-in">
                              {activeNote.sourceType === 'youtube' ? '📺' : '📄'} {' '}
                              {activeNote.sourceType === 'youtube' ? '影片結構/時間戳大綱' : '投影片幻燈片/章節大綱'} ({getOutlineSections(activeNote).length} 目錄)
                            </h3>
                            <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-250">
                              快跳定位
                            </span>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                            {getOutlineSections(activeNote).map((sec, sIdx) => (
                              <button
                                key={sIdx}
                                onClick={() => {
                                  setHighlightedSectionText(sec.title);
                                  const textToSearch = sec.textToFind;
                                  const transcriptEl = document.getElementById("notebook-transcript-viewer");
                                  if (transcriptEl) {
                                    const matchingTextNode = Array.from(transcriptEl.querySelectorAll('p, div, span, h2, h3, h4, li, strong'))
                                      .find(el => el.textContent?.toLowerCase().includes(textToSearch.substring(0, 30).toLowerCase()));
                                    if (matchingTextNode) {
                                      matchingTextNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      matchingTextNode.classList.add("bg-amber-100", "transition-all", "duration-1000");
                                      setTimeout(() => {
                                        matchingTextNode.classList.remove("bg-amber-100");
                                      }, 3000);
                                    }
                                  }
                                }}
                                className="w-full text-left p-2 rounded-md hover:bg-white border border-transparent hover:border-[#E9E9E6] text-[11px] font-medium text-[#5F5E5A] hover:text-[#37352F] cursor-pointer transition-all flex items-center gap-1.5"
                              >
                                <span className="text-amber-600 font-mono text-[10px]">▶</span>
                                <span className="truncate flex-1">{sec.title}</span>
                              </button>
                            ))}
                            {getOutlineSections(activeNote).length === 0 && (
                              <p className="text-[10px] text-gray-400 italic">正在從文件架構中解析大綱中...</p>
                            )}
                          </div>
                        </div>

                        {/* Original Transcript Box */}
                        <div className="border border-[#E9E9E6] p-5 rounded-lg bg-white flex flex-col gap-3 flex-1">
                          <h3 className="text-xs font-bold text-[#37352F] uppercase tracking-wider flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-[#7C7B77]" />
                            課程重建逐字稿原文
                          </h3>
                          <div 
                            id="notebook-transcript-viewer"
                            className="flex-1 max-h-[300px] md:max-h-[500px] overflow-y-auto text-[11px] leading-relaxed text-[#5A5A57] bg-[#F7F7F5] p-3 rounded font-mono whitespace-pre-wrap border border-[#E9E9E6] relative"
                          >
                            <p className="font-semibold text-[10.5px] leading-relaxed select-text">
                              {activeNote.transcript}
                            </p>
                          </div>
                        </div>

                      </div>

                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 3: REVIEW QUIZ PLAYGROUND */}
            {activeTab === 'quiz' && (
              <motion.div 
                key="quiz-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {!activeNote || quizQuestions.length === 0 ? (
                  <div className="border border-[#E9E9E6] rounded-lg p-10 text-center flex flex-col items-center justify-center gap-3 bg-white">
                    <div className="text-4xl">🏆</div>
                    <div>
                      <h3 className="text-sm font-bold text-[#37352F]">此筆記尚無 AI 自動產出的測驗題</h3>
                      <p className="text-xs text-[#7C7B77] mt-1">請點按左側「新建整理」貼上帶有核心大綱的材料，並使其生成！</p>
                    </div>
                  </div>
                ) : (
                  <div className="border border-[#E9E9E6] bg-white rounded-lg shadow-xs overflow-hidden flex flex-col text-[#37352F]">
                    
                    {/* Header */}
                    <div className="bg-[#F7F7F5] p-4 border-b border-[#E9E9E6] flex items-center justify-between px-5">
                      <div className="flex items-center gap-1.5">
                        <Trophy className="w-4.5 h-4.5 text-amber-500" />
                        <h2 className="text-xs font-bold text-[#37352F]">課堂筆記自我回顧測驗</h2>
                      </div>
                      <span className="text-[11px] font-bold text-[#7C7B77]">
                        {quizFinished ? '📝 測驗完成' : `第 ${currentQuestionIndex + 1} 題 / 共 ${quizQuestions.length} 題`}
                      </span>
                    </div>

                    {/* Main Quiz Area */}
                    <div className="p-5 md:p-6 flex-1">
                      
                      {!quizFinished ? (
                        <div className="flex flex-col gap-5">
                          
                          {/* Question Title */}
                          <div className="text-xs md:text-sm font-bold text-[#37352F] leading-relaxed bg-[#F7F7F5] p-4 rounded border border-[#E9E9E6]">
                            {quizQuestions[currentQuestionIndex].question}
                          </div>

                          {/* Options Choice list */}
                          <div className="flex flex-col gap-2.5">
                            {quizQuestions[currentQuestionIndex].options.map((opt, idx) => {
                              let btnClass = 'border border-[#E9E9E6] hover:bg-[#F7F7F5] bg-white text-[#37352F]';
                              
                              if (selectedAnswer === idx) {
                                btnClass = 'border-2 border-[#37352F] bg-[#F1F1EF] text-[#37352F] font-bold';
                              }

                              if (isAnswerSubmitted) {
                                if (idx === quizQuestions[currentQuestionIndex].correctAnswer) {
                                  btnClass = 'border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-xs';
                                } else if (selectedAnswer === idx) {
                                  btnClass = 'border-2 border-rose-500 bg-rose-50/70 text-rose-800 font-bold line-through';
                                } else {
                                  btnClass = 'border border-[#E9E9E6] bg-white text-[#A4A29E] opacity-50';
                                }
                              }

                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleSelectAnswer(idx)}
                                  disabled={isAnswerSubmitted}
                                  className={`w-full p-3.5 text-left rounded transition-all font-medium text-xs flex items-center justify-between cursor-pointer ${btnClass}`}
                                >
                                  <span>{String.fromCharCode(65 + idx)}.  {opt}</span>
                                  {isAnswerSubmitted && idx === quizQuestions[currentQuestionIndex].correctAnswer && (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300 font-bold">正確答案</span>
                                  )}
                                  {isAnswerSubmitted && selectedAnswer === idx && idx !== quizQuestions[currentQuestionIndex].correctAnswer && (
                                    <span className="text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded border border-rose-300 font-bold">您答錯了</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Explanation Card */}
                          {isAnswerSubmitted && (() => {
                            const currentQ = quizQuestions[currentQuestionIndex];
                            const correctIdx = currentQ.correctAnswer;
                            const isCorrect = selectedAnswer === correctIdx;
                            const correctLetter = String.fromCharCode(65 + correctIdx);
                            const correctOptionText = currentQ.options[correctIdx];

                            return (
                              <div className="flex flex-col gap-3">
                                {isCorrect ? (
                                  <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-lg text-xs text-emerald-800 flex items-center gap-2 font-bold shadow-2xs">
                                    <span className="text-sm">🎉</span>
                                    <span>答對了！正確答案是 <b className="bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-900 font-mono">({correctLetter}) {correctOptionText}</b></span>
                                  </div>
                                ) : (
                                  <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-lg text-xs text-rose-800 flex flex-col gap-1.5 font-bold shadow-2xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm">❌</span>
                                      <span>答錯了！您的選擇是 <b className="bg-rose-100/80 px-1.5 py-0.5 rounded text-rose-900 font-mono">({String.fromCharCode(65 + (selectedAnswer ?? 0))})</b></span>
                                    </div>
                                    <div className="pl-6 text-[#922D2D] leading-relaxed">
                                      正確答案應為：<b className="bg-emerald-55/40 text-emerald-900 px-2 py-0.5 rounded border border-emerald-200 font-mono">({correctLetter}) {correctOptionText}</b>
                                    </div>
                                  </div>
                                )}
                                <div className="bg-[#FDF6E2] border border-[#F5E6C0] p-4 rounded flex flex-col gap-1.5 text-[#37352F]">
                                  <span className="text-[10px] font-bold text-[#D97706] uppercase tracking-wide flex items-center gap-1">
                                    💡 AI 考題概念剖析
                                  </span>
                                  <p className="text-xs text-[#5A5A57] font-semibold leading-relaxed">
                                    {currentQ.explanation}
                                  </p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Action Button */}
                          <div className="mt-2 flex justify-end">
                            {!isAnswerSubmitted ? (
                              <button
                                onClick={handleSubmitAnswer}
                                disabled={selectedAnswer === null}
                                className="bg-[#23221E] text-white hover:bg-[#37352F] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold px-4 py-2.5 rounded cursor-pointer transition-all active:scale-95"
                              >
                                送出回答
                              </button>
                            ) : (
                              <button
                                onClick={handleNextQuestion}
                                className="bg-[#23221E] hover:bg-[#37352F] text-white rounded text-xs font-semibold px-4.5 py-2.5 cursor-pointer shadow-xs flex items-center gap-1.5"
                              >
                                {currentQuestionIndex + 1 < quizQuestions.length ? (
                                  <>
                                    <span>下一題</span>
                                    <ChevronRight className="w-4 h-4" />
                                  </>
                                ) : (
                                  '查看分數報告'
                                )}
                              </button>
                            )}
                          </div>

                        </div>
                      ) : (
                        
                        /* Results Board */
                        <div className="py-6 flex flex-col items-center text-center gap-4">
                          <div className="text-5xl">🏆</div>
                          
                          <div>
                            <h3 className="text-base font-bold text-[#37352F]">自我回顧測驗成果驗收完成！</h3>
                            <p className="text-xs text-[#7C7B77] mt-1">每次自主測驗是維持大腦海馬體長效複習記憶的最佳方式。</p>
                          </div>

                          <div className="bg-[#F7F7F5] border border-[#E9E9E6] p-4 rounded grid grid-cols-2 gap-6 min-w-[240px] mt-2">
                            <div>
                              <div className="text-2xl font-black text-[#37352F]">{quizScore} / {quizQuestions.length}</div>
                              <span className="text-[10px] text-[#7C7B77] font-semibold tracking-wider uppercase">得分題數</span>
                            </div>
                            <div>
                              <div className="text-2xl font-black text-amber-600">
                                {Math.round((quizScore / quizQuestions.length) * 100)}%
                              </div>
                              <span className="text-[10px] text-[#7C7B77] font-semibold tracking-wider uppercase">成績表現</span>
                            </div>
                          </div>

                          <div className="mt-4 flex gap-2.5">
                            <button
                              onClick={handleRestartQuiz}
                              className="bg-white border border-[#E9E9E6] hover:bg-[#F7F7F5] text-[#37352F] text-xs font-semibold px-4 py-2.5 rounded cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              重新挑戰
                            </button>
                            <button
                              onClick={() => {
                                setActiveTab('notes');
                              }}
                              className="bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-semibold px-4 py-2.5 rounded cursor-pointer transition-all active:scale-95"
                            >
                              回來研讀筆記
                            </button>
                          </div>
                        </div>

                      )}

                    </div>

                  </div>
                )}
              </motion.div>
            )}

            {/* TAB 4: HISTORICAL SAVE SESSIONS ARCHIVE */}
            {activeTab === 'history' && (
              <motion.div 
                key="history-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                <div className="border border-[#E9E9E6] bg-white rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xs font-bold text-[#7C7B77] uppercase tracking-wider flex items-center gap-1.5 pb-2">
                      📂 筆記封存檔案歷史 ({notesList.length})
                    </h2>
                    <span className="text-[11px] text-[#A4A29E] font-medium">存於 LocalStorage (本地隱私保護)</span>
                  </div>

                  {notesList.length === 0 ? (
                    <div className="py-10 text-center flex flex-col items-center gap-2">
                      <div className="text-3xl">📁</div>
                      <p className="text-xs text-[#7C7B77]">尚無存檔筆記史，請至「新建整理」建立第一個！</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {notesList.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => {
                            setActiveNoteId(note.id);
                            setActiveTab('notes');
                          }}
                          className={`p-3 rounded border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            note.id === activeNoteId 
                              ? 'border-[#37352F] bg-[#F7F7F5] text-[#37352F]' 
                              : 'border-[#E9E9E6] hover:bg-[#F7F7F5] bg-white text-[#37352F]'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded bg-[#F1F1EF] border border-[#E9E9E6] flex items-center justify-center text-[#37352F] shrink-0">
                              {note.sourceType === 'youtube' && <Video className="w-3.5 h-3.5 text-red-500" />}
                              {note.sourceType === 'ppt' && <FileText className="w-3.5 h-3.5 text-blue-500" />}
                              {note.sourceType === 'voice' && <Mic className="w-3.5 h-3.5 text-violet-500" />}
                            </span>
                            <div className="min-w-0">
                              <h3 className="text-xs font-bold text-[#37352F] truncate">{note.title}</h3>
                              <p className="text-[10px] text-[#7C7B77] font-medium mt-0.5">{note.createdAt}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 bg-white p-1 rounded border border-[#E9E9E6]">
                            <button
                              onClick={(e) => deleteNote(note.id, e)}
                              className="p-1 rounded text-[#7C7B77] hover:text-red-650 hover:bg-[#FDF2F2] transition-colors cursor-pointer"
                              title="刪除"
                            >
                              <Trash className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="p-1 rounded text-[#37352F] hover:bg-[#F1F1EF] transition-all cursor-pointer"
                              title="展開"
                            >
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              </motion.div>
            )}

            {/* TAB 6: CRAM HUB (考前懶人包) */}
            {activeTab === 'cram' && (
              <motion.div 
                key="cram-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-5"
              >
                {/* Search & Filters */}
                <div className="border border-[#E9E9E6] bg-white rounded-lg p-5 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                        按年級篩選
                      </label>
                      <select 
                        value={cramGrade}
                        onChange={(e) => setCramGrade(e.target.value)}
                        className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F] cursor-pointer"
                      >
                        <option value="">全部年級</option>
                        <option value="高一">高一</option>
                        <option value="高二">高二</option>
                        <option value="高三">高三</option>
                        <option value="大一">大一</option>
                        <option value="大二">大二</option>
                        <option value="大三">大三</option>
                        <option value="大四">大四</option>
                      </select>
                    </div>

                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-[#7C7B77] uppercase tracking-wide mb-1.5">
                        按科目關鍵字過濾
                      </label>
                      <input 
                        type="text"
                        placeholder="例如：微積分、物理、經濟學..."
                        value={cramSubject}
                        onChange={(e) => setCramSubject(e.target.value)}
                        className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5 border-t border-[#F1F1EF] pt-4">
                    <button
                      onClick={() => {
                        setCramGrade('');
                        setCramSubject('');
                        setCramResults(INITIAL_CRAM_DB);
                      }}
                      className="px-4 py-2.5 text-xs font-semibold bg-white border border-[#E9E9E6] hover:bg-[#F7F7F5] rounded cursor-pointer text-[#37352F] transition-all"
                    >
                      重設條件
                    </button>
                    <button
                      onClick={() => {
                        setIsSearchingCram(true);
                        setTimeout(() => {
                          const filtered = INITIAL_CRAM_DB.filter(item => {
                            const matchGrade = cramGrade ? item.grade === cramGrade : true;
                            const matchSubject = cramSubject ? item.subject.toLowerCase().includes(cramSubject.toLowerCase().trim()) : true;
                            return matchGrade && matchSubject;
                          });
                          setCramResults(filtered);
                          setIsSearchingCram(false);
                        }, 500);
                      }}
                      className="px-5 py-2.5 text-xs font-bold bg-[#23221E] hover:bg-[#37352F] text-white rounded cursor-pointer transition-all flex items-center gap-2 shadow-xs"
                      disabled={isSearchingCram}
                    >
                      {isSearchingCram ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>過濾中...</span>
                        </>
                      ) : (
                        <span>套用過濾條件</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Cram listings */}
                <div className="flex flex-col gap-4">
                  {cramResults.length === 0 ? (
                    <div className="bg-white border border-[#E9E9E6] p-10 text-center rounded-lg flex flex-col items-center gap-2">
                      <span className="text-3xl">🏮</span>
                      <p className="text-xs text-[#7C7B77]">找不到符合篩選條件的考前懶人包心法，您可以試試重設條件！</p>
                    </div>
                  ) : (
                    cramResults.map((item) => (
                      <div key={item.id} className="bg-white border border-[#E9E9E6] rounded-lg p-5 flex flex-col gap-4 shadow-2xs hover:shadow-xs transition-shadow">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="bg-[#FAF3E0] text-[#D97706] text-[10px] font-bold px-2 py-0.5 rounded border border-[#F5E6C0]">
                                {item.grade}
                              </span>
                              <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                                {item.subject}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-[#37352F] leading-snug">{item.title}</h3>
                          </div>

                          <button
                            onClick={() => {
                              const currentLikes = likedCrams[item.id] || 0;
                              setLikedCrams(prev => ({
                                ...prev,
                                [item.id]: currentLikes === 0 ? 1 : 0
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                              likedCrams[item.id] 
                                ? 'bg-[#FDF2F2] border-[#E85D5D] text-[#8A1F1F]' 
                                : 'bg-white border-[#E9E9E6] text-[#7C7B77] hover:bg-[#F7F7F5]'
                            }`}
                          >
                            <ThumbsUp className={`w-3.5 h-3.5 ${likedCrams[item.id] ? 'fill-current' : ''}`} />
                            <span>{item.likes_count + (likedCrams[item.id] ? 1 : 0)} 讚</span>
                          </button>
                        </div>

                        <div className="bg-[#F7F7F5] border border-[#E9E9E6]/60 p-4 rounded text-xs leading-relaxed text-[#5A5A57] font-mono whitespace-pre-wrap select-text">
                          {item.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* TAB 7: WEB SETTINGS */}
            {activeTab === 'settings' && (
              <motion.div 
                key="settings-screen"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex flex-col gap-6"
              >
                {/* Intro Title */}
                <div className="bg-[#F1F1EF] text-[#37352F] p-4.5 rounded-lg border border-[#E9E9E6] flex gap-3 items-start">
                  <span className="text-xl">⚙️</span>
                  <div>
                    <h2 className="font-bold text-xs">系統與網頁設定面板</h2>
                    <p className="text-xs text-[#5A5A57] leading-relaxed mt-0.5">
                      在此可變更您的自訂顯示名稱、密碼與安全性設定，調整每日學習數據，並管理本地快取清除等多功能打卡防呆選項。
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left Box: Member Profile */}
                  <form onSubmit={handleSaveSettings} className="bg-white border border-[#E9E9E6] p-5 rounded-lg flex flex-col gap-4">
                    <h3 className="text-xs font-bold text-[#37352F] border-b border-[#F1F1EF] pb-2 uppercase tracking-wider">
                      👤 個人檔案與自訂名稱
                    </h3>

                    {settingsSuccess && (
                      <div className="bg-[#EEF6EE] border border-[#7FBC7F]/40 p-3 rounded text-xs text-[#1E4620] font-bold">
                        {settingsSuccess}
                      </div>
                    )}

                    {settingsError && (
                      <div className="bg-[#FDF2F2] border border-[#E85D5D]/40 p-3 rounded text-xs text-[#8A1F1F] font-bold">
                        {settingsError}
                      </div>
                    )}

                    <div>
                      <label className="block text-[10.5px] font-bold text-[#7C7B77] mb-1.5">
                        自訂學員顯示名稱
                      </label>
                      <input 
                        type="text"
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        placeholder="請輸入您的顯示名稱"
                        className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F] font-semibold"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-bold text-[#7C7B77] mb-1.5">
                        系統 Email 帳號
                      </label>
                      <input 
                        type="email"
                        value={settingsEmail}
                        readOnly
                        className="w-full text-xs p-2.5 rounded border border-[#E9E9E6] bg-[#F7F7F5] text-[#7C7B77] cursor-not-allowed outline-none select-all"
                        title="主要帳號目前不提供修改"
                      />
                      <p className="text-[10px] text-[#A4A29E] mt-1">為保障學習歷史一致性，登入 Email 不提供在線修改。</p>
                    </div>

                    <div className="border-t border-[#F1F1EF] pt-4 mt-1">
                      <h4 className="text-[11px] font-bold text-[#37352F] mb-3 flex items-center gap-1">
                        <span>🔒 變更帳密安全性 (選填)</span>
                      </h4>

                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="block text-[10px] text-[#7C7B77] mb-1">舊密碼驗證</label>
                          <input 
                            type="password"
                            value={settingsOldPassword}
                            onChange={(e) => setSettingsOldPassword(e.target.value)}
                            placeholder="保留空白則不修改密碼"
                            className="w-full text-xs p-2 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#7C7B77] mb-1">設定新密碼</label>
                          <input 
                            type="password"
                            value={settingsNewPassword}
                            onChange={(e) => setSettingsNewPassword(e.target.value)}
                            placeholder="請填入您想設定的新密碼"
                            className="w-full text-xs p-2 rounded border border-[#E9E9E6] bg-white text-[#37352F] focus:outline-none focus:border-[#37352F]"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full mt-2 bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-bold py-2.5 rounded cursor-pointer transition-all active:scale-95 text-center"
                    >
                      儲存設定變更
                    </button>
                  </form>

                  {/* Right Box: Application Settings & Attendance */}
                  <div className="flex flex-col gap-5">
                    
                    {/* Attendance Info Panel */}
                    <div className="bg-white border border-[#E9E9E6] p-5 rounded-lg flex flex-col gap-3">
                      <h3 className="text-xs font-bold text-[#37352F] border-b border-[#F1F1EF] pb-2 uppercase tracking-wider flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-pulse" />
                        <span>📆 每日打卡學習統計</span>
                      </h3>
                      <div className="text-[11.5px] text-[#5A5A57] leading-relaxed flex flex-col gap-2 font-medium">
                        <div className="flex justify-between items-center bg-[#FAF3E0] p-2.5 rounded border border-[#F5E6C0]">
                          <span className="font-semibold text-[#A16207]">連續打卡天數 :</span>
                          <span className="text-amber-700 font-bold font-mono text-sm">{streakDays} 天</span>
                        </div>
                        <p className="mt-1">
                          打卡狀態將於每日<b>上午 10:00</b> 自動重設刷新。系統正穩定判定並保管您的長效學習打卡狀態。
                        </p>
                        <p className="text-[10.5px] text-[#A4A29E]">
                          💡 請直接點擊網頁頂端或側邊欄的 <b>學習火苗狀態圖章</b>，即可查看詳細打卡日誌並手動進行補打卡。
                        </p>
                      </div>
                    </div>

                    {/* Dangerous Zone */}
                    <div className="bg-white border border-[#E9E9E6] p-5 rounded-lg flex flex-col gap-4">
                      <h3 className="text-xs font-bold text-[#37352F] border-b border-[#F1F1EF] pb-2 uppercase tracking-wider text-red-650">
                        ⚠️ 本機快取管理與重置區
                      </h3>
                      <p className="text-xs text-[#5A5A57] leading-relaxed">
                        您的學習筆記、測驗成績及帳號皆加密儲存在本地瀏覽器的 LocalStorage 隔離沙盒中。如果您需要回到最初乾淨的教學範本，可執行重設。
                      </p>
                      
                      <div className="flex flex-col gap-2.5 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('確定要初始化所有整理好的筆記資料嗎？這將載入最初的 Event Loop 範本。')) {
                              localStorage.removeItem('ai_lecture_notes');
                              window.location.reload();
                            }
                          }}
                          className="w-full text-left py-2 px-3 border border-red-200 bg-red-50 hover:bg-red-100/60 rounded text-xs text-red-700 font-semibold transition-colors cursor-pointer animate-none"
                        >
                          🧹 一鍵初始化筆記資料庫
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('確定要登出並切換回其他帳號嗎？')) {
                              handleLogout();
                            }
                          }}
                          className="w-full text-left py-2 px-3 border border-slate-300 bg-white hover:bg-slate-50 rounded text-xs text-[#37352F] font-semibold transition-colors cursor-pointer flex items-center justify-between animate-none"
                        >
                          <span>登出安全帳戶</span>
                          <LogOut className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

              </motion.div>
            )}

          </AnimatePresence>

        </div>

        {/* Footer Area */}
        <footer className="bg-[#F7F7F5] border-t border-[#E9E9E6] py-5 px-6 text-center text-[11px] text-[#7C7B77] mt-auto">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 font-medium">
            <span>© 115 網頁工程設計課程 - 師生協作 Vibe Coding 專利實踐</span>
            <div className="flex items-center gap-3">
              <a href="https://ai.studio/build" target="_blank" rel="noreferrer" className="hover:text-[#37352F] flex items-center gap-1">
                由 Google AI Studio 強力驅動
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </footer>

      </div>

      {/* Mobile Drawer (Visible on md and smaller when open) */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
              className="fixed inset-0 bg-black z-40 md:hidden animate-none"
            />
            {/* Drawer Body */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 bottom-0 left-0 w-64 max-w-[85vw] bg-[#F7F7F5] border-r border-[#E9E9E6] z-50 p-4 flex flex-col justify-between select-none text-[13px] md:hidden shadow-xl"
            >
              <div className="flex flex-col gap-4 overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-[#E9E9E6]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-white border border-[#E9E9E6] flex items-center justify-center text-sm font-bold">
                      👨‍🎓
                    </div>
                    <span className="font-bold text-[#37352F] truncate text-xs">
                      {currentUser ? `${currentUser.customName}的筆記整理器` : '我的筆記整理器'}
                    </span>
                  </div>
                  <button 
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="p-1 hover:bg-[#E9E9E6] rounded text-[#7C7B77] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Sidebar Navigation */}
                <div className="flex flex-col gap-4">
                  {/* Menu items */}
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        setActiveTab('input');
                        setShowHomeIntro(true);
                        setIsMobileSidebarOpen(false);
                      }}
                      className="w-full py-2 px-2.5 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]"
                    >
                      <span className="text-sm">🏡</span>
                      <span>關於此整理器 / 主頁</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('input');
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`w-full py-2 px-2.5 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'input' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
                      }`}
                    >
                      <span className="text-sm">➕</span>
                      <span>新增課堂整理</span>
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('cram');
                        setIsMobileSidebarOpen(false);
                      }}
                      className={`w-full py-2 px-2.5 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'cram' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
                      }`}
                    >
                      <span className="text-sm">🏮</span>
                      <span>考前懶人包庫</span>
                    </button>
                  </div>

                  {/* Flame click in sidebar */}
                  <div 
                    onClick={() => {
                      setShowCheckInModal(true);
                      setIsMobileSidebarOpen(false);
                    }}
                    className="p-3 bg-[#FAF3E0] hover:bg-[#F5E6C0] rounded border border-[#F5E6C0] flex items-start gap-2 text-[11.5px] text-[#A16207] cursor-pointer transition-colors"
                  >
                    <span className="text-base leading-none">🔥</span>
                    <div>
                      <span className="font-bold">打卡進度 {streakDays} 天</span>
                      <p className="text-[10px] text-[#A16207]/80 mt-0.5">點此查看每天10點刷新的日誌</p>
                    </div>
                  </div>

                  {/* Notes List */}
                  <div className="flex flex-col gap-1.5 pt-2">
                    <span className="px-1 text-[10px] font-bold text-[#A4A29E] uppercase tracking-wider block mb-1">
                      📌 我的課程筆記庫 ({notesList.length})
                    </span>
                    <div className="overflow-y-auto max-h-[180px] flex flex-col gap-1">
                      {notesList.map((note) => {
                        const isActive = note.id === activeNoteId;
                        const isSelected = selectedSourceIds.includes(note.id);
                        return (
                          <div
                            key={note.id}
                            className={`w-full flex items-center gap-2 py-1 px-1.5 rounded-md transition-all ${
                              isActive 
                                ? 'bg-[#E3E2E0]/50 text-[#37352F]' 
                                : 'text-[#585754] hover:bg-[#F1F1EF] hover:text-[#37352F]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSource(note.id)}
                              className="w-3.5 h-3.5 rounded accent-amber-600 cursor-pointer shrink-0 border border-[#C2C2BE]"
                              title={isSelected ? "取消勾選此來源" : "將此檔案加為背景對話來源"}
                            />
                            <button
                              onClick={() => {
                                setActiveNoteId(note.id);
                                setActiveTab('notes');
                                setIsMobileSidebarOpen(false);
                              }}
                              className="flex-1 text-left min-w-0 transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
                            >
                              <span className="shrink-0 text-xs">
                                {note.sourceType === 'youtube' && '📺'}
                                {note.sourceType === 'ppt' && '📄'}
                                {note.sourceType === 'voice' && '🎙️'}
                              </span>
                              <span className={`truncate ${isActive ? 'font-bold' : 'font-medium'}`}>{note.title}</span>
                            </button>
                          </div>
                        );
                      })}
                      {notesList.length === 0 && (
                        <span className="px-1 text-[11px] text-[#A4A29E] italic">尚無存檔筆記</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Sidebar Footer */}
              <div className="pt-3 border-t border-[#E9E9E6] flex flex-col gap-2">
                <button
                  onClick={() => {
                    setActiveTab('settings');
                    setIsMobileSidebarOpen(false);
                  }}
                  className={`w-full py-1.5 px-2 rounded-md font-medium text-left transition-all flex items-center gap-2 cursor-pointer ${
                    activeTab === 'settings' ? 'bg-[#F1F1EF] text-[#37352F]' : 'text-[#7C7B77] hover:bg-[#F1F1EF] hover:text-[#37352F]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>網頁設定</span>
                </button>
                {currentUser && (
                  <div className="bg-[#F1F1EF]/70 p-2 rounded border border-[#E9E9E6]/40 text-xs text-[#37352F]">
                    <p className="font-bold truncate">{currentUser.customName}</p>
                    <p className="text-[10px] text-[#A4A29E] truncate">{currentUser.email}</p>
                  </div>
                )}
                <p className="px-1 select-none font-mono text-[9px] text-[#A4A29E]">UTC: 2026-05-21</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Home Intro Modal */}
      <AnimatePresence>
        {showHomeIntro && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHomeIntro(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs flex items-center justify-center p-4 animate-none"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-lg shadow-xl border border-[#E9E9E6] z-[60] flex flex-col overflow-hidden max-h-[85vh] text-[#37352F]"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-teal-800 to-emerald-950 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏡</span>
                  <div className="text-left">
                    <h3 className="text-sm font-bold">AI 課堂筆記整理器</h3>
                    <p className="text-[10.5px] opacity-75">全方位智能學習輔助平台</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHomeIntro(false)}
                  className="p-1 hover:bg-white/10 rounded text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex flex-col gap-4 text-xs font-medium text-[#5A5A57] leading-relaxed text-left">
                <p>
                  歡迎來到 <b>AI 課堂筆記整理器</b>！本系統集成了尖端的自然語言處理技術，旨在為廣大學員、導師與自主學習者，提供超一流、免去碎片化筆記煩惱的一站式頂級數位學習新空間。
                </p>

                <h4 className="font-bold text-[#37352F] text-xs flex items-center gap-1.5 border-b border-[#F1F1EF] pb-1 mt-1">
                  💡 核心能力與特色
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="p-3 bg-[#FAF9F6] border border-[#E9E9E6] rounded">
                    <span className="font-bold text-[#37352F] block text-[11px] mb-0.5">🎙️ 精準語音高重建</span>
                    一鍵請求麥克風權限錄製聲音，自動過濾噪聲還原成教案逐字稿，點擊即可查看。
                  </div>
                  <div className="p-3 bg-[#FAF9F6] border border-[#E9E9E6] rounded">
                    <span className="font-bold text-[#37352F] block text-[11px] mb-0.5">📺 YouTube 影片分析</span>
                    輸入公開 YouTube 影片 URL，智慧轉譯高精大綱，精析時間戳與語意上下文。
                  </div>
                  <div className="p-3 bg-[#FAF9F6] border border-[#E9E9E6] rounded">
                    <span className="font-bold text-[#37352F] block text-[11px] mb-0.5">🏆 互動學科自我測驗</span>
                    針對整理出的知識點智能出題，支持單選及解析翻牌，當場精準評估吸收成效。
                  </div>
                  <div className="p-3 bg-[#FAF9F6] border border-[#E9E9E6] rounded">
                    <span className="font-bold text-[#37352F] block text-[11px] mb-0.5">🏮 考前救星懶人包</span>
                    將枯燥乏味的課程重點轉化成精美便捷的隨身小卡，零阻塞高效率回顧。
                  </div>
                </div>

                <div className="bg-teal-50 border border-teal-100 p-3.5 rounded text-teal-850 flex flex-col gap-1.5 mt-2 text-left">
                  <span className="font-bold text-[11px] flex items-center gap-1">🔒 隱私與安全性</span>
                  您的筆記、音頻逐字稿和打卡日誌皆直接儲存在您瀏覽器的 Local Sandbox 與安全帳戶中，無延遲，且保障核心隱私。
                </div>
              </div>

              {/* Footer */}
              <div className="bg-[#F7F7F5] border-t border-[#E9E9E6] p-4 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHomeIntro(false)}
                  className="bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-bold px-4 py-2 rounded cursor-pointer transition-colors text-center"
                >
                  開始探索筆記
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Attendance Check-In Modal */}
      <AnimatePresence>
        {showCheckInModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCheckInModal(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs flex items-center justify-center p-4 animate-none"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-xl border border-[#E9E9E6] z-[60] flex flex-col overflow-hidden max-h-[85vh] text-[#37352F]"
            >
              {/* Header */}
              <div className="bg-[#FAF3E0] border-b border-[#F5E6C0] p-4.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-500 fill-amber-500 animate-pulse animate-none" />
                  <div className="text-left">
                    <h3 className="text-sm font-bold text-[#A16207]">每日打卡補簽與日誌</h3>
                    <p className="text-[10px] text-[#A16207]/70">每日上午 10:00 自動刷新</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCheckInModal(false)}
                  className="p-1 hover:bg-[#F1F1EF] rounded text-[#7C7B77] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex flex-col gap-4 text-xs font-medium text-[#5A5A57] leading-relaxed overflow-y-auto text-left">
                <div className="bg-amber-50 rounded border border-amber-150 p-3 flex flex-col gap-1 text-amber-950 text-left">
                  <span className="font-bold flex items-center gap-1 text-[11px]">📢 台灣時間對時打卡機制</span>
                  <p className="text-[10.5px]">
                    本系統與您的<b>台灣時間 (Asia/Taipei)</b> 完美保持對接。
                    您可以在下方<b>自由點選或對 30 天內的日期進行捕簽</b>，系統將精準計算最大連續 30 天的學習火苗喔！
                  </p>
                </div>

                {streakDays >= 30 && (
                  <div className="bg-amber-100/70 border border-amber-300 text-amber-950 rounded-lg p-3 text-[11px] flex flex-col gap-1 text-left">
                    <span className="font-bold flex items-center gap-1 text-amber-900">👑 簽到日期已達最大限制 (30天)</span>
                    <p className="leading-snug text-[10.5px] text-amber-900/90">
                      恭喜！您的學習打卡天數已達<b>最大核心限制 (30 天)</b>。您仍可以在下方正常點擊打卡以維持火苗狀態，但紀錄天數將鎖定在 30 天滿載上限。
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2 text-left">
                  <span className="text-[10px] uppercase font-bold text-[#7C7B77] tracking-wider block">30日學習打卡列表（點選日期即可完成打卡）</span>
                  
                  <div className="grid grid-cols-1 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                    {getTaiwan30Days().map(({ key, display, isToday }) => {
                      const isChecked = !!checkInLogs[key];
                      
                      return (
                        <div 
                          key={key}
                          onClick={() => {
                            setCheckInLogs(prev => ({
                              ...prev,
                              [key]: !prev[key]
                            }));
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all active:scale-99 ${
                            isChecked 
                              ? 'bg-amber-50/50 border-amber-300 text-[#37352F]' 
                              : 'bg-white border-[#E9E9E6] hover:bg-[#F7F7F5] text-[#7C7B77]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm text-center w-5">{isChecked ? '🔥' : '⏳'}</span>
                            <div className="flex flex-col">
                              <span className="font-bold text-[11px] text-[#37352F] flex items-center gap-1.5">
                                {display} 課程打卡
                                {isToday && <span className="bg-amber-100 text-[#D97706] text-[8px] px-1.5 py-0.2 rounded border border-amber-200">今天</span>}
                              </span>
                              <span className="text-[9.5px] text-[#7C7B77]">台灣標準時間對接</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 font-bold shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                              isChecked ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {isChecked ? '已完成' : '未打卡'}
                            </span>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                              isChecked ? 'border-amber-500 bg-amber-500 text-white' : 'border-[#C1C1BE] bg-white'
                            }`}>
                              {isChecked && (
                                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-between items-center bg-[#F7F7F5] p-3 rounded-lg border border-[#E9E9E6] font-mono">
                  <span className="text-xs text-[#37352F] font-bold">當前連續打卡天數 :</span>
                  <div className="flex items-center gap-1.5">
                    {streakDays >= 30 && <span className="text-[9.5px] px-2 py-0.5 bg-amber-500/20 text-amber-800 rounded-full font-sans font-bold">已達最大上限</span>}
                    <span className="text-sm font-bold text-[#D97706] bg-amber-100/50 px-2.5 py-0.5 rounded border border-amber-200">{streakDays} 天</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-[#F7F7F5] border-t border-[#E9E9E6] p-4 flex justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const all30 = getTaiwan30Days();
                    const newLogs = { ...checkInLogs };
                    all30.forEach(d => {
                      newLogs[d.key] = true;
                    });
                    setCheckInLogs(newLogs);
                  }}
                  className="hover:bg-[#E9E9E6] text-[#7C7B77] hover:text-[#37352F] text-xs font-bold px-3 py-2 rounded cursor-pointer transition-colors"
                >
                  ⚡ 一鍵全補簽 30 天
                </button>
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-bold px-4 py-2 rounded cursor-pointer transition-colors"
                >
                  確認關閉
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Google Bookmark Guide Modal */}
      <AnimatePresence>
        {showBookmarkModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBookmarkModal(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs flex items-center justify-center p-4 animate-none"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-lg shadow-xl border border-[#E9E9E6] z-[60] flex flex-col overflow-hidden max-h-[85vh] text-[#37352F]"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐️</span>
                  <div className="text-left">
                    <h3 className="text-sm font-bold">加入 Google / 瀏覽器書籤</h3>
                    <p className="text-[10px] opacity-90">隨時隨地，快速訪問您的 AI 筆記工作區</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowBookmarkModal(false)}
                  className="p-1 hover:bg-white/10 rounded text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex flex-col gap-4 text-xs font-semibold text-[#5A5A57] leading-relaxed text-left">
                <div className="bg-amber-50 rounded border border-amber-250 p-3.5 flex flex-col gap-1.5 text-[#37352F]">
                  <span className="font-bold flex items-center gap-1 text-[11px] text-amber-800">💡 快捷鍵快速收藏</span>
                  <p className="text-[11px] leading-relaxed text-slate-700">
                    在您的鍵盤上，同時按下以下組合鍵，即可立刻將本網頁加入您的瀏覽器與 Google 帳號書籤收藏：
                  </p>
                  <div className="flex gap-4 mt-1">
                    <div className="flex-1 bg-white border border-[#E9E9E6] p-2 rounded text-center">
                      <span className="block text-[10px] text-gray-400">Windows / Linux</span>
                      <kbd className="font-mono bg-gray-150 px-1.5 py-0.5 rounded text-xs font-bold shadow-xs">Ctrl</kbd> + <kbd className="font-mono bg-gray-150 px-1.5 py-0.5 rounded text-xs font-bold shadow-xs">D</kbd>
                    </div>
                    <div className="flex-1 bg-white border border-[#E9E9E6] p-2 rounded text-center">
                      <span className="block text-[10px] text-gray-400">Mac OS X</span>
                      <kbd className="font-mono bg-gray-150 px-1.5 py-0.5 rounded text-xs font-bold shadow-xs">⌘</kbd> + <kbd className="font-mono bg-gray-150 px-1.5 py-0.5 rounded text-xs font-bold shadow-xs">D</kbd>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-left">
                  <span className="text-[10px] uppercase font-bold text-[#7C7B77] tracking-wider block">其他收藏方式</span>
                  <ul className="list-disc pl-4 flex flex-col gap-1.5 text-slate-600">
                    <li>
                      <b>點擊網址列星號：</b> 點擊 Chrome / Google 瀏覽器網址列最右側的「☆ 星號圖示」即可儲存。
                    </li>
                    <li>
                      <b>直接添加至 Google Bookmarks：</b> 
                      <a 
                        href={`https://www.google.com/bookmarks/mark?op=edit&output=popup&bkmk=${encodeURIComponent(window.location.href)}&title=${encodeURIComponent('AI課堂筆記整理器')}`}
                        target="_blank" 
                        rel="referrer noopener"
                        className="text-amber-600 hover:underline font-bold inline-flex items-center gap-1 shrink-0 ml-1"
                      >
                        點我前往 Google Bookmarks 舊版登錄 ↗
                      </a>
                    </li>
                  </ul>
                </div>

                <p className="text-[10.5px] text-[#A4A29E] text-center mt-1">
                  💡 注意：本地課堂筆記會安全儲存於您目前的瀏覽器 Local Registry 中，定期造訪即可維繫您的學習火苗打卡！
                </p>
              </div>

              {/* Footer */}
              <div className="bg-[#F7F7F5] border-t border-[#E9E9E6] p-4 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setShowBookmarkModal(false)}
                  className="bg-[#23221E] hover:bg-[#37352F] text-white text-xs font-bold px-4 py-2 rounded cursor-pointer transition-colors"
                >
                  確認關閉
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Interactive Study Guides Drawer Overlays */}
      <AnimatePresence>
        {activeGuideType && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveGuideType(null)}
              className="fixed inset-0 bg-[#37352F]/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white border border-[#E9E9E6] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] z-[60] text-[#37352F]"
            >
              {/* Modal Header */}
              <div className="bg-[#FAF9F5] border-b border-[#E9E9E6] px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {activeGuideType === 'faq' && '💡'}
                    {activeGuideType === 'study_guide' && '🗺️'}
                    {activeGuideType === 'timeline' && '⏳'}
                    {activeGuideType === 'briefing' && '📑'}
                  </span>
                  <div className="flex flex-col text-left">
                    <h3 className="text-xs md:text-sm font-extrabold text-[#37352F] tracking-tight">
                      一鍵智慧講義導覽生成
                    </h3>
                    <p className="text-[10px] text-[#A16207] font-semibold text-left">
                      {activeGuideType === 'faq' && '高頻學術考點問答合集 (FAQ)'}
                      {activeGuideType === 'study_guide' && '自主進階研討導讀與反思地圖 (Study Guide)'}
                      {activeGuideType === 'timeline' && '講義概念遞進與學術運行時間軸 (Timeline Chronology)'}
                      {activeGuideType === 'briefing' && '關鍵字大綱亮點及摘要簡照亮點筆記手冊 (Briefing Doc)'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveGuideType(null)}
                  className="p-1 rounded bg-white hover:bg-gray-100 border border-gray-200 text-gray-400 hover:text-[#37352F] cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Modal Markdown Content Container */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/25">
                {isGeneratingGuide ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center gap-3">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    <div className="text-xs font-bold text-[#37352F] animate-pulse">
                      智囊正在交叉比對已勾選的 {selectedSourceIds.length} 份文件...
                    </div>
                    <p className="text-[11px] text-[#7C7B77] max-w-[340px] leading-relaxed mt-1">
                      本程序將提取文件大綱與逐字稿，比對推演鏈並進行多維度融合寫作，請稍候 3~5 秒鐘...
                    </p>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none text-[#37352F]">
                    {generatedGuideContent ? (
                      renderMarkdownText(generatedGuideContent)
                    ) : (
                      <p className="text-xs text-center text-gray-400 italic">無可用導覽內容。</p>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-[#FAF9F5] border-t border-[#E9E9E6] px-5 py-3 flex items-center justify-between gap-3">
                <span className="text-[10px] text-[#A4A29E] font-medium font-mono">
                  Grounded by Gemini 3.5 Flash
                </span>
                <div className="flex gap-2">
                  {generatedGuideContent && !isGeneratingGuide && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedGuideContent || "");
                        setErrorMessage("📋 導覽地圖內容已複製至您的剪貼簿！");
                        setTimeout(() => setErrorMessage(null), 3500);
                      }}
                      className="px-3.5 py-1.5 bg-white hover:bg-amber-50 text-amber-970 font-semibold border border-[#E9E9E6] rounded text-xs transition-colors cursor-pointer active:scale-95 text-center"
                    >
                      複製指南 Markdown
                    </button>
                  )}
                  <button
                    onClick={() => setActiveGuideType(null)}
                    className="px-3.5 py-1.5 bg-[#23221E] hover:bg-[#37352F] text-white font-bold rounded text-xs cursor-pointer active:scale-95 transition-all text-center"
                  >
                    關閉視窗
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
