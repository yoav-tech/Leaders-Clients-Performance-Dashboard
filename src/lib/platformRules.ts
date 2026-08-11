// ============================================================================================
// חוקי פלטפורמה — what each ad platform needs in order to work
// ============================================================================================
//
// The media-plan rules (mediaPlanRules.ts) decide HOW MUCH each funnel stage gets. This file
// says what each PLATFORM needs for that money to actually perform: the budget below which a
// line cannot run, how much conversion volume the algorithm needs to leave its learning phase,
// how far it may be scaled in one step, what its reported numbers are worth, and the Israeli
// market benchmarks its results should be read against.
//
// Source: the agency's own playbooks — the `marketing-analyst` and `ecomm-analyst` skills
// (Israeli benchmarks, Meta advanced structure, attribution, spend & budget allocation).
// Figures quoted from those playbooks are marked [PLAYBOOK]; figures derived from them (a daily
// budget turned into a monthly floor, USD turned into ILS) are marked [DERIVED] and are the ones
// worth arguing with. Nothing here is invented from scratch.
//
// USD figures from the playbooks are converted at the agency's fixed USD→ILS rate (fx.ts, ×3).

// Every platform Leaders buys media on.
export type Platform = "meta" | "google" | "tiktok" | "linkedin" | "reddit";

// The subset the dashboard ingests today — the only channels a plan can be built from, because
// daily_metrics has no rows for the others. Adding a platform here is the enablement switch:
// connect it in Windsor, add it to CHANNEL_FIELDS + DIMENSION_FIELDS and the daily_metrics
// channel CHECK constraint, then list it here and it becomes plannable.
export const INGESTED_PLATFORMS = ["meta", "google", "tiktok"] as const;
export type AdChannel = (typeof INGESTED_PLATFORMS)[number];

export const isIngested = (p: Platform): p is AdChannel => (INGESTED_PLATFORMS as readonly string[]).includes(p);

export interface Benchmark {
  label: string;
  good: string; // the range the playbooks call good, in the platform's own reporting
  note?: string;
}

export interface PlatformRules {
  id: Platform;
  label: string;
  connector: string | null; // Windsor connector id; null = not connected yet
  ingested: boolean;

  // --- what it costs to be there ---
  // The floor for a line on this platform is NOT a fixed number — it is derived from the
  // learning-phase requirement: enough budget to buy `learning.conversions` conversions at the
  // cell's own cost per conversion (see MIN_BUDGET_RULE). These two numbers only apply when
  // that cannot be computed.
  //
  // noDataFloor — a client with no cost-per-conversion history yet. Per the agency rule: ₪30k
  // buys two platforms, so ₪15k is one platform's share.
  noDataFloor: number; // ILS/month
  // viewKpiFloor — a client planned on a view/impression KPI (CPV, CPM). "50 conversions" is not
  // a meaningful bar there: 50 video views costs a few shekels. This is the operational floor
  // instead — roughly what the platform needs per day to deliver at all.
  viewKpiFloor: number; // ILS/month
  // The budget at which the platform's automation actually has room to work.
  healthyLineBudget: number; // ILS/month

  // --- what the algorithm needs ---
  learning: {
    conversions: number | null; // conversions needed to leave the learning phase
    perWhat: string; // …per what, over what window
    maxBudgetStepPct: number; // a bigger single change restarts learning
    note: string;
  };

  // --- how far it may be pushed in one month ---
  scaling: { maxStepPct: number; holdDays: number; note: string };

  // --- how much its own reporting can be trusted ---
  attribution: { window: string; caution: string };

  // --- creative ---
  creative: { minAssets: number; refreshDays: number; note: string };

  // --- fatigue / saturation signals ---
  saturation: string[];

  // --- Israeli-market benchmarks, for reading results ---
  benchmarks: Benchmark[];

  // --- audience sizing ---
  audience: string;

  strengths: string[];
  cautions: string[];
}

// [PLAYBOOK] Meta: ecomm-analyst/meta-advanced.md + benchmarks.md, marketing-analyst/meta-ads.md
const META: PlatformRules = {
  id: "meta",
  label: "Meta",
  connector: "facebook",
  ingested: true,
  noDataFloor: 15000, // [AGENCY] ₪30k מספיק לשתי פלטפורמות → ₪15k לפלטפורמה
  viewKpiFloor: 1500, // [DERIVED] ~₪50/day — הספר: "manual campaigns when budget <$50/day"
  healthyLineBudget: 9000, // [DERIVED] ~₪300/day ≈ $100/day, the Advantage+ threshold [PLAYBOOK]
  learning: {
    conversions: 50,
    perWhat: "per ad set, per week",
    maxBudgetStepPct: 20,
    note: "כל אד-סט חדש צריך ~50 המרות כדי לצאת מ-learning. שינוי תקציב מעל 20% מאפס את המונה — להעלות בהדרגה. אד-סט שאחרי 7 ימים עם פחות מ-50 המרות: הקהל קטן מדי, התקציב נמוך מדי, או שהקריאייטיב לא מייצר קליקים — לתקן את השורש לפני שמוסיפים תקציב.",
  },
  scaling: { maxStepPct: 20, holdDays: 3, note: "CPA מתחת ל-1.5× AOV → להגדיל 20–30%. מעל 20% בבת אחת מאפס learning." },
  attribution: {
    window: "7-day click + 1-day view (ברירת מחדל); 7-day click בלבד לדיווח כן",
    caution: "view-through מנפח. Meta מדווחת גם המרות מודלות — לכן המספר שלה גבוה מ-GA4. לעגן החלטות ב-GA4 ובהכנסות החנות.",
  },
  creative: { minAssets: 5, refreshDays: 30, note: "5+ נכסים לקמפיין. ריענון כשה-CTR יורד 30%+ או שהתדירות עוברת 7." },
  saturation: ["תדירות מעל 7 — מיצוי קהל", "CTR יורד 30%+ עם אותו קריאייטיב", "CPM מזנק 50%+ בלי הסבר עונתי", "חפיפת קהלים מעל 30% בין אד-סטים"],
  benchmarks: [
    { label: "CPM", good: "₪20–60", note: "ביוטי בקצה הגבוה" },
    { label: "CTR (link)", good: "0.8–2.5%", note: "קריאייטיב טוב = 2%+" },
    { label: "CPC", good: "₪1.2–5" },
    { label: "CPA (קהל קר)", good: "₪70–200", note: "תלוי מאוד במחיר המוצר" },
    { label: "ROAS (מדווח)", good: "1.8–5x", note: "מנופח — לא לקבל כפשוטו" },
    { label: "תדירות", good: "3–6 (prospecting)", note: "מעל 8 — שחיקת קריאייטיב" },
  ],
  audience: "פרוספקטינג רחב או LAL 1% מרוכשים. מאגר LAL מתחת ל-50K — לעבור ל-interest stacks.",
  strengths: ["מנוע הגיוס המרכזי באיקומרס", "רימרקטינג מדויק", "קטלוג/DPA"],
  cautions: ["prospecting ורימרקטינג חייבים קמפיינים נפרדים", "תמיד להחריג רוכשים מפרוספקטינג — מוריד CPA ב-15–25%", "ASC לא מתאים לחשבון עם פחות מ-50 רכישות בחודש"],
};

// [PLAYBOOK] Google: ecomm-analyst/benchmarks.md, marketing-analyst/google-ads.md + structure-setup.md
const GOOGLE: PlatformRules = {
  id: "google",
  label: "Google",
  connector: "google_ads",
  ingested: true,
  noDataFloor: 15000, // [AGENCY]
  viewKpiFloor: 1500, // [DERIVED] מתחת ל-~$15/יום הקמפיין נגמר בצהריים [ספר]
  healthyLineBudget: 3600, // [DERIVED] ~₪120/day ≈ $40/day, the playbook's healthy campaign budget
  learning: {
    conversions: 30,
    perWhat: "per campaign, per 30 days (PMax); 15+/month for automated bidding on Search",
    maxBudgetStepPct: 20,
    note: "קמפיין עם פחות מ-15 המרות בחודש — הבידינג האוטומטי לא לומד; לאחד קמפיינים או לעבור ל-CPC ידני. PMax דורש 30+ המרות ב-30 יום — לא להשיק על חשבון חדש.",
  },
  scaling: { maxStepPct: 20, holdDays: 7, note: "target CPA חדש: ~10% מעל ה-CPA הנוכחי, כדי לתת לאלגוריתם מרחב." },
  attribution: {
    window: "Data-driven (DDA) ברוב החשבונות; Shopping לרוב last-click",
    caution: "last-click מנפח את תחתית המשפך ומחסיר מודעות מותג. PMax מקניבל חיפוש מותגי — לבדוק אם נתח החשיפות המותגי ירד אחרי השקה, ולהחריג מילות מותג ברמת החשבון.",
  },
  creative: { minAssets: 5, refreshDays: 60, note: "RSA: 5+ כותרות רלוונטיות. נכסי PMax — לרענן לפי דוח ביצועי נכסים." },
  saturation: ["CPC עולה עם אותו טרגוט — רוויית מכרז", "נתח חשיפות אבוד מדירוג עולה", "search terms נודדים לכוונה לא רלוונטית"],
  benchmarks: [
    { label: "CTR חיפוש מותגי", good: "8–20%", note: "נמוך מזה — מתחרים על השם שלך" },
    { label: "CTR חיפוש גנרי", good: "2–6%" },
    { label: "CTR Shopping", good: "0.8–2.5%" },
    { label: "CVR Shopping", good: "1.5–5%" },
    { label: "CPC מותגי", good: "₪0.5–2" },
    { label: "CPC גנרי", good: "₪2–8" },
    { label: "ROAS (מדווח)", good: "2.5–8x", note: "PMax מדווח 3.5–10x ומנפח" },
    { label: "CTR דיספליי", good: "0.08–0.35%", note: "לא להשוות לבנצ'מרק חיפוש" },
  ],
  audience: "ביקוש קיים — מילות מפתח וכוונה, לא קהלים. הקהלים משמשים כשכבת בידינג.",
  strengths: ["לוכד ביקוש קיים", "חיפוש מותגי זול ומגן על התנועה", "Shopping/PMax לכוונת קנייה"],
  cautions: ["לא לפצל לקמפיינים קטנים — פיצול תקציב הורג את הלמידה", "PMax בלי החרגת מותג מקניבל", "כפילות המרות אם מייבאים גם יעדי GA4 וגם תגית Google"],
};

// [PLAYBOOK] TikTok: ecomm-analyst/benchmarks.md + attribution.md
const TIKTOK: PlatformRules = {
  id: "tiktok",
  label: "TikTok",
  connector: "tiktok",
  ingested: true,
  noDataFloor: 15000, // [AGENCY]
  viewKpiFloor: 1800, // [DERIVED] ~₪60/day — המינימום של TikTok לאד-גרופ הוא ~$20/יום
  healthyLineBudget: 6000, // [DERIVED] ~₪200/day
  learning: {
    conversions: 50,
    perWhat: "per ad group, per week",
    maxBudgetStepPct: 20,
    note: "דומה למטא. TikTok צריך נפח קריאייטיב גבוה יותר — הפיד שוחק מהר.",
  },
  scaling: { maxStepPct: 20, holdDays: 3, note: "לשמור על זרם קריאייטיבים חדשים בזמן סקייל, אחרת ה-CPA מטפס." },
  attribution: {
    window: "7-day click + 1-day view",
    caution: "ה-view-through של TikTok אגרסיבי יותר משל מטא — סופר צפייה של 6 שניות כנגיעה. לעבוד ב-click-only. הרבה מההמרות מופיעות כ-assisted במטא/גוגל.",
  },
  creative: { minAssets: 6, refreshDays: 21, note: "UGC, טוטוריאלים וטרנדים. קריאייטיב מלוטש בסגנון פרסומת מתפקד פחות טוב." },
  saturation: ["VTR יורד — ההוק לא עובד", "CPM עולה עם אותו קהל", "אותו קריאייטיב מעל 3 שבועות"],
  benchmarks: [
    { label: "CPM", good: "₪12–40", note: "בדרך כלל זול ממטא" },
    { label: "VTR (3 שניות)", good: "12–35%" },
    { label: "CTR", good: "0.4–1.8%", note: "נמוך ממטא — כוונת גילוי" },
    { label: "CPA", good: "₪90–250", note: "גבוה ממטא באותו תקציב" },
  ],
  audience: "רחב. הקריאייטיב הוא הטרגוט בפועל.",
  strengths: ["CPM זול", "צפיות ומודעות בקנה מידה", "UGC ומשפיענים"],
  cautions: ["CPA גבוה ממטא — לא לתכנן אותו כערוץ ההמרה הראשי", "דורש נפח קריאייטיב גבוה", "לבדוק תרומה עקיפה ב-GA4 לפני שמכבים"],
};

// [PLAYBOOK] LinkedIn: marketing-analyst/other-platforms.md (LinkedIn Ads Audit) + ecomm benchmarks
const LINKEDIN: PlatformRules = {
  id: "linkedin",
  label: "LinkedIn",
  connector: "linkedin", // Windsor connector exists; not yet connected for Leaders
  ingested: false,
  noDataFloor: 15000, // [AGENCY]
  viewKpiFloor: 3000, // [DERIVED] הפלטפורמה היקרה ביותר
  healthyLineBudget: 9000, // [DERIVED]
  learning: {
    conversions: null,
    perWhat: "—",
    maxBudgetStepPct: 25,
    note: "אין learning phase מוגדר כמו במטא. האיכות נקבעת בטרגוט ובטופס, לא באלגוריתם.",
  },
  scaling: { maxStepPct: 25, holdDays: 7, note: "קהל B2B קטן — סקייל מהיר מקפיץ תדירות ו-CPC." },
  attribution: { window: "30-day click + 7-day view (ברירת מחדל)", caution: "חלון ארוך מנפח. איכות הליד חשובה מה-CPL — לבקש שיעור המרה מליד להזדמנות." },
  creative: { minAssets: 3, refreshDays: 30, note: "Sponsored Content. CTR יורד שבוע-על-שבוע = שחיקה." },
  saturation: ["CTR יורד שבוע-על-שבוע", "תדירות עולה על קהל קטן", "CPL עולה בלי שינוי בטרגוט"],
  benchmarks: [
    { label: "CTR (Sponsored Content)", good: "מעל 0.5%", note: "0.3–0.5% ממוצע; מתחת ל-0.3% חלש" },
    { label: "CPC", good: "מתחת ל-₪15 ($5)", note: "$5–10 ממוצע" },
    { label: "CPL (Lead Gen Forms)", good: "מתחת ל-₪150 ($50)", note: "$50–150 ממוצע; מעל $150 חלש" },
    { label: "השלמת טופס", good: "מעל 15%", note: "3–4 שדות: 15–25% · 5–6: 10–15% · 7+: מתחת ל-10%" },
    { label: "Engagement rate", good: "מעל 2%" },
  ],
  audience: "50K–500K נקודת המתיקות. מתחת ל-20K צר מדי, מעל 1M רחב מדי. תפקידים ספציפיים, לא 'מנהל'; להחריג סטודנטים ומחפשי עבודה.",
  strengths: ["טרגוט B2B מדויק לפי תפקיד, בכירות וגודל חברה", "Lead Gen Forms עם מילוי אוטומטי", "כוונה גבוהה"],
  cautions: ["הפלטפורמה היקרה ביותר — לא לפרוס עליה תקציב קטן", "כל שדה נוסף בטופס מוריד השלמה — 4 שדות מקסימום", "CPL זול עם איכות ליד גרועה = טרגוט רחב מדי"],
};

// [PLAYBOOK] Reddit: marketing-analyst/other-platforms.md (Reddit Ads Audit)
const REDDIT: PlatformRules = {
  id: "reddit",
  label: "Reddit",
  connector: "reddit", // not yet connected for Leaders
  ingested: false,
  noDataFloor: 15000, // [AGENCY]
  viewKpiFloor: 1000, // [DERIVED] CPC נמוך — נכנסים בזול
  healthyLineBudget: 4500, // [DERIVED]
  learning: {
    conversions: null,
    perWhat: "—",
    maxBudgetStepPct: 25,
    note: "אין learning phase. ההצלחה נקבעת בהתאמת הקריאייטיב לקהילה ובבחירת הסאב-רדיטים.",
  },
  scaling: { maxStepPct: 25, holdDays: 7, note: "להרחיב דרך סאב-רדיטים נוספים, לא דרך העלאת בידים." },
  attribution: { window: "click-based", caution: "נפח המרות נמוך — צריך חלון ארוך יותר כדי להסיק. לבדוק סנטימנט בתגובות: תגובות שליליות הורגות ביצועים." },
  creative: { minAssets: 3, refreshDays: 30, note: "חייב להיראות כמו פוסט ולא כמו פרסומת: בלי סטוק, שפה של הקהילה, CTA רך, הוכחה חברתית. 'בנינו כלי שעושה X, הנה מה שלמדנו' מנצח את '🚀 תוכנה מדהימה — 50% הנחה!'" },
  saturation: ["CTR נמוך — כמעט תמיד בעיית קריאייטיב", "סנטימנט שלילי בתגובות", "טרגוט לפי תחומי עניין רחבים במקום סאב-רדיטים"],
  benchmarks: [
    { label: "CTR (Feed)", good: "מעל 0.5%", note: "0.2–0.5% ממוצע" },
    { label: "CTR (Conversation)", good: "מעל 1%", note: "0.5–1% ממוצע" },
    { label: "CPC", good: "מתחת ל-₪4.5 ($1.5)", note: "$1.5–3 ממוצע" },
    { label: "CPM", good: "מתחת ל-₪15 ($5)", note: "$5–10 ממוצע" },
    { label: "שיעור המרה", good: "מעל 2%", note: "1–2% ממוצע" },
  ],
  audience: "סאב-רדיטים ספציפיים, לא תחומי עניין — עדיף ב-90% מהמקרים. נקודת מתיקות 100K–1M חברים. מתחת ל-50K אין נפח, מעל 5M בזבוז.",
  strengths: ["CPC זול", "קהילות נישה עם כוונה אמיתית", "פורמט Conversation עם CTR גבוה"],
  cautions: ["הקהל עוין לפרסום גלוי — התאמת הקריאייטיב היא הגורם המכריע", "נפח המרות נמוך — קשה להסיק מהר", "לא להשתמש בטרגוט תחומי עניין בלבד"],
};

export const PLATFORMS: Record<Platform, PlatformRules> = {
  meta: META,
  google: GOOGLE,
  tiktok: TIKTOK,
  linkedin: LINKEDIN,
  reddit: REDDIT,
};

export function platformRules(p: Platform): PlatformRules {
  return PLATFORMS[p];
}

// ---------------------------------------------------------------- the minimum-budget rule

// [AGENCY] How little money a funnel-stage line may be planned with.
//
// The floor is not a fixed number — it is the learning-phase requirement expressed in money:
// a line must be able to buy `conversions` conversions at that cell's own cost per conversion.
// ₪120 CPA → ₪6,000; ₪400 CPA → ₪20,000. Same rule, different client, different floor.
//
// Two fallbacks, for the cases where a cost per conversion cannot be computed:
//   • no history at all → the platform's noDataFloor (₪15k; ₪30k buys two platforms)
//   • a view/impression KPI (CPV, CPM) → the platform's viewKpiFloor. "50 conversions" means
//     nothing when a conversion is a video view — 50 of those cost a few shekels. [ASSUMPTION:
//     the 50× rule was given for conversion clients; this is how it is applied to views clients,
//     and it is the one part of this rule still open for the team to confirm.]
export const MIN_BUDGET_RULE = {
  conversions: 50,
  twoPlatformMinimum: 30000, // ILS — the no-history budget that supports two platforms
  note: "מינימום לשורה = 50 המרות × עלות להמרה בפועל של אותו תא. בלי היסטוריה: ₪30,000 לשתי פלטפורמות (₪15,000 לפלטפורמה).",
};

// The monthly floor for a line, given what it costs that cell to buy a conversion.
//   costPerConversion — the cell's own cost per conversion (ILS), or null when unknown
//   isConversionKpi   — false for view/impression KPIs, where the 50× rule does not apply
export function minLineBudget(platform: Platform, costPerConversion: number | null, isConversionKpi: boolean): number {
  const p = PLATFORMS[platform];
  if (!isConversionKpi) return p.viewKpiFloor;
  if (costPerConversion == null || costPerConversion <= 0) return p.noDataFloor;
  return MIN_BUDGET_RULE.conversions * costPerConversion;
}

// ---------------------------------------------------------------- cross-platform allocation

// [PLAYBOOK] marketing-analyst/spend-budget.md — Ad Spend Allocator. The tier a budget line
// belongs to, and how much of a plan each tier should hold.
export interface BudgetTier {
  key: "proven" | "scaling" | "testing";
  label: string;
  share: number;
  criteria: string;
}
export const BUDGET_TIERS: BudgetTier[] = [
  { key: "proven", label: "מוכח", share: 0.7, criteria: "ROAS יציב, תוצאות צפויות, 3+ חודשי היסטוריה" },
  { key: "scaling", label: "בסקייל", share: 0.2, criteria: "הזדמנות מתפתחת, סימנים חיוביים מוקדמים" },
  { key: "testing", label: "בבדיקה", share: 0.1, criteria: "ערוץ חדש, ניסוי קריאייטיב, אסטרטגיה לא מוכחת" },
];

// [PLAYBOOK] Same source: never shift more than this share of a budget in one move, and hold
// before moving again. This is where mediaPlanRules' scale cap comes from.
export const REALLOCATION = {
  maxShiftPct: 20,
  monitorDays: 14,
  note: "העברה של יותר מ-20% בבת אחת משבשת. אחרי כל שינוי — 7–14 יום מעקב לפני שינוי נוסף.",
};

// [PLAYBOOK] Signals that a channel is saturated and extra budget will not return the same.
export const DIMINISHING_RETURNS = [
  "CPC עולה עם אותו טרגוט (רוויית מכרז)",
  "תדירות עולה במטא (מיצוי קהל)",
  "שיעור המרה יורד בזמן שהחשיפות עולות",
  "אינפלציית CPM בלי שיפור בתגובה",
  "ROAS שולי יורד מתחת ל-ROAS המשוקלל",
];

// [PLAYBOOK] ecomm-analyst/benchmarks.md — thresholds that mean act now, whatever the plan says.
export const ACTION_THRESHOLDS = [
  { signal: "CPA מעל 3× AOV", action: "לא בר-קיימא — לתקן לפני סקייל" },
  { signal: "ROAS מתחת ל-1.5x (מדווח)", action: "הפסד גם עם אטריביושן מנופח" },
  { signal: "CVR יורד מעל 25% שבוע-על-שבוע", action: "דף נחיתה, טראקינג או בעיית מוצר" },
  { signal: "CTR יורד מעל 30% עם אותו קריאייטיב", action: "שחיקת קהל או קריאייטיב" },
  { signal: "CPM מזנק מעל 50% בלי עונתיות", action: "רוויית קהל או תחרות במכרז" },
];
