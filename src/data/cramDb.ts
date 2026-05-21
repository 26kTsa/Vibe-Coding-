export interface CramItem {
  id: string;
  title: string;
  grade: string;
  subject: string;
  content: string;
  likes_count: number;
}

export const INITIAL_CRAM_DB: CramItem[] = [
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
   - H1 為研究者想要證明的效應或實質變動。
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
3. 醇與酚的區別：酚 (-OH直接連於苯環) 具有弱酸性，能與強鹼反應，且遇三氯化鐵(FeCl3)呈紫色顯色反應。`,
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
   - 半保留複製 (Semi-conservative replication)。
   - 複製方向：只能沿著 5' 端往 3' 端方向合成。
   - 領先股 (Leading strand)：連續合成。
   - 延遲股 (Lagging strand)：不連續合成，產生岡崎片段 (Okazaki fragments)，最後由 DNA 連接酶 (Ligase) 連接。
3. 轉錄：以 DNA 為模板，在 RNA 聚合酶催化下合成 mRNA。發生在細胞核（真核生物）。
4. 轉譯：在核糖體（Ribosome）中進行，以 mRNA 為密碼子指引，tRNA 攜帶相應氨基酸進行多肽鏈合成。`,
    likes_count: 164
  }
];
