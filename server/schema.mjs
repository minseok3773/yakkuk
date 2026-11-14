// Bounded outputs prevent repetitive lists from consuming the free allowance.
const text = { type: 'string', maxLength: 240 };
const name = { type: 'string', maxLength: 120 };
const list = (items, maxItems) => ({ type: 'array', items, maxItems });
const texts = max => list(text, max);
const names = max => list(name, max);
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const ANALYSIS_SCHEMA = object({
  urgent: list(object({ sign: text, action: text }), 8),
  drugs: list(object({ input: name, search_name: name, ingredient: name,
    ingredient_en: list({ type: 'string', maxLength: 100, pattern: '^[a-z][a-z0-9 -]*$' }, 8),
    class: text, purpose: text, side_effects: texts(4), watch: text, caution: text, unsure: { type: 'boolean' } }), 30),
  combos: list(object({ drugs: names(10), type: text, level: name, note: text }), 5),
  checklist: list(object({ area: name, items: list(object({ sign: text, related: names(10) }), 4) }), 5),
  observations: list(object({ observed: text, possibly_related: names(10), other_causes: text, ask: text }), 8),
  questions: texts(7), plan: texts(6), member_talk: texts(4),
});
export const QUIZ_SCHEMA = object({ items: list(object({ q: text,
  options: { type: 'array', items: text, minItems: 4, maxItems: 4 },
  answer: { type: 'integer', enum: [0, 1, 2, 3] }, explain: text }), 5) });
