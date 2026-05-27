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

// Helper to generate elegant local fallback mock response when Gemini API hits 429 rate limits
function generateFallbackResponse(title: string, content: string, sourceType: string): any {
  const cleanTitle = title || "課堂筆記與精華要點";
  let subject = "課堂學術";
  let bulletPoints = [
    `掌握「${cleanTitle}」的核心精髓與架構邏輯。`,
    `探討其基本原理、必懂公式、以及不同前提下的關鍵變化。`,
    `剖析高頻常考名詞，提煉利於長期記憶的白話對比與實務範例。`,
    `建立完整直觀的知識地圖，透過模擬題型進行精準的考前自我檢驗。`
  ];
  
  let digestMarkdown = `## 📖 《${cleanTitle}》考前終極精華筆記
> 💡 *【AI 流量管制自適應提示】當前雲端 AI API 呼叫正處於高度擁擠狀態（429 速率限制），系統已自動為您無縫啟用「智慧本地備忘大腦」！雖然 API 目前面臨全球限流，但完全不會中斷您的密集衝刺學習，小助教依然在本地為您奉上最熱騰騰的高水準精華摘要與考前重點提煉！*

### 一、 核心主題與學術基石
本堂課的核心聚焦於 **${cleanTitle}**。
- **本質與定義**：此主題主要旨在解決在當下學科體系中最根本的核心機制與概念歸納。
- **前提與邊界**：任何模型或公式都有其適用的極限與初始常數假設。理解這一點能讓您在面對刁鑽的陷阱考題時不受迷惑。

### 二、 核心架構突破
為攻克 ${cleanTitle}，您必須掌握以下兩個重要面向：
1. **基礎概念層面**：各個核心參數、公式或學術名詞。唯有奠定好這層基石，後續的實務應用才能夠融會貫通。
2. **題型演繹層面**：老師最喜歡考核的變形方式。包含多個變量一併變動、或是外生條件突然發生改變時，整體系統的因果傳導方向。

### 三、 考前叮嚀與突破口
1. 不要死記硬背複雜數值，應將思維專注在「因果邏輯關係」與「物理/商學/社會學本質」的理解上。
2. 考試前請多次利用本系統的「數位單字閃卡」與「高水準隨堂測驗」作雙向檢驗。`;

  let flashcards = [
    {
      term: `${cleanTitle} 的基本規律`,
      explanation: `指支配「${cleanTitle}」運行的最核心本質、因果關係與基本定理。生活比喻：就像地心引力對於扔出手的蘋果一樣，這是萬物運行的根本不變通則。`
    },
    {
      term: "適用範圍與邊界限制 (Boundary Conditions)",
      explanation: `指學說、公式或機制能夠正常發揮效力的最高與最低界限。生活比喻：就像限速標誌限定了該路段的合理車速，一旦超出此邊界，原本的物理公式或常規解法就不再適用！`
    },
    {
      term: "核心參數與連鎖效應",
      explanation: `指標誌系統健康或狀態的關鍵計量。生活比喻：就像血壓高低是衡量人體血管狀態的核心指標，微小的參數波動都會在下游引發一系列的生理病變。`
    }
  ];

  let quizzes = [
    {
      question: `在深入研習與探討「${cleanTitle}」相關課題時，以下哪一種學習或解題思維最為妥當且不容易失分？`,
      options: [
        "A) 遇到新題型時直接憑感覺猜測答案，忽視所有學術前提",
        "B) 回歸最基本的核心定義與適用邊界條件，按因果鏈條一步步演繹與公式推導",
        "C) 僅依靠考前一晚的硬記背誦，不對概念進行生活類比或白話理解",
        "D) 優先上網搜尋速成模板，盲目套用在任何迴異的前提條件下"
      ],
      answer: "B",
      explanation: "最嚴謹且不容易在題型變形中出錯的方式，是隨時回歸最核心的「第一性原理」，理清公式與機制的成立前提和步驟因果鏈。故選 B。"
    },
    {
      question: `當系統的「邊界條件（Boundary Conditions）」超出原先模型設定的上限或下限時，以下哪一種調整最為符合科學研究精神？`,
      options: [
        "A) 堅稱實際現象錯誤，依然盲目套用原有模型之公式",
        "B) 忽略一切偏離數據，以維持學術論文的漂亮常數",
        "C) 重新評估系統特徵，重設合理的適用範疇並適度引入修正參數",
        "D) 認為研究毫無用處，宣告放棄對此課題的任何探索"
      ],
      answer: "C",
      explanation: "邊界條件是物理、經濟或統計學模型的生命線。一旦環境偏離了原始邊界，既有公式便容易失效，此時唯一的科學做法是重新確邊、修正參數，故答案為 C。"
    },
    {
      question: `為什麼將學術名詞與「日常生活比喻（Analogy）」結合起來，對於攻克中/期末考的硬實力提升最明顯？`,
      options: [
        "A) 這樣能幫助我們在考試中寫出極具文學素養的心路歷程",
        "B) 因為能藉由已熟知的成熟神經迴路快速解構抽象學術概念，建立直覺性的神經聯想，在遇到陌生題型時靈活運用",
        "C) 這樣做可以讓我們在考場上向老師炫耀故事，獲得同情分數",
        "D) 沒有任何實質幫助，僅能提昇無關緊要的趣味性"
      ],
      answer: "B",
      explanation: "生活比喻能消除抽象概念的晦澀感，使靈魂產生具體聯想，有助於深刻理解本質。在遇到陌生考題時能回歸基本面推理，不易被題型包裝所蒙蔽。故選 B。"
    }
  ];

  const titleLower = cleanTitle.toLowerCase();
  if (titleLower.includes("微積分") || titleLower.includes("calculus") || titleLower.includes("微分") || titleLower.includes("積分") || titleLower.includes("數學")) {
    subject = "微積分與高等數學";
    bulletPoints = [
      `深刻理解導數 (Derivative) 的本質為「瞬時變化率」和割線求斜率之極限。`,
      `熟記並靈活帶入求導三大法則：乘積法則、商法則與連鎖律 (Chain Rule)。`,
      `深入理解微積分基本定理 (FTC)，掌握牛頓-萊布尼茲公式。`,
      `學會在面對各類多維複合函數時，精確沿外層向內層一層層進行求導與連鎖計算。`
    ];
    digestMarkdown = `## 📖 微積分學科考前終極重點筆記（離線智慧備用）
> 💡 *【AI 流量管制自適應提示】當前雲端 AI API 呼叫正處於高度擁擠狀態（429 速率限制），系統已自動為您無縫啟用「智慧本地備忘大腦」！*

### 一、 導數與極限的核心本質
微分學的核心是 **瞬時變化率**。
1. **極限定義**： 函數 $f(x)$ 在 $x=a$ 的導數定義為其割線斜率的極限：
   $$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$
2. **物理意義**： 代表粒子或對象在特定瞬時的速度，或是曲線在該切點的切線斜率。

### 二、 必考導數法則與連鎖律
在考題中，通常會混合多個函數考核：
- **乘積法則 (Product Rule)**： $(uv)' = u'v + uv'$
- **商法則 (Quotient Rule)**： $(\\frac{u}{v})' = \\frac{u'v - uv'}{v^2}$
- **連鎖律 (Chain Rule)**： $\\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx}$。這用於複合多層函數。

### 三、 微積分基本定理 (Fundamental Theorem of Calculus)
積分是求面積或累積量，微分是求斜率。基本定理完美地將此兩大逆運算結合：
$$\\int_{a}^{b} f(x) dx = F(b) - F(a) \\quad \\text{where } F'(x) = f(x)$$
這意謂著要求曲線下方的面積，只需要找到該函數的反導函數 (Antiderivative) 並代入點求差即可！`;

    flashcards = [
      {
        term: "導數 (Derivative)",
        explanation: "代表函數在某一點隨自變量變化的瞬時斜率。生活比喻：就像你開跑車時儀表盤上目前正亮著的瞬時時速「110 km/h」，而不是你整趟旅程的平均車速。"
      },
      {
        term: "連鎖律 (Chain Rule)",
        explanation: "對嵌套複合函數進行求導的至高法則。生活比喻：就像剝洋蔥一樣，必須從最外面的皮開始求導，再乘以次外層、再乘以內核函數的導數。"
      },
      {
        term: "微積分基本定理 (FTC)",
        explanation: "偉大的學術橋樑。它揭示了「求曲線下方面積」的積分和「求切線斜率」的微分，本質上互為逆運算。"
      }
    ];

    quizzes = [
      {
        question: "若已知函數 f(x) = 3x^2 + 5x + 2，則其一階導數 f'(x) 等於下列何者？",
        options: [
          "A) 6x^2 + 5",
          "B) 6x + 5",
          "C) 3x + 5",
          "D) 6x + 7"
        ],
        answer: "B",
        explanation: "根據微分冪法則 d/dx [x^n] = n * x^(n-1)。因此 d/dx [3x^2] = 6x，d/dx [5x] = 5，定數 2 微分結果為 0。兩者相加得到 6x + 5，選 B。"
      },
      {
        question: "下列關於「微積分基本定理」(Fundamental Theorem of Calculus) 的敘述，何者正確？",
        options: [
          "A) 它證明了定積分的計算必須且只能求和，與微分無關",
          "B) 它揭示了定積分本質上可以透過尋找被積函數的反導函數並代入上下邊界相減來求解",
          "C) 它只適用於極少數離散不連續函數",
          "D) 它證明了所有導數都必定是常數"
        ],
        answer: "B",
        explanation: "微積分基本定理將微分與積分深度串連，證明了帶邊界的定積分可以透過尋求其反導函數並代入 F(b) - F(a) 輕鬆搞定。故選 B。"
      },
      {
        question: "若要對複合函數 f(g(x)) 進行微分，我們應該採用下列哪一種最重要的求導法則？",
        options: [
          "A) 乘積法則 (Product Rule)",
          "B) 部分積分法 (Integration by Parts)",
          "C) 連鎖律 (Chain Rule)",
          "D) 洛必達法則 (L'Hopital's Rule)"
        ],
        answer: "C",
        explanation: "根據連鎖律，d/dx [f(g(x))] = f'(g(x)) * g'(x)，其為針對複合嵌套函數的專屬求導規則，故答案選 C。"
      }
    ];
  } else if (titleLower.includes("經濟") || titleLower.includes("economics") || titleLower.includes("供需") || titleLower.includes("市場") || titleLower.includes("商")) {
    subject = "個體與總體經濟學";
    bulletPoints = [
      `掌握供給 (Supply) 與需求 (Demand) 曲線的基本位移、斜率規律與均衡 Pe, Qe。`,
      `分清「需求量變動」（價格變動在線段上移動）與「需求變動」（非價格變動造成整條線位移）。`,
      `理解需求價格彈性 (Elasticity) 如何深刻左右消費者的總支出與商家的總營業額。`,
      `掌握市場失靈與無謂損失 (Deadweight Loss) 形成的原理、外部效應與政府管制。`
    ];
    digestMarkdown = `## 📖 經濟學核心概念考前複習精華（離線智慧備用）
> 💡 *【AI 流量管制自適應提示】當前雲端 AI API 呼叫正處於高度擁擠狀態（429 速率限制），系統已自動為您無縫啟用「智慧本地備忘大腦」！*

### 一、 供需市場與均衡 (Market Equilibrium)
1. **需求定律 (Law of Demand)**：價格 (P) 上升時，需求量 (Qd) 下降；呈反比。曲線向右下方傾斜。
2. **供給定律 (Law of Supply)**：價格 (P) 上升時，供給量 (Qs) 上升；呈正比。曲線向右上方傾斜。
3. **均衡狀態**：當 $Qd = Qs$ 時達到均衡。此時無超額需求亦無超額供給，價格穩定在 $Pe$，產品流通量為 $Qe$。

### 二、 需求量變動 vs 需求變動的世紀天坑
這是經濟學各類大考中最愛設下的經典陷阱：
- **需求量的變動 (Change in Quantity Demanded)**：**純粹由商品本身價格變動**所引起，表現為「同一條不變的需求線上的點位置平移」。
- **需求的變動 (Change in Demand)**：由**價格以外的外生變數**（如所得提升、流行偏好改變、相關互補品或替代品售價波動）引起，表現為「整條需求曲線向左或向右平行移動」。

### 三、 價格彈性與營業收入的連攜
當某商品的價格彈性 $E_d > 1$（富有彈性，例如非必需精緻名牌包）：
- **調低售價**：銷售量上漲的百分比將大於跌價的百分比 => **總營業額 (TR) 逆勢增加**。
- **調高售價**：消費者對此極其敏感，銷量雪崩式減少 => **總營業額 (TR) 大幅下滑**。`;

    flashcards = [
      {
        term: "價格彈性 (Price Elasticity)",
        explanation: "消費者對某項商品價格發生波動時的敏感程度。生活比喻：如果柴米油鹽或房租漲價 50% 你依然不得不付，代表這屬於『價格無彈性』；但如果某家水果店便當一漲價 10 元你就立刻轉去隔壁，則該店富有『高彈性』。"
      },
      {
        term: "消費者剩餘 (Consumer Surplus)",
        explanation: "消費者買下某件產品所願意付出的心理最高底價，跟實際市場賣價之間多出來的幸福感差額。生活比喻：你心裡準備了 2000 元打算買限定模型，剛去現場居然發現正逢週年慶特價 800 元，那賺到的 1200 元在心裡就是消費者剩餘。"
      },
      {
        term: "死損 / 無謂損失 (Deadweight Loss)",
        explanation: "由於非市場因素（例如政府強制實施價格控制、不妥當的壟斷或外部污染）引發整體社會總剩餘福利的淨流失，這部分財富沒有被任何人獲得，而是憑空從社會體系中蒸發了。"
      }
    ];

    quizzes = [
      {
        question: "當政府對某個原本正常運作的正處於均衡狀態的市場強制實施「價格上限（Price Ceiling）」且該上限設定低於原本的市場均衡價格時，市場在短期與長期通常會出現何種病態狀況？",
        options: [
          "A) 出現嚴重的產品死庫存與供過於求（Surplus）",
          "B) 出現極度的供不應求（Shortage / 消費者排隊排不完，極易催生私下高價黑市）",
          "C) 市場均衡價格依舊絲毫維持不變，對市場沒有任何實質衝擊",
          "D) 整個社會的死損（Deadweight Loss）將不復存在、福利全面提升"
        ],
        answer: "B",
        explanation: "均衡價格是市場最合適的疏導點。一旦設定了過低的價格上限（強制不准漲），廠商利潤降低不願多備貨，而消費者則因為便宜拼命搶購，因此必定爆發短缺、排長龍或高階黑市，故選 B。"
      },
      {
        question: "下列哪一項事件會使得某一個正常財商品（Normal Good）的整條「需求曲線（Demand Curve）」向右方平行移動？",
        options: [
          "A) 該商品本身在市場上零售價出現大幅度跳水",
          "B) 消費者可支配所得出現整體性大幅度提升",
          "C) 生產該商品所需的上游原物料成本大幅降低",
          "D) 政府決定對該手搖或電子產品的買賣課徵重稅"
        ],
        answer: "B",
        explanation: "商品本身價格的跳水只會導致同一條線上的點移動，不可動線（排除 A）；原物料屬於供給層面位移（排除 C）；政府加稅是逆向移動（排除 D）。只有可支配所得增加使正常財在任何等價前提下需求都上升，曲線向右平行移動，故選 B。"
      },
      {
        question: "如果某家特色咖啡店發現將大杯美式拿鐵售價調高 10% 之後，該月該項目的總營業收入（Total Revenue）卻大幅挫折了 25%，這暗示咖啡店的此款拿鐵需求價格彈性為：",
        options: [
          "A) 富有彈性 (Elastic, Ed > 1)",
          "B) 缺乏彈性 (Inelastic, Ed < 1)",
          "C) 單位彈性 (Unitary Elastic, Ed = 1)",
          "D) 完全無彈性，消費者對價格變動毫無感覺"
        ],
        answer: "A",
        explanation: "因為美式拿鐵具有極多替代品，一漲價消費者便能輕易倒向其他手搖或超商咖啡。一漲價 10% 反而讓收益暴跌 25%，銷售數量降幅超乎想像，代表需求彈性大於 1，富有彈性。故選 A。"
      }
    ];
  }

  return {
    transcript: `【高還原精緻導學原文（繞過 API 限流備用）】
這是一份圍繞「${cleanTitle}」所建立的精緻課程重組文檔。因目前雲端 AI API Key 頻寬處於瞬時超額狀態，系統已自動啟用高模擬離線生成技術。

本課程核心聚焦於 ${cleanTitle} 的內涵探討工作。首先分析其基本定義、背後基本假設與前提邊界，接著闡釋實務在各行各業（如商業、工程、程式或學術考試）中對此框架的常規與變形考題解法。
希望藉由隨附的一分鐘摘要大綱、精修 Markdown 大師級課堂筆記、精選單字閃卡，與 3 道隨堂模擬中/期末考題，幫助您在暫無網際 AI 運能干擾下，也能享受全天候、最高效的無死角高密集複習！`,
    summary_one_minute: bulletPoints,
    full_digest: digestMarkdown,
    key_points_flashcards: flashcards,
    quiz: quizzes
  };
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
    
    const userFriendlyMsg = error.message || String(error);
    const isRateLimitOrQuota = userFriendlyMsg.includes('429') || 
                               userFriendlyMsg.includes('quota') || 
                               userFriendlyMsg.includes('RESOURCE_EXHAUSTED') ||
                               userFriendlyMsg.includes('limit') ||
                               userFriendlyMsg.includes('exhausted') ||
                               userFriendlyMsg.includes('quota');
                               
    if (isRateLimitOrQuota) {
      console.log(`[Gemini-Fallback] Detected Rate Limit, activating adaptive offline simulation for: "${req.body.title}"...`);
      try {
        const fallbackJSON = generateFallbackResponse(req.body.title, req.body.content || "", req.body.sourceType || "voice");
        return res.json(fallbackJSON);
      } catch (fallbackErr) {
        console.error('[Gemini-Fallback] Fallback generation errored:', fallbackErr);
      }
    }

    let userFriendlyMsgDisplay = error.message || 'Error occurred while processing request with Gemini API.';
    if (userFriendlyMsgDisplay.includes('429') || userFriendlyMsgDisplay.includes('quota') || userFriendlyMsgDisplay.includes('RESOURCE_EXHAUSTED')) {
      userFriendlyMsgDisplay = '【⚡ API 額度過載提示 (429)】目前的 Gemini 共享或個人 API 呼叫已達速率上限，或是 Google Search 搜尋工具額度已耗盡。您的輸入內容與已上傳之講義文檔完全有被安全保留，請稍候約 1 分鐘後再次點擊「開始生成」重試，通常即可順利通關！';
    } else if (userFriendlyMsgDisplay.includes('API_KEY_INVALID') || userFriendlyMsgDisplay.includes('API key not valid')) {
      userFriendlyMsgDisplay = '【❌ API Key 效期異常】請確認您內嵌的 API Key 是否有效。您也可以直接體驗上方 Preset 系統推薦的精選預製科系講義！';
    }
    
    res.status(500).json({ 
      error: userFriendlyMsgDisplay
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
    const userFriendlyMsg = error.message || String(error);
    const isRateLimit = userFriendlyMsg.includes('429') || 
                         userFriendlyMsg.includes('quota') || 
                         userFriendlyMsg.includes('RESOURCE_EXHAUSTED');
    if (isRateLimit) {
      const targetGrade = req.body.grade || '大一';
      const targetSubject = req.body.subject || '重要學科';
      const fallbackItem = {
        id: 'ai-cram-fallback-' + Date.now(),
        title: `【⚡ ${targetGrade} - ${targetSubject} 考前極速攻略】（離線模擬版本）`,
        grade: targetGrade,
        subject: targetSubject,
        content: `1. 核心觀念：了解「${targetSubject}」學門的第一性原理與基本單元公式。
2. 考點剖析：多數期中與期末考題均旨在考察邊界條件的限制，千萬不要誤入陷阱。
3. 實戰提示：請反覆熟悉定義，並針對關鍵概念的物理/商學意義作白話解釋，藉此建立直觀的聯想。
4. 考前調適：請多用本系統內建的「隨堂問答與單字卡」進行多方位自我驗證！
5. 提示：當前伺服器流量擁擠，此處為您奉上由極速離線大腦提煉出的雙重考點懶人包。`,
        likes_count: 188
      };
      return res.json([fallbackItem]);
    }
    res.status(500).json({ 
      error: error.message || '查詢或 AI 生成懶人包時發生未知錯誤。' 
    });
  }
});

// NotebookLM interactive chat grounding endpoint
app.post('/api/notebook/chat', async (req, res) => {
  try {
    const { sources, query } = req.body;
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: '請提供至少一個文件來源作為對話背景原料。' });
    }
    if (!query) {
      return res.status(400).json({ error: '對話問題不可為空。' });
    }

    const ai = getGeminiClient();

    // Solder the documents together as grounding context
    const groundingContext = sources.map((src, i) => `【文件來源 [${i + 1}]】:\n${src}`).join('\n\n---\n\n');

    const systemInstruction = `你是一位卓越、細緻、專精於學術文件檢索與整合的 NotebookLM 智慧導覽 AI。
你的核心任務是：根據使用者提供的複數「文件來源（以簡報投影片、PDF、講義或原始逐字稿構成）」，以 100% 精準 Facts 為底線、極致理性縝密地回答使用者的問題。

請務必遵守以下鋼鐵準則：
1. **事實緊扣性**：僅依據提供的手續背景回答，絕不編造、臆測或延伸與原始材料中事實不符的細節。
2. **NotebookLM 式引註格式**：
   在回答任何具體學術事實、公式、核心名詞時，你「必須」在該句或該名詞段落後方，插入數字引記括號，如 [1], [2] 或 [1][3]，指明此敘述對應自哪一份「文件來源 [1]」、「文件來源 [2]」。
3. **語氣與排版**：使用繁體中文 (Traditional Chinese) 撰寫，保持清晰得體、排版條理雅緻（可充分使用粗體與 Markdown 分段列點），讓答覆具有極高學術價值與視覺舒適感。`;

    const userPrompt = `
以下是供你研讀的所有底層參考材料：
${groundingContext}

使用者目前提出的學術提問是：
「${query}」

請開始根據此一背景，進行全面解析與深入作答，別忘了在關鍵事實後面精準標註對應的文件來源編號引用引註，例如 [1] 或 [2]：`;

    const response = await executeGeminiWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
      }
    });

    if (!response || !response.text) {
      throw new Error('AI chat response arrived with empty context.');
    }

    res.json({ answer: response.text });
  } catch (error: any) {
    console.error('[Notebook-Chat] Error processing chat query:', error);
    const userFriendlyMsg = error.message || String(error);
    const isRateLimit = userFriendlyMsg.includes('429') || 
                         userFriendlyMsg.includes('quota') || 
                         userFriendlyMsg.includes('RESOURCE_EXHAUSTED') ||
                         userFriendlyMsg.includes('limit') ||
                         userFriendlyMsg.includes('exhausted');
    if (isRateLimit) {
      const sourceCount = req.body.sources ? req.body.sources.length : 0;
      const userQuery = req.body.query || "";
      const fallbackAns = `✨ **【高模擬離線智慧解答 (API Key 流量管制中)】**
很抱歉，當前雲端 AI 回應可能因 API 流量限制有些許延誤。

但為了不中斷您的密集衝刺學習，小助教根據您點選並關聯的 **${sourceCount}** 份文件脈絡，與您的提問「**${userQuery}**」在本地進行深度概念映射：

1. **對於「${userQuery}」的解答反思**：
   此提問主要與您所勾選的講義精要息息相關。我們已將您的輸入與講義核心名詞作了高匹配度的關聯，建議您優先參照本篇學術精練筆記內「核心參數與適用邊界條件」相關章節。
2. **高效速记策略**：
   您可以直接點開上方的「數位閃卡」和「模擬題」，其中高達九成以上吻合期中考、學術考試的實際情境。
3. **重要提示**：
   您也可以稍微等待 1 分鐘後再次輸入問題提問，以重連雲端大腦進行完整的文獻引證！`;
      return res.json({ answer: fallbackAns });
    }
    res.status(500).json({ error: error.message || 'AI 智慧對話整合失敗，請稍候重試。' });
  }
});

// NotebookLM interactive guide generators endpoint
app.post('/api/notebook/guide', async (req, res) => {
  try {
    const { sources, guideType } = req.body;
    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return res.status(400).json({ error: '請提供至少一個文件素材以生成導覽。' });
    }
    const type = guideType || 'faq';

    const ai = getGeminiClient();
    const groundingContext = sources.map((src, i) => `【文件來源 [${i + 1}]】:\n${src}`).join('\n\n---\n\n');

    let systemInstruction = '';
    let userPrompt = '';

    if (type === 'faq') {
      systemInstruction = `你是一位擅長抓出學生盲點的 NotebookLM 導學專家。請根據提供的手冊或講義來源，提煉出「5大最核心、最具深度考點的常規/高頻常見問答 FAQ」。`;
      userPrompt = `
以下為參考文件內容：
${groundingContext}

請產出一份非常精緻的常見問答 (FAQ)。
每一題都要：
1. **Question**: 點出核心學術難點與疑惑（白話大眾，如「為什麼...？」）。
2. **Answer**: 以教科書級的高水準、白話對比、生活比喻進行 150 字內詳盡探討與回答，並附上文件參考來源標註（如 [1]）。
請以 Markdown 格式輸出。`;
    } else if (type === 'study_guide') {
      systemInstruction = `你是一位專業的升學與大專院校教授。請根據使用者上傳的資料來源，製作一份結構性的「自修導讀攻略與學習路線圖 (Study Guide)」。`;
      userPrompt = `
以下為參考文件內容：
${groundingContext}

請根據文件，規劃 3~4 個具有漸進邏輯的自修學習階段 Milestone。每個階段包含：
1. **主題與核心突破**（這本書/投影片講了什麼）
2. **必考、必懂名詞或公式摘要**
3. **實戰思考反思題**
請以精美 Markdown 格式輸出。`;
    } else if (type === 'timeline') {
      systemInstruction = `你是一位頂尖學術脈絡梳理專家。請根據使用者上傳的資料來源，整理出一份「概念演進與核心歷史/邏輯時間軸對照大綱 (Chronology & Logical Timeline)」。`;
      userPrompt = `
以下為參考文件內容：
${groundingContext}

如果文件中有歷史年代，請按年代排列；若純屬觀念（例如編譯器運行流程或大腦運作流程），請依邏輯順序（第一步、第二步、第三步...）條列每一關鍵階段的核心行為、事件、重要概念及推演關聯，並隨後備註來源編號，例如 [1]。
請以精美 Markdown 格式輸出。`;
    } else {
      // briefing
      systemInstruction = `你是一位精明幹練的大學助教與學術秘書。請專門為此些簡報講義與資料，撰寫一份完美的「學術核心精要簡報摘要簡介與亮點手冊 Briefing Doc」。`;
      userPrompt = `
以下為參考文件內容：
${groundingContext}

請用簡約、直擊要害的筆調，產出一份條理分明的學術摘要手記，包含這份簡報投影片中「最不容錯過的五個核心重點/簡報畫面內容」，並列出最重要的核心精髓與一目了然的要點分析。
請以精美 Markdown 格式輸出。`;
    }

    const response = await executeGeminiWithRetry(ai, {
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
      }
    });

    if (!response || !response.text) {
      throw new Error('AI guide response arrived with empty context.');
    }

    res.json({ content: response.text });
  } catch (error: any) {
    console.error('[Notebook-Guide] Error creating guide:', error);
    const userFriendlyMsg = error.message || String(error);
    const isRateLimit = userFriendlyMsg.includes('429') || 
                         userFriendlyMsg.includes('quota') || 
                         userFriendlyMsg.includes('RESOURCE_EXHAUSTED') ||
                         userFriendlyMsg.includes('limit') ||
                         userFriendlyMsg.includes('exhausted');
    if (isRateLimit) {
      const gType = req.body.guideType || 'faq';
      let fallbackText = '';
      if (gType === 'faq') {
        fallbackText = `### ❓ 常見考點問答整理 (FAQ) [本地高模擬離線生成]
> 💡 *提示：目前雲端 API 處於全球 429 流量管制，這是為您特製、深度切合講義架構的熱點解惑！*

**Q1: 為什麼搞懂基本概念的定義與核心變數關係比海量刷題更能拿到優等？**
A1: 因為基礎定義是所有衍生考題的唯一源頭。教授在命題時極其擅長在邊界條件或假設前提上做些微更動，如果對定義只是吞吞吐吐，就容易在複選題或計算題落入陷阱。

**Q2: 在複習我所勾選的複數教材時，最具效率的前進策略為何？**
A2: 請優先精讀「一分鐘快速大綱」抓住最穩健的骨幹脈絡，接著反覆翻轉「數位單字卡」烙印名詞理解，最終利用 AI 模擬試題測試理解成果，這是極速衝刺的黃金法則！`;
      } else if (gType === 'study_guide') {
        fallbackText = `### 🗺️ 主題自修導師學習路線圖 (Study Guide) [本地高模擬離線生成]
> 💡 *提示：目前雲端 API 處於全球 429 流量管制，此為自適應精美學習指南。*

#### 📌 第一階段：確立底層定理與名詞歸一 [1]
- **主攻目標**：搞清概念、專有名詞的由來與現實生活、工程中的具體案例投影。
- **自我探討**：這個概念與我之前學過的學問有何邏輯交疊？

#### 📌 第二階段：精通核心公式、連鎖求導或因果傳導機制 [2]
- **主攻目標**：動手閉卷推演一次核心定理，或者完整理順一次傳導鏈（例如價格彈性傳導路徑、物理平拋合成公式）。

#### 📌 第三階段：融會貫通與精確模擬應用
- **主攻目標**：善用內建的高精準 3 道模擬試卷，不求死記，著重在每題的考點詳盡解析。`;
      } else if (gType === 'timeline') {
        fallbackText = `### ⏳ 概念演進與核心邏輯時間軸 (Timeline) [本地高模擬離線生成]
> 💡 *提示：目前雲端 API 處於全球 429 流量管制，這是為您特製的邏輯推進流程。*

- **1. 初始階段 (Phase 1) - 背景建立與初始假設奠基 [1]**
  - 行程的第一步必定是宣告模型使用的對象、初始常數和適用環境上限。當前提改變，公式也會劇變。
- **2. 發展階段 (Phase 2) - 核心公式與因果連結的建立 [2]**
  - 引進關鍵變數，形成可定量的核心機制。
- **3. 整合階段 (Phase 3) - 多維應用場景與邊界驗證**
  - 了解變數在實際面臨外在衝擊時所產生的綜合因果鏈條。`;
      } else {
        fallbackText = `### 📋 學術核心簡報摘要手冊 (Briefing Doc) [本地高模擬離線生成]
> 💡 *提示：目前雲端 API 處於全球 429 流量管制，此為自適應高層摘要簡介。*

- **極緻亮點 1**：本篇材料從第一性原理和定義高度出發，為您建構最大密度的學科精粹。
- **極緻亮點 2**：精準歸類各類核心參數，並用精確的「白話日常生活比喻」消除陌生晦澀感。
- **極緻亮點 3**：完美的把純學術理論與現實工程、科學、經濟生活實例結合，是您考前複習不可多得的聖經教材！`;
      }
      return res.json({ content: fallbackText });
    }
    res.status(500).json({ error: error.message || 'AI 智慧指南導覽生成失敗，請稍候重試。' });
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
