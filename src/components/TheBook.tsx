/**
 * The Book — the complete manual of the engine, English and Arabic, with a
 * table of contents. Every mechanic, every page, every number explained.
 */
import React, { useState } from "react";
import { audio } from "../audio/engine";
import { useI18n } from "../i18n/I18nProvider";

interface Section {
  id: string;
  en: { title: string; body: string[] };
  ar: { title: string; body: string[] };
}

const SECTIONS: Section[] = [
  {
    id: "goal",
    en: {
      title: "What this machine is",
      body: [
        "Ludus Vitae is a deterministic life engine. Your real life is the game: real work, verified with real evidence, moves every number you see. Nothing here is random, and no AI can change your state — every rule is fixed mathematics running on your own computer, offline.",
        "It is not a habit tracker. It is a war: ten chapters, each guarded by three bosses that personify what keeps you small — your finances, your mind, your body. You win by executing, proving it, and striking.",
      ],
    },
    ar: {
      title: "ما هذه الآلة",
      body: [
        "لودوس فيتاي (لعبة الحياة) هي محرك حياة حتمي. حياتك الحقيقية هي اللعبة: العمل الحقيقي، المُثبَت بأدلة حقيقية، يحرّك كل رقم تراه. لا شيء هنا عشوائي، ولا يستطيع الذكاء الاصطناعي تغيير حالتك — كل قاعدة هي رياضيات ثابتة تعمل على جهازك، دون إنترنت.",
        "هذه ليست أداة لتتبع العادات. هذه حرب: عشرة فصول، كل فصل يحرسه ثلاثة وحوش تجسّد ما يُبقيك صغيرًا — مالُك، عقلُك، جسدُك. تنتصر بالتنفيذ، والإثبات، والضرب.",
      ],
    },
  },
  {
    id: "loop",
    en: {
      title: "The daily loop",
      body: [
        "Each day you have directives (your repeated duties). Executing one and verifying it (honest check, photo, or file) raises your Momentum, sharpens your Sword, and — if the directive is sworn to a boss — chips that boss's health (a Siege).",
        "At midnight the engine closes the day: every window you missed compounds friction debt, drains momentum, and chips your sword's durability. This happens even if the app is closed — when you return, the Night Ledger shows you everything that happened.",
      ],
    },
    ar: {
      title: "دورة اليوم",
      body: [
        "كل يوم لديك أوامر (واجباتك المتكررة). تنفيذ أمرٍ والتحقق منه (تحقق شرفي، صورة، أو ملف) يرفع الزخم، ويشحذ سيفك، و— إذا كان الأمر مُقسَمًا لوحش — يقضم صحة ذلك الوحش (حِصار).",
        "عند منتصف الليل يُغلق المحرك اليوم: كل نافذة فوّتَّها تُراكِم دَين الاحتكاك، وتستنزف الزخم، وتَكسِر متانة سيفك. يحدث هذا حتى لو كان التطبيق مغلقًا — وعند عودتك، يعرض «سجل الليل» كل ما جرى.",
      ],
    },
  },
  {
    id: "momentum",
    en: {
      title: "Momentum — the engine's heartbeat",
      body: [
        "Momentum starts at 1.00 and lives between 0.25 and 3.50. Every verified execution adds a fixed amount: Trivial +0.02, Standard +0.05, Heroic +0.10, Mythic +0.20.",
        "Losses are multiplicative — one missed Standard multiplies momentum by 0.90; a missed Mythic by 0.81. Losing hurts more than winning helps, deliberately, because that is how real life behaves.",
        "Momentum changes everything you see: below 1.00 the road turns to mud, the interface loses color, the audio muffles, the hell-hound appears behind you. Above 1.5 the world brightens and golden motes drift. It also discounts stamina costs (÷√M) and speeds your walk.",
      ],
    },
    ar: {
      title: "الزخم — نبض المحرك",
      body: [
        "يبدأ الزخم عند 1.00 ويعيش بين 0.25 و3.50. كل تنفيذ مُوثَّق يضيف مقدارًا ثابتًا: هامشي +0.02، قياسي +0.05، بطولي +0.10، أسطوري +0.20.",
        "الخسائر مضاعِفة — نافذة قياسية مفوَّتة تضرب الزخم في 0.90؛ وأسطورية مفوَّتة في 0.81. الخسارة تؤلم أكثر مما ينفع الفوز، عمدًا، لأن هذه طبيعة الحياة.",
        "الزخم يغيّر كل ما تراه: تحت 1.00 يتحول الطريق إلى وحل، وتفقد الواجهة ألوانها، ويخفت الصوت، ويظهر كلب الجحيم خلفك. فوق 1.5 يُشرق العالم وتطفو ذرات ذهبية. وهو أيضًا يخفّض تكلفة الطاقة (÷جذر الزخم) ويُسرّع مشيك.",
      ],
    },
  },
  {
    id: "stamina",
    en: {
      title: "Stamina & Friction (the Rust)",
      body: [
        "Stamina is your daily budget. Each execution costs stamina: Trivial 2, Standard 5, Heroic 9, Mythic 14 — divided by √momentum. You regenerate overnight: 30 × √momentum, halved on days with misses.",
        "Friction: every consecutive miss of the same directive multiplies its cost by ~1.30. Miss a duty three days running and it costs more than double. This is the Rust — rusted directives glow orange and are always your emergency. One verified execution resets the debt to zero.",
        "Running out of stamina never blocks you: executing on an empty tank works but earns only half momentum (an Overdraft). Executing outside your set hour window earns 75%.",
      ],
    },
    ar: {
      title: "الطاقة والاحتكاك (الصدأ)",
      body: [
        "الطاقة هي ميزانيتك اليومية. كل تنفيذ يكلّف طاقة: هامشي 2، قياسي 5، بطولي 9، أسطوري 14 — مقسومة على جذر الزخم. تتجدد ليلًا: 30 × جذر الزخم، وتُنَصَّف في أيام التفويت.",
        "الاحتكاك: كل تفويت متتالٍ لنفس الأمر يضرب تكلفته في ~1.30. فوّت واجبًا ثلاثة أيام متتالية فتصبح كلفته أكثر من الضعف. هذا هو الصدأ — الأوامر الصدئة تتوهج برتقاليًا وهي دائمًا حالتك الطارئة. تنفيذ واحد مُوثَّق يُصفّر الدَّين.",
        "نفاد الطاقة لا يمنعك أبدًا: التنفيذ بخزان فارغ يعمل لكنه يمنح نصف الزخم فقط (سحب على المكشوف). والتنفيذ خارج نافذة الساعات يمنح 75%.",
      ],
    },
  },
  {
    id: "sword",
    en: {
      title: "The Sword (the Whetstone law)",
      body: [
        "Your daily directives do not damage bosses directly (except sworn sieges — see below). They forge your Sword: each execution adds Sharpness, weighted by class and sector (Financial counts ×1.5). A dull blade sharpens fast; a keen one slowly.",
        "Idle days decay sharpness (half-life 14 days). Misses chip Durability; perfect days heal it (+1). Below 30 durability the blade is FRACTURED (half strikes). At 0 it is BROKEN — only seven consecutive perfect days reforge it.",
        "Fire affinity grows from Heroic/Mythic work; Lightning from perfect days. Both boost your Reckoning strikes up to +30% each, and both fade unless renewed.",
      ],
    },
    ar: {
      title: "السيف (قانون المِشحَذ)",
      body: [
        "أوامرك اليومية لا تضرب الوحوش مباشرة (باستثناء الحصار المُقسَم — انظر أدناه). إنها تصقل سيفك: كل تنفيذ يزيد الحِدّة، موزونة بالفئة والقطاع (المالي يُحسب ×1.5). النصل الكليل يُشحذ سريعًا؛ والحاد ببطء.",
        "أيام الخمول تُضعف الحدة (نصف عمر 14 يومًا). التفويتات تكسر المتانة؛ والأيام الكاملة تشفيها (+1). تحت متانة 30 يصبح النصل مشروخًا (نصف الضربات). وعند الصفر يكون مكسورًا — سبعة أيام كاملة متتالية فقط تعيد صياغته.",
        "أُلفة النار تنمو من الأعمال البطولية والأسطورية؛ والبرق من الأيام الكاملة. كلاهما يعزز ضربات «الحساب» حتى +30% لكلٍّ منهما، وكلاهما يخبو ما لم يتجدد.",
      ],
    },
  },
  {
    id: "domains",
    en: {
      title: "Domains, Directives & Swearing to goals",
      body: [
        "Life is split into four domains: Financial (trains CHA, carries ×1.5 weight — your frontline), Intellectual (trains INT), Physical (trains STR), Responsibility (trains WIL, ×0.75). Twelve active directives maximum — depth beats breadth.",
        "A directive can be SWORN to a boss of the current chapter. Then every verified execution also sieges that boss: 0.5 × weight × sector multiplier of damage. The Siege is capped at 20% of the boss's total health — daily pressure weakens a boss, but only milestones and Reckonings can kill it. This is how your daily work is connected to your goals: swear the habit to the goal it serves.",
      ],
    },
    ar: {
      title: "الميادين والأوامر والقَسَم للأهداف",
      body: [
        "تنقسم الحياة إلى أربعة ميادين: المالي (يدرّب الكاريزما، ويحمل وزن ×1.5 — خط جبهتك)، الفكري (يدرّب الذكاء)، البدني (يدرّب القوة)، والمسؤوليات (تدرّب الإرادة، ×0.75). اثنا عشر أمرًا نشطًا كحد أقصى — العمق يغلب الاتساع.",
        "يمكن أن يُقسَم الأمر لوحشٍ من الفصل الحالي. حينها كل تنفيذ مُوثَّق يحاصر ذلك الوحش أيضًا: 0.5 × الوزن × مضاعف القطاع من الضرر. الحصار محدود بـ20% من صحة الوحش الكلية — الضغط اليومي يُضعف الوحش، لكن المعالم و«الحساب» وحدها تقتله. هكذا يرتبط عملك اليومي بأهدافك: أقسِم العادة للهدف الذي تخدمه.",
      ],
    },
  },
  {
    id: "campaign",
    en: {
      title: "The Campaign: chapters, bosses, milestones",
      body: [
        "Ten chapters, each guarded by three bosses (Financial, Intellectual, Physical). A chapter has NO time limit — it ends when its bosses die.",
        "Milestones are your big, provable goals — each one is a vow against a specific boss with a damage value (5–100). Completing one with valid evidence strikes immediately (damage × sector multiplier). You can add, edit, or delete milestones freely until they are sealed; sealed ones are history and locked. The Oracle can draft milestones from your goal text — you edit, you forge.",
        "In the Campaign page: click a chapter to enter it; click a boss to open its own room with its portrait, lore, siege meter, and milestones.",
      ],
    },
    ar: {
      title: "الحملة: الفصول والوحوش والمعالم",
      body: [
        "عشرة فصول، كل فصل يحرسه ثلاثة وحوش (مالي، فكري، بدني). الفصل بلا حدّ زمني — ينتهي عندما تموت وحوشه.",
        "المعالم هي أهدافك الكبيرة القابلة للإثبات — كل معلم عهدٌ ضد وحش محدد بقيمة ضرر (5–100). إتمام معلم بدليل صحيح يضرب فورًا (الضرر × مضاعف القطاع). يمكنك إضافة المعالم وتعديلها وحذفها بحرية حتى تُختَم؛ المختومة تاريخ مُقفَل. ويستطيع «العرّاف» صياغة معالم من نص هدفك — أنت تعدّل، وأنت تصوغ.",
        "في صفحة الحملة: اضغط فصلًا لتدخله؛ واضغط وحشًا لتفتح غرفته الخاصة بصورته وحكايته وعدّاد حصاره ومعالمه.",
      ],
    },
  },
  {
    id: "reckoning",
    en: {
      title: "The Reckoning & the Gates",
      body: [
        "The Reckoning is your forged blade spent: one strike against every living boss of the chapter. Strike power = sharpness × durability factor × affinities × momentum factor × √(how much you've already worked that boss's sector) − armor. You cannot strike a sector you ignored.",
        "It demands sharpness ≥ 40 and 7 days since the last call. It costs the blade 10 durability, and if any boss survives, the edge is BLUNTED (sharpness ×0.70). If the last boss falls — the gate opens cleanly and the next chapter begins, no debt.",
        "Forcing the Gate: once global weighted progress ≥ 80% AND every sector ≥ 50%, you may choose to advance early. Every survivor then ASCENDS: it follows you into the next chapter with +35% health and lays a +20% stamina curse on its whole sector until you finally kill it. Clean kills are cheaper than carried debts.",
      ],
    },
    ar: {
      title: "الحساب والبوابات",
      body: [
        "«الحساب» هو إنفاق نصلك المصقول: ضربة واحدة ضد كل وحش حيّ في الفصل. قوة الضربة = الحدة × عامل المتانة × الأُلف × عامل الزخم × جذر (مقدار ما عملته فعلًا في قطاع ذلك الوحش) − الدرع. لا يمكنك ضرب قطاعٍ أهملته.",
        "يتطلب حدة ≥ 40 وسبعة أيام منذ آخر نداء. يكلّف النصل 10 متانة، وإن نجا أي وحش يُثلَم النصل (الحدة ×0.70). وإن سقط آخر وحش — تنفتح البوابة نظيفةً ويبدأ الفصل التالي بلا دَين.",
        "إجبار البوابة: متى بلغ التقدم العالمي الموزون ≥ 80% وكل قطاع ≥ 50%، يمكنك اختيار التقدم مبكرًا. عندها يصعد كل ناجٍ: يتبعك إلى الفصل التالي بصحة +35% ويلقي لعنة طاقة +20% على قطاعه كله حتى تقتله أخيرًا. القتل النظيف أرخص من الدَّين المحمول.",
      ],
    },
  },
  {
    id: "character",
    en: {
      title: "The Character: what the stats mean",
      body: [
        "STR (Strength) grows from physical work — it raises your maximum stamina (100 + 2 per point above 10).",
        "INT (Intelligence) grows from intellectual work — it lowers the friction interest rate on your misses.",
        "CHA (Charisma) grows from financial/market work — it unlocks stat-gated milestones (high-tier deals demand presence).",
        "WIL (Willpower) grows from everything — it widens how many misses you tolerate before a directive visibly rusts.",
        "Stats grow slowly on purpose: level 15 costs 625 experience, level 20 costs 2,500. There is no grinding to godhood — only honest years, compressed.",
      ],
    },
    ar: {
      title: "الشخصية: ماذا تعني الصفات",
      body: [
        "القوة تنمو من العمل البدني — ترفع أقصى طاقتك (100 + 2 لكل نقطة فوق 10).",
        "الذكاء ينمو من العمل الفكري — يخفّض معدل فائدة الاحتكاك على تفويتاتك.",
        "الكاريزما تنمو من العمل المالي والسوقي — تفتح المعالم المشروطة بالصفات (الصفقات الكبرى تتطلب حضورًا).",
        "الإرادة تنمو من كل شيء — توسّع عدد التفويتات التي تحتملها قبل أن يصدأ الأمر ظاهريًا.",
        "الصفات تنمو ببطء عمدًا: المستوى 15 يكلّف 625 خبرة، والمستوى 20 يكلّف 2500. لا وجود للطحن نحو الألوهية — فقط سنوات صادقة، مضغوطة.",
      ],
    },
  },
  {
    id: "arsenal",
    en: {
      title: "The Arsenal: sword, bag, equipment",
      body: [
        "The great sword shows your blade's true state — tempered, blunted, fractured, or broken in half. Its glow is your sharpness; embers mean fire affinity.",
        "The Evidence Bag holds every proof you ever submitted: cobblestones (images) and archive scrolls (files). Each piece permanently paves one more stone of the road in the world — whatever your momentum does later, laid stone stays.",
        "The Equipment Manifest lists 30 sealed relics — one per boss. Killing a boss manifests its relic, and your avatar visibly wears the flagship pieces (greaves from Financial kills, hood from Intellectual, pauldrons from Physical). Equipment cannot be bought, only earned.",
      ],
    },
    ar: {
      title: "الترسانة: السيف والحقيبة والعتاد",
      body: [
        "السيف العظيم يعرض حالة نصلك الحقيقية — مصقول، مثلوم، مشروخ، أو مكسور نصفين. توهّجه هو حدّتك؛ والجمر يعني أُلفة النار.",
        "حقيبة الأدلة تحمل كل إثبات قدّمته: أحجار الرصف (الصور) ولفائف الأرشيف (الملفات). كل قطعة ترصف حجرًا دائمًا في طريق العالم — مهما فعل زخمك لاحقًا، يبقى الحجر المرصوف.",
        "سجل العتاد يسرد 30 أثرًا مختومًا — واحد لكل وحش. قتل الوحش يُظهر أثره، وشخصيتك ترتدي القطع الرئيسية ظاهريًا (دروع الساق من القتل المالي، القلنسوة من الفكري، حراشف الكتف من البدني). العتاد لا يُشترى، بل يُكتسب.",
      ],
    },
  },
  {
    id: "oracle",
    en: {
      title: "The Oracle & the four voices",
      body: [
        "Four voices watch your numbers, each manifesting as a familiar: The Oracle (your 30-year-old self — the hero), Malachai the Keeper of Scales (the burning skull — finances), Ignatius the Soul Scalpel (the ghost — your mind's excuses), Commander Kaldor (the hound — your body).",
        "They are READ-ONLY by architecture: they see your snapshot, they can never change a number. Offline they speak from a deterministic rule table; with a Gemini key sealed in Settings they speak live — same strict contract either way.",
        "The AI also drafts milestones from your goals (Campaign → any boss → Let the Oracle Draft) and comments on your night reports. It proposes; only you dispose.",
      ],
    },
    ar: {
      title: "العرّاف والأصوات الأربعة",
      body: [
        "أربعة أصوات تراقب أرقامك، كلٌّ يتجسد كتابعٍ أليف: العرّاف (نسختك في الثلاثين — البطل)، ملاخاي حارس الموازين (الجمجمة المشتعلة — المال)، إغناطيوس مِشرَط الروح (الشبح — أعذار عقلك)، والقائد كالدور (كلب الجحيم — جسدك).",
        "هي للقراءة فقط بحكم البنية: ترى لقطة حالتك ولا تستطيع تغيير رقم واحد أبدًا. دون إنترنت تتحدث من جدول قواعد حتمي؛ وبمفتاح Gemini مختوم في الإعدادات تتحدث حيّةً — بنفس العقد الصارم في الحالتين.",
        "الذكاء الاصطناعي يصوغ أيضًا معالم من أهدافك (الحملة ← أي وحش ← دَع العرّاف يصوغ) ويعلّق على تقارير ليلك. هو يقترح؛ وأنت وحدك تُقرر.",
      ],
    },
  },
  {
    id: "world",
    en: {
      title: "Reading the World",
      body: [
        "The walking strip is a gauge, not a decoration. Mud = momentum below 1.00. Rain = below 0.70. Golden motes = above 1.50. Gold-tinted stones = your permanent evidence. The hell-hound closing in behind you = momentum collapsing. The drifting ghost = the Cognitive Fog boss still lives while your momentum is low.",
        "Your avatar walks at momentum speed, wears what you have earned, and stands breathing when the world is paused.",
      ],
    },
    ar: {
      title: "قراءة العالم",
      body: [
        "شريط المشي مقياس، لا زينة. الوحل = زخم تحت 1.00. المطر = تحت 0.70. الذرات الذهبية = فوق 1.50. الحجارة الذهبية = أدلتك الدائمة. كلب الجحيم يقترب خلفك = زخم ينهار. الشبح الطافي = وحش «ضباب الإدراك» ما زال حيًا وزخمُك منخفض.",
        "شخصيتك تمشي بسرعة زخمك، وترتدي ما كسبته، وتقف تتنفس عندما يتوقف العالم.",
      ],
    },
  },
  {
    id: "controls",
    en: {
      title: "Controls, Reset & data",
      body: [
        "Keys 1–9 execute the corresponding due directive on the Today page. ESC closes any panel.",
        "Everything lives in one local SQLite database on your machine (path shown in Settings). Export timestamped backups anytime. The Gemini key lives in the Windows Credential Manager, never in a file.",
        "Reset: Settings → Data Controls → Burn the World. Type RESET exactly. Everything is erased except your settings and API key, and the Genesis Ritual returns. There is no undo — export a backup first if you have any doubt.",
      ],
    },
    ar: {
      title: "التحكم وإعادة الضبط والبيانات",
      body: [
        "المفاتيح 1–9 تنفّذ الأمر المستحق المقابل في صفحة اليوم. ESC يغلق أي لوحة.",
        "كل شيء يعيش في قاعدة SQLite محلية واحدة على جهازك (المسار في الإعدادات). صدّر نسخًا احتياطية مؤرَّخة متى شئت. مفتاح Gemini يعيش في مدير اعتمادات ويندوز، لا في ملف أبدًا.",
        "إعادة الضبط: الإعدادات ← التحكم بالبيانات ← أحرق العالم. اكتب RESET حرفيًا. يُمحى كل شيء عدا إعداداتك ومفتاحك، ويعود «طقس التكوين». لا تراجع — صدّر نسخة احتياطية أولًا إن ساورك شك.",
      ],
    },
  },
];

export function TheBook({ onClose }: { onClose: () => void }) {
  const { lang: appLang } = useI18n();
  const [lang, setLang] = useState<"en" | "ar">(appLang);
  const [active, setActive] = useState(SECTIONS[0].id);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`book-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    audio.uiTick();
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal book-frame" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="book-head">
          <div>
            <h2 className="modal-title">{lang === "en" ? "The Book" : "الكتاب"}</h2>
            <div className="modal-sub" style={{ marginBottom: 0 }}>
              {lang === "en" ? "everything the engine does, and why" : "كل ما يفعله المحرك، ولماذا"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className={`btn small${lang === "en" ? " primary" : ""}`} onClick={() => setLang("en")}>English</button>
            <button className={`btn small${lang === "ar" ? " primary" : ""}`} onClick={() => setLang("ar")}>العربية</button>
            <button className="btn small" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="book-body">
          <nav className="book-toc">
            <div className="field-label" style={{ marginBottom: 8 }}>
              {lang === "en" ? "Table of Contents" : "الفهرس"}
            </div>
            {SECTIONS.map((s, i) => (
              <button key={s.id}
                className={`book-toc-item${active === s.id ? " active" : ""}`}
                onClick={() => jump(s.id)}>
                <span className="mono faint" style={{ fontSize: 9, marginInlineEnd: 8 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {s[lang].title}
              </button>
            ))}
          </nav>
          <div className="book-pages">
            {SECTIONS.map((s, i) => (
              <section key={s.id} id={`book-${s.id}`} className="book-section">
                <h3 className="law-name" style={{ fontSize: 16 }}>
                  {String(i + 1).padStart(2, "0")} · {s[lang].title}
                </h3>
                {s[lang].body.map((para, j) => (
                  <p key={j} className="book-para">{para}</p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
