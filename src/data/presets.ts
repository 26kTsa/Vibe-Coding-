export const PRESETS = [
  {
    id: 'sample-js',
    title: 'JavaScript 異步程式設計與 Promise 核心',
    sourceType: 'youtube' as const,
    sourceValue: 'https://www.youtube.com/watch?v=demo_js_async',
    content: `在這堂 JavaScript 課程中，講師深入探討了單執行緒非同步機制的本質。JavaScript 的 Event Loop（事件循環）是理解非同步的核心。
    核心概念一：Call Stack 負責執行同步代碼。當遇到非同步操作（如 setTimeout 或 fetch）時，會將它們委託給 Web APIs (瀏覽器端) 或 Background Threads (Node.js 端)。
    核心概念二：當非同步操作完成，對應的回調函數（callback）會被推進 Callback Queue。
    核心概念三：Microtask Queue 的優先級高於 Macrotask Queue（又稱 Task Queue）。Promise 的 .then() / .catch() 回調、process.nextTick、MutationObserver 皆屬於 Microtask。而 setTimeout, setInterval, setImmediate, I/O 操作則屬於 Macrotask。
    Event Loop 的工作就是：當 Call Stack 為空時，優先檢查並清空 Microtask Queue 中的所有任務，之後才從 Macrotask Queue 中取出一個任務執行。這就是為什麼 Promise 的 resolved 回調會排在 setTimeout 之前執行的底層原因。`
  },
  {
    id: 'sample-bio',
    title: '高中生物：細胞學與光合作用機制',
    sourceType: 'ppt' as const,
    sourceValue: '投影片_細胞呼吸與光合作用.pdf',
    content: `投影片概要：細胞能量轉換 (Cellular Respiration and Photosynthesis)
    1. 光合作用分為「光反應」與「碳反應（卡爾文循環）」。
    2. 光反應在葉綠體的「類囊體薄膜」進行。葉綠素與光合色素吸收光能，將水分子裂解（光解水反應），釋放出氧氣，並產生 ATP 與 NADPH。
    3. 卡爾文循環在「葉綠體基質」進行。利用光反應產生的 ATP 能量與 NADPH 提供的還原力，將二氧化碳（CO2）固定，最終合成出三碳糖（G3P），進而轉化為葡萄糖與澱粉。
    4. 呼吸作用則發生在細胞質（糖解作用）與線粒體（克雷伯氏循環、電子傳遞鏈）。
    5. 電子傳遞鏈發生在線粒體內膜，利用質子濃度梯度驅動 ATP 合成酶，產生大量的 ATP（約 30-32 個 ATP）。這與葉綠體類囊體膜上的光合磷酸化機制類似。`
  },
  {
    id: 'sample-psy',
    title: '心理學導論：馬斯洛需求層次理論',
    sourceType: 'voice' as const,
    sourceValue: '課堂錄音_2026-05-21.mp3',
    content: `講師口述逐字稿：
    各位同學早安，今天我們要講的是亞伯拉罕·馬斯洛在 1943 年提出的「需求層次理論」（Maslow's Hierarchy of Needs）。這是一個金字塔模型，由下至上主要分為五個層次。
    最底層是「生理需求」，就像是水、食物、睡眠等，維持生存的必備要素。
    第二層是「安全需求」，包含人身安全、工作保障、健康與財產安全。
    第三層是「社會需求」或稱「愛與歸屬感」，這關乎我們是否融入群體、擁有友誼、親情與愛情。
    第四層是「自尊需求」，想著要被尊重、獲得社會認可、自信與成就感。
    而金字塔的最頂端是「自我實現需求」，這是追求個人潛能的極致發揮、道德、創造力與解決問題的能力。
    在 1970 年代，馬斯洛又在自我實現之上，追加了「超自我實現需求」，也就是超越自我、去幫助他人實現潛能。大家考試時，特別注意不要把生理與安全需求的順序搞混了，並注意自我實現是屬於成長需求，其裏四個是匱乏需求。`
  }
];
