import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { YoutubeTranscript } from 'youtube-transcript';
import officeParser from 'officeparser';

dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON bodies with higher limits for audio uploads
app.use(express.json({ limit: '30mb' }));

// Lazy initializer for Gemini client to prevent crashing on missing env keys during startup
let aiClient: GoogleGenAI | null = null;
function getGeminiClient() {
  if (aiClient) return aiClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY environment variable is missing. Please set it in Settings > Secrets.');
  }
  aiClient = new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return aiClient;
}

// Robust retry wrapper to handle rate limits and 429 quota exhaustion gracefully
async function executeGeminiWithRetry(
  ai: GoogleGenAI,
  params: {
    model: string;
    contents: any;
    config?: any;
  },
  maxRetries = 3,
  initialDelayMs = 1500
): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      attempt++;
      const errMsg = err.message || String(err);
      const isRateLimit = errMsg.includes('429') || 
                           errMsg.includes('RESOURCE_EXHAUSTED') || 
                           errMsg.includes('quota') ||
                           errMsg.includes('Resource has been exhausted') ||
                           err.status === 429;
      
      if (isRateLimit && attempt <= maxRetries) {
        // Calculate delay with exponential backoff and jitter
        const delay = initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`[Gemini-Retry] Received 429 Rate Limit (Attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

// Helper to extract YouTube video ID from multiple URL formats
function getYoutubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// REAL Speech-to-Text (Audio speech transcription via Gemini audio multimodal model)
app.post('/api/transcribe-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64 parameter.' });
    }

    const ai = getGeminiClient();

    // Clean up mimeType (remove standard codecs arguments like "audio/webm;codecs=opus" -> "audio/webm")
    const cleanMimeType = mimeType ? mimeType.split(';')[0] : 'audio/webm';
    console.log(`[STT] Processing real voice recording transcription. Mime: ${cleanMimeType}, Base64 Length: ${audioBase64.length}`);

    // Call high-fidelity transcription using Gemini 3.5 Flash with Retry
    const response = await executeGeminiWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: cleanMimeType
          }
        },
        '你是一個高精度的課堂錄音語音識別器。請將這段語音錄音精準、逐字翻譯/轉錄為繁體中文（台灣，zh-TW）。請只輸出最真實、逐字、不加任何修飾或額外標題的原文逐字稿內容，不要包含註解，不要任何引言、不用任何包裝文字。如果是安靜的沒有說話，請回傳「無語音內容」'
      ]
    });

    const transcript = response.text?.trim() || '無法辨識語音內容。';
    res.json({ transcript });

  } catch (error: any) {
    console.error('[STT] Speech-to-Text error:', error);
    res.status(500).json({ 
      error: error.message || '錄音轉換文字時發生錯誤。' 
    });
  }
});

// REST Api endpoints
app.post('/api/generate', async (req, res) => {
  try {
    const { sourceType, title, content, ytUrl, fileBase64, fileMimeType } = req.body;
    
    if (!sourceType || !title || !content) {
      return res.status(400).json({ error: 'Missing parameters: sourceType, title, and content are required.' });
    }

    const ai = getGeminiClient();

    // Fetch REAL YouTube Captions/Transcript if sourceType is youtube
    let realYtTranscript = '';
    if (sourceType === 'youtube') {
      const urlToUse = ytUrl || content.trim();
      const ytId = getYoutubeId(urlToUse);
      if (ytId) {
        try {
          console.log(`[Video-to-Text] Attempting to fetch real YouTube captions for ID: ${ytId}`);
          const parts = await YoutubeTranscript.fetchTranscript(ytId);
          realYtTranscript = parts.map(p => p.text).join(' ');
          console.log(`[Video-to-Text] Real captions fetched. Character count: ${realYtTranscript.length}`);
        } catch (err: any) {
          console.warn(`[Video-to-Text] Could not fetch native YouTube subtitles/captions for video ${ytId}:`, err.message || err);
          // Don't throw - can still proceed with direct search grounding or user notes
        }
      }
    }

    // Process PPT / Document upload (officeparser if unsupported, or native multimodal if PDF/image)
    let extractedOfficeText = '';
    let nativeMultimodalPayload: any = null;

    if (sourceType === 'ppt' && fileBase64 && fileMimeType) {
      try {
        const fileBuffer = Buffer.from(fileBase64, 'base64');
        const lowerMime = fileMimeType.toLowerCase();
        
        // Native supported multimodal types by Gemini 3.5 Flash:
        const isNativeMultimodal = lowerMime === 'application/pdf' || lowerMime.startsWith('image/');

        if (isNativeMultimodal) {
          console.log(`[Gemini-Multimodal] Mounting native Gemini media asset. Mime: ${lowerMime}`);
          nativeMultimodalPayload = {
            inlineData: {
              data: fileBase64,
              mimeType: lowerMime
            }
          };
        } else {
          // Check if this is a text file or text-like format that we can easily decode
          const isTextFile = lowerMime.startsWith('text/') || 
                             lowerMime === 'application/json' || 
                             lowerMime === 'application/javascript' ||
                             lowerMime === 'application/xml';
          
          if (isTextFile) {
            console.log(`[File-Parser] Reading plain text file content directly.`);
            extractedOfficeText = fileBuffer.toString('utf-8');
          } else {
            // Treat it as an Office Document (.pptx, .docx, .xlsx, .odt, etc.)
            console.log(`[File-Parser] Attempting to parse Office document (${lowerMime}) via officeparser.`);
            
            const parsed = await new Promise<any>((resolve, reject) => {
              officeParser.parseOffice(fileBuffer, (data, err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(data);
                }
              });
            });

            if (parsed && typeof parsed === 'string') {
              extractedOfficeText = parsed.trim();
              console.log(`[File-Parser] Successfully extracted ${extractedOfficeText.length} characters from Office document.`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[File-Parser] Error parsing file with MIME ${fileMimeType}:`, err.message || err);
        // Do not crash - back up to the user-entered text content
      }
    }

    let systemInstruction = `
      你是一個專為學生設計的「AI 課堂筆記整理器」的核心 AI 引擎（Backend Brain）。
      你必須用親切、條理分明、直擊考點的資深學長或助教口吻，
      將使用者輸入的課堂資訊（錄音逐字稿、PPT 文字內容、YouTube 影片內容）
      精準整理成最利於考前複習與大腦記憶的結構化內容。
      
      請嚴格使用繁體中文（台灣（zh-TW））輸出，不使用簡體字。
    `;

    let userPrompt = `
      這是一份課堂資料。主題為 "${title}"，資料來源形式為 "${sourceType}"。
    `;

    if (sourceType === 'youtube') {
      if (realYtTranscript) {
        userPrompt += `
        以下是從這個 YouTube 影片中「讀取到的真實說話字幕/逐字稿（Video-to-Text 原文）」：
        ---
        ${realYtTranscript}
        ---
        
        請依據上述「真實轉換的講話逐字稿」進行高度學術和精華提煉，生成筆記與隨堂測驗。
        另外，使用者也有提供以下的提示、重點說明或操作主題：
        ---
        ${content}
        ---
        `;
      } else {
        userPrompt += `
        【特別指示】這是一個 YouTube 影片連結（${ytUrl || content}）。
        由於此影片目前無法直接抽取原生字幕，請您使用「Google 關鍵字搜尋 Grounding 工具」，
        搜尋該 YouTube 網址、影片標題或主題，獲取該影片的網頁大綱、描述、評論以及相關課程主題核心知識。
        並以此「真實搜尋結果」為底蘊與核心事實，來為使用者精細編撰與提煉本堂課的筆記與複習題！
        
        使用者有提供以下的提示與操作主題：
        ---
        ${content}
        ---
        `;
      }
    } else if (sourceType === 'ppt') {
      if (extractedOfficeText) {
        userPrompt += `
        以下是從這個講義/投影片檔案中「智慧讀取到的真實文字與大綱內容 (Document-to-Text)」：
        ---
        ${extractedOfficeText}
        ---
        
        請依據上述的真實講義文字與大綱進行超高精華提煉，生成筆記、精確單字卡與隨堂測驗。
        另外，使用者也有提供以下的附加指示、操作主題或要點說明：
        ---
        ${content}
        ---
        `;
      } else if (nativeMultimodalPayload) {
        userPrompt += `
        後端已在此 API 請求中夾帶了您上傳的「實體 PDF 講義或講義頁面圖檔」。
        請直接讀取與解析此 Multimodal 檔案之投影片頁面、文字、公式、圖表、示意圖，並進行高度精華提煉。
        
        另外，使用者有提供以下的附加指示、操作主題或重點備忘說明：
        ---
        ${content}
        ---
        `;
      } else {
        userPrompt += `
        請依循以下使用者輸入內容，進行高精華深度分析與轉換：
        ---
        ${content}
        ---
        `;
      }
    } else {
      userPrompt += `
      請依循以下使用者輸入內容，進行高精華深度分析與轉換：
      ---
      ${content}
      ---
      `;
    }

    userPrompt += `
      請務必同時生成：
      1. 逐字稿/原文重建（如果是 YouTube 影片且我們有抓取到上方的真實逐字稿，請重整、潤飾、補充學術格式後的此真實逐字稿，約 300-800 字的 Traditional Chinese 原文重建；如果是上傳的文檔講義，請根據文檔中的精準事實或我們預載的 multimodal 數據，輸出完美且結構清晰的講義對應對照大綱原文重建，約 300-800 字；否則請根據使用者內容生成詳盡書面還原）
      2. 一分鐘快速大綱（限3-5個點，字數不超過300字，白話好讀）
      3. 完整精華摘要（依章節或主題分類的詳細筆記，使用 Markdown 標題條列）
      4. 核心重點數位單字卡（3-6 張，包含專有名詞/公式 term 與白話解釋/生活舉例 explanation）
      5. 3 題高水準隨堂測驗（具備 question, 4個選項 options, 正確答案文字 A, B, C 或 D, 與詳盡考點分析 explanation）
    `;

    const contentsArray: any[] = [];
    if (nativeMultimodalPayload) {
      contentsArray.push(nativeMultimodalPayload);
    }
    contentsArray.push(userPrompt);

    const responseSchemaObj = {
      type: Type.OBJECT,
      properties: {
        transcript: {
          type: Type.STRING,
          description: 'A detailed Traditional Chinese reconstruction, expansion, or transcription of the lecture materials.'
        },
        summary_one_minute: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '3-5 key bullet points summarizing the core concepts in under 300 words. Must be clear and easily readable.'
        },
        full_digest: {
          type: Type.STRING,
          description: 'Full rich detailed study notes structured beautifully by chapter, module, or theme in Markdown format.'
        },
        key_points_flashcards: {
          type: Type.ARRAY,
          description: 'An array of key terms/formulas and their simple traditional Chinese explanations and examples.',
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING, description: 'The academic term, formula name, or core concept.' },
              explanation: { type: Type.STRING, description: 'Plain English/Chinese explanation with an easy-to-understand real-life analogy or scenario.' }
            },
            required: ['term', 'explanation']
          }
        },
        quiz: {
          type: Type.ARRAY,
          description: 'Exactly 3 critical double-checked multiple-choice exam questions.',
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING, description: 'The quiz question challenging student understanding.' },
              options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Exactly 4 choice options, e.g., ["A) ...", "B) ...", "C) ...", "D) ..."] or similar options.'
              },
              answer: {
                type: Type.STRING,
                description: 'The correct answer representing exactly "A", "B", "C", or "D".'
              },
              explanation: { type: Type.STRING, description: 'Detailed academic explanation for why this is the correct answer and why other elements are false.' }
            },
            required: ['question', 'options', 'answer', 'explanation']
          }
        }
      },
      required: ['transcript', 'summary_one_minute', 'full_digest', 'key_points_flashcards', 'quiz']
    };

    let response;
    let fallbackAttempt = false;
    
    // We ONLY enable search grounding tools for YouTube if we DID NOT retrieve a real transcript transcript!
    // Search grounding tools consume 10x more RPM and quotas, and easily trigger 429 errors.
    const enableSearchTools = sourceType === 'youtube' && !realYtTranscript;

    try {
      console.log(`[Gemini-Request] Invoking model with native tools enabled: ${enableSearchTools}`);
      response = await executeGeminiWithRetry(ai, {
        model: 'gemini-3.5-flash',
        contents: contentsArray,
        config: {
          systemInstruction,
          tools: enableSearchTools ? [{ googleSearch: {} }] : undefined,
          responseMimeType: 'application/json',
          responseSchema: responseSchemaObj
        }
      });
    } catch (firstErr: any) {
      console.warn('[Gemini-Request] First attempt failed or rate-limited:', firstErr.message || firstErr);
      
      // If we used search grounding, let's immediately retry WITHOUT search grounding to see if that resolves the quota restriction!
      if (enableSearchTools) {
        console.log('[Gemini-Request] Auto-retrying immediately WITHOUT Google Search tool to bypass rate-limits...');
        fallbackAttempt = true;
        
        // Since Google Search failed, let's modify the user prompt slightly so AI knows to do the best it can with the textual metadata
        const fallbackPrompt = userPrompt + '\n\n【注意】由於搜尋服務速率限制，請您直接以自身廣大內置知識與標題，盡力生成本主題的高水準精華摘要與隨堂考題。';
        const fallbackContents = contentsArray.map(item => typeof item === 'string' ? fallbackPrompt : item);

        try {
          response = await executeGeminiWithRetry(ai, {
            model: 'gemini-3.5-flash',
            contents: fallbackContents,
            config: {
              systemInstruction,
              tools: undefined, // ensure no tools
              responseMimeType: 'application/json',
              responseSchema: responseSchemaObj
            }
          });
          console.log('[Gemini-Request] Fallback attempt succeeded perfectly!');
        } catch (secondErr: any) {
          throw secondErr; // throw if still fails
        }
      } else {
        throw firstErr;
      }
    }

    if (!response || !response.text) {
      return res.status(500).json({ error: 'AI generated an empty response.' });
    }

    const data = JSON.parse(response.text.trim());
    res.json(data);

  } catch (error: any) {
    console.error('Gemini processing error:', error);
    
    let userFriendlyMsg = error.message || 'Error occurred while processing request with Gemini API.';
    if (userFriendlyMsg.includes('429') || userFriendlyMsg.includes('quota') || userFriendlyMsg.includes('RESOURCE_EXHAUSTED')) {
      userFriendlyMsg = '【⚡ API 額度過載提示 (429)】目前的 Gemini 共享或個人 API 呼叫已達速率上限，或是 Google Search 搜尋工具額度已耗盡。您的輸入內容與已上傳之講義文檔完全有被安全保留，請稍候約 1 分鐘後再次點擊「開始生成」重試，通常即可順利通關！';
    } else if (userFriendlyMsg.includes('API_KEY_INVALID') || userFriendlyMsg.includes('API key not valid')) {
      userFriendlyMsg = '【❌ API Key 效期異常】請確認您內嵌的 API Key 是否有效。您也可以直接體驗上方 Preset 系統推薦的精選預製科系講義！';
    }
    
    res.status(500).json({ 
      error: userFriendlyMsg
    });
  }
});

// Initial Cram Database in Memory
const INITIAL_CRAM_DB = [
  {
    id: 'cram-1',
    title: '期中考不可不知的 10 大微分與積分核心公式',
    grade: '大一',
    subject: '微積分',
    content: `1. 極限與導數定義： f'(x) = lim_{h->0} (f(x+h) - f(x))/h
2. 冪法則 (Power Rule)： d/dx [x^n] = n * x^(n-1)
3. 乘積法則 (Product Rule)： (fg)' = f'g + fg'
4. 商法則 (Quotient Rule)： (f/g)' = (f'g - fg') / g^2
5. 連鎖律 (Chain Rule)： dy/dx = dy/du * du/dx
6. 三角函數導數： d/dx [sin x] = cos x, d/dx [cos x] = -sin x
7. 指數函數導數： d/dx [e^x] = e^x, d/dx [a^x] = a^x * ln a
8. 對數函數導數： d/dx [ln x] = 1/x
9. 微積分基本定理 (FTC)： ∫_{a}^{b} f(x) dx = F(b) - F(a)，其中 F'(x) = f(x)
10. 部分積分法 (Integration by Parts)： ∫ u dv = uv - ∫ v du`,
    likes_count: 142
  },
  {
    id: 'cram-2',
    title: '總體經濟學供需曲線與市場均衡考前精華',
    grade: '大二',
    subject: '經濟學',
    content: `1. 需求定律 (Law of Demand)：價格與需求量呈反比關係（需求曲線向右下方傾斜）。
2. 供給定律 (Law of Supply)：價格與供給量呈正比關係（供給曲線向右上方傾斜）。
3. 市場均衡 (Market Equilibrium)：當需求量等於供給量時（Qd = Qs），達到均衡價格 (Pe) 與均衡數量 (Qe)。
4. 超額需求與超額供給：
   - 價格低於 Pe 時，出現供不應求（Shortage），產生價格上升壓力。
   - 價格高於 Pe 時，出現供過於求（Surplus），產生價格下跌壓力。
5. 外生變數移動：
   - 消費者所得增加（正常財）=> 需求曲線右移 => Pe上升、Qe上升。
   - 生產技術進步 => 供給曲線右移 => Pe下降、Qe上升。
6. 彈性理論 (Elasticity)：Ep = |%ΔQ / %ΔP|。當 Ep > 1 稱為有彈性，降價可使總收益增加。`,
    likes_count: 98
  },
  {
    id: 'cram-3',
    title: '假設檢定（Hypothesis Testing）與 P 值判讀必考點',
    grade: '大三',
    subject: '統計學',
    content: `1. 虛無假設 (H0) 與對立假設 (H1)：
   - H0 為現狀、無本質差異的宣告（如 μ = μ0）。
   - H1 為研究者想要證明的效應或是實質變動。
2. 兩型錯誤 (Type I & Type II Errors)：
   - 型一錯誤 (α)：H0 為真卻拒絕了它（偽陽性，顯著水準）。
   - 型二錯誤 (β)：H0 為假卻接受了它（偽陰性）。檢定力 (Power) = 1 - β。
3. 統計量與拒絕域：
   - 單尾 vs 雙尾檢定：看 H1 的方向。
   - Z 檢定（大樣本或已知 σ） vs T 檢定（小樣本且未知 σ）。
4. P 值 (P-value) 的完美判讀：
   - P 值的定義：在 H0 為真的前提下，觀測到比當前樣本「更極端」結果的機率。
   - 決策法則： P-value < α => 拒絕 H0，結果具有統計學顯著性（Significant）。
   - 記法：P 小拒絕原本（H0），P 大保留原狀。`,
    likes_count: 215
  },
  {
    id: 'cram-4',
    title: '牛頓運動定律與平拋運動公式總整理',
    grade: '高一',
    subject: '物理',
    content: `1. 牛頓第一運動定律 (慣性定律)：物體若不受外力或合力為零，靜者恆靜、動者恆作等速度運動。
2. 牛頓第二運動定律 (運動定律)：F_net = m * a。加速度方向恆與合力方向相同。
3. 牛頓第三運動定律 (作用力與反作用力)：大小相等、方向相反且作用在不同物體上（不可抵消）。
4. 平拋運動 (Horizontal Projectile Motion)：
   - 水平方向：等速度運動。位移 x = V0 * t，速度 Vx = V0。
   - 鉛直方向：自由落體。位移 y = (1/2) * g * t^2，速度 Vy = g * t。
   - 合速度： V = √(Vx^2 + Vy^2)
   - 軌跡方程式： y = (g / (2 * V0^2)) * x^2 (拋物線)`,
    likes_count: 189
  },
  {
    id: 'cram-5',
    title: '基礎有機化學反應與官能基性質速查表',
    grade: '高二',
    subject: '化學',
    content: `1. 核心官能基識別：
   - 醇 (Alcohol)：-OH (羥基)
   - 醛 (Aldehyde)：-CHO (醛基)
   - 酮 (Ketone)：-CO- (羰基)
   - 羧酸 (Carboxylic Acid)：-COOH (羧基)
   - 酯 (Ester)：-COO- (酯基)
2. 重要有機反應：
   - 酯化反應：羧酸 + 醇 <-> 酯 + 水 (酸催化，可逆反應)
   - 氧化反應：一級醇 -[O]-> 醛 -[O]-> 羧酸；二級醇 -[O]-> 酮；三級醇不易氧化。
   - 皂化反應：酯 + 強鹼 -> 羧酸鹽 (肥皂) + 醇
3. 醇與酚的區別：酚 (-OH直接連於苯環) 具有弱酸性，能與強鹼反應，且遇三氯化鐵(FeCl3)呈紫色反應。`,
    likes_count: 112
  },
  {
    id: 'cram-6',
    title: '軟體工程精要：GOF 23 種設計模式分類與核心場景',
    grade: '大四',
    subject: '電腦科學',
    content: `1. 創建型模式 (Creational)：
   - 單例模式 (Singleton)：保證一個類別僅有一個實體（例：數據庫連接池）。
   - 工廠模式 (Factory Method)：將實例化延遲到子類別執行。
2. 結構型模式 (Structural)：
   - 適配器模式 (Adapter)：將不兼容的介面轉換成可兼容。
   - 裝飾者模式 (Decorator)：動態地給一個對象添加額外職責，比生成子類別更靈活。
3. 行為型模式 (Behavioral)：
   - 觀察者模式 (Observer)：一對多的依賴關係，當一個對象改變狀態，所有依賴者都會收到通知（例：自訂事件）。
   - 策略模式 (Strategy)：定義一系列算法，把它們一個個封裝起來，並且使它們可以相互替換。`,
    likes_count: 278
  },
  {
    id: 'cram-7',
    title: 'DNA 複製與中心法則（Central Dogma）複習精華',
    grade: '高三',
    subject: '生物',
    content: `1. 中心法則流程： DNA -> (轉錄 Transcription) -> RNA -> (轉譯 Translation) -> 蛋白質
2. DNA 複製機制：
   - 雙螺旋半保留複製 (Semi-conservative replication)。
   - 複製方向：只能沿著 5' 端往 3' 端方向合成。
   - 領先股 (Leading strand)：連續合成。
   - 延遲股 (Lagging strand)：不連續合成，產生岡崎片段 (Okazaki fragments)，最後由 DNA 連接酶 (Ligase) 連接。
3. 轉錄：以 DNA 為模板，在 RNA 聚合酶催化下合成 mRNA。發生在細胞核（真核生物）。
4. 轉譯：在核糖體（Ribosome）中進行，以 mRNA 為密碼子指引，tRNA 攜帶相應氨基酸進行多肽鏈合成。`,
    likes_count: 164
  }
];

// Cram Database Search & dynamic AI expansion
app.post('/api/cram/search', async (req, res) => {
  try {
    const { grade, subject, triggerAi } = req.body;

    // Filter local db items
    let matched = INITIAL_CRAM_DB.filter(item => {
      const matchGrade = !grade || item.grade === grade;
      const matchSubject = !subject || item.subject.toLowerCase().includes(subject.toLowerCase());
      return matchGrade && matchSubject;
    });

    // If trigger AI is requested, or if no matches found in local DB, call Gemini to generate a high-yield exam cram summary!
    if (triggerAi || matched.length === 0) {
      const targetGrade = grade || '大一';
      const targetSubject = subject || '重要學科';
      
      const ai = getGeminiClient();
      const response = await executeGeminiWithRetry(ai, {
        model: 'gemini-3.5-flash',
        contents: `你是一位學術考前精華提煉大師，口吻親切、直擊必考點。
        請專為「${targetGrade}」的「${targetSubject}」學門，精心提煉製作一份學術名詞、公式、以及常考思維「考前終極必看核心大綱與考法總整理懶人包」。
        內容必須格式整緻、白話好懂、直擊公式和概念細節。請以條列式輸出（列點 6-10 點）。

        你必須 strictly 回傳以合規 JSON 格式表示的內容，包含以下 property mapping:
        - title: 例如「【${targetGrade} - ${targetSubject}】期中考必考考點與終極公式大盤點」
        - grade: 填入「${targetGrade}」
        - subject: 填入「${targetSubject}」
        - content: 考前必看的 6-10 個極高頻考點、公式、或是解題秘笈（條列式、白話生動）
        - likes_count: 給一個 50 至 300 之間的初始隨機點讚數
        `,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              grade: { type: Type.STRING },
              subject: { type: Type.STRING },
              content: { type: Type.STRING },
              likes_count: { type: Type.INTEGER }
            },
            required: ['title', 'grade', 'subject', 'content', 'likes_count']
          }
        }
      });

      if (!response.text) {
        throw new Error('AI cram generation received empty text.');
      }

      const generated = JSON.parse(response.text.trim());
      const newItem = {
        id: 'ai-cram-' + Date.now(),
        ...generated
      };
      
      return res.json([newItem]);
    }

    res.json(matched);

  } catch (error: any) {
    console.error('Cram dynamic search error:', error);
    res.status(500).json({ 
      error: error.message || '查詢或 AI 生成懶人包時發生未知錯誤。' 
    });
  }
});

// Setup Vite & static assets routing
async function initServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA fallback handling
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

initServer().catch(err => {
  console.error('Server failed to start:', err);
});
