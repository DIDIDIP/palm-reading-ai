"use strict";

// 손금 해석 엔진: 사용자가 고른(또는 AI가 미리 채운) 특징값을 rules.json 규칙으로 풀이한다.
const PalmEngine = (() => {
  function activeQuestions(rules, answers) {
    return rules.questions.filter((q) => !Object.entries(q.skip_if || {}).some(([k, v]) => answers[k] === v));
  }

  // 필수 답이 모두 있고 허용된 값인지 확인한 뒤, 건너뛴 질문의 답은 버린다
  function validate(rules, answers) {
    const clean = {};
    for (const q of activeQuestions(rules, answers)) {
      const value = answers[q.id];
      if (!q.options.some((o) => o.value === value)) throw new Error(`'${q.title}' 질문에 답해 주세요.`);
      clean[q.id] = value;
    }
    return clean;
  }

  function handType(answers) {
    const square = answers.palm_shape === "square";
    const short = answers.finger_length === "short";
    if (square) return short ? "earth" : "air";
    return short ? "fire" : "water";
  }

  // 같은 손이라도 날마다 다른 '오늘의 한 마디'를 고르기 위한 간단한 해시
  function hash(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
  }

  function interpret(rules, rawAnswers, today = new Date()) {
    const answers = validate(rules, rawAnswers);
    const handId = handType(answers);
    const hand = rules.hand_types[handId];

    const sections = Object.fromEntries(rules.categories.map((c) => [c.id, []]));
    for (const [cat, text] of Object.entries(hand.texts)) sections[cat].push(text);

    const observations = [], tags = [];
    for (const q of rules.questions) {
      if (!(q.id in answers)) continue;
      const rule = rules.features[q.id]?.[answers[q.id]];
      if (!rule) continue;
      observations.push(rule.observe);
      if (rule.tag) tags.push(rule.tag);
      for (const [cat, text] of Object.entries(rule.texts)) sections[cat].push(text);
    }

    const keys = new Set([...Object.entries(answers).map(([k, v]) => `${k}:${v}`), `hand:${handId}`]);
    const indices = rules.indices.map((idx) => {
      const score = idx.base + Object.entries(idx.add).reduce((s, [k, d]) => s + (keys.has(k) ? d : 0), 0);
      return { id: idx.id, label: idx.label, left: idx.left, score: Math.max(10, Math.min(95, score)) };
    });

    let nickname = hand.nickname;
    if (answers.simian === "yes") nickname = "몰입형 " + nickname.split(" ").slice(1).join(" ");

    const day = today.toISOString().slice(0, 10);
    const seed = hash(JSON.stringify(Object.entries(answers).sort()) + day);

    return {
      hand_type: { id: handId, label: hand.label, nickname, summary: hand.summary },
      tags: tags.slice(0, 4),
      observations,
      sections: rules.categories.filter((c) => sections[c.id].length)
        .map((c) => ({ id: c.id, label: c.label, texts: sections[c.id] })),
      indices,
      daily_word: rules.daily_words[seed % rules.daily_words.length],
      disclaimer: rules.meta.disclaimer,
    };
  }

  return { interpret, activeQuestions, handType };
})();
