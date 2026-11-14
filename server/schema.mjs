const text = { type: 'string' };
const texts = { type: 'array', items: text };
const list = items => ({ type: 'array', items });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const ANALYSIS_SCHEMA = object({
  urgent: list(object({ sign: text, action: text })),
  drugs: list(object({ input: text, search_name: text, ingredient: text, ingredient_en: texts,
    class: text, purpose: text, side_effects: texts, watch: text, caution: text, unsure: { type: 'boolean' } })),
  combos: list(object({ drugs: texts, type: text, level: text, note: text })),
  checklist: list(object({ area: text, items: list(object({ sign: text, related: texts })) })),
  observations: list(object({ observed: text, possibly_related: texts, other_causes: text, ask: text })),
  questions: texts, plan: texts, member_talk: texts,
});
export const QUIZ_SCHEMA = object({ items: list(object({ q: text, options: { type: 'array', items: text, minItems: 4, maxItems: 4 },
  answer: { type: 'integer', enum: [0, 1, 2, 3] }, explain: text })) });
