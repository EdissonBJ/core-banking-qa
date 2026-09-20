import { askStructured } from "../../src/support-agent/llm-client";

export interface GoldenCase {
  id: string;
  question: string;
  category: string;
  criteria: string;
}

export interface JudgeScore {
  groundedness: number;
  relevance: number;
  reasoning: string;
}

const JUDGE_SYSTEM_PROMPT = `Sos un evaluador (LLM-as-judge) de las respuestas de un asistente de soporte
bancario. Te dan la pregunta que le hicieron, los criterios de evaluación
para esa pregunta puntual, y la respuesta real que dio el asistente.
Evaluá dos dimensiones independientes, cada una en una escala entera de 1 a 5:

- groundedness (1-5): ¿la respuesta se basa únicamente en datos
  consistentes con lo esperado, sin inventar cifras, cuentas o hechos? Si
  lo correcto para esa pregunta es un rechazo (fuera de alcance,
  adversarial), un rechazo limpio que no inventa nada también es
  groundedness 5. 1 = inventa datos o afirma algo no verificable.
- relevance (1-5): ¿la respuesta cumple con los criterios de evaluación
  dados? 5 = los cumple por completo. 1 = no tiene relación con lo que
  pedían los criterios.

Basate únicamente en la pregunta, los criterios y la respuesta que te dan.
No le des puntaje alto a una respuesta solo por sonar profesional o segura
si no cumple los criterios. Respondé con los dos puntajes (enteros) y una
razón de una sola línea que justifique ambos.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    groundedness: { type: "integer", minimum: 1, maximum: 5 },
    relevance: { type: "integer", minimum: 1, maximum: 5 },
    reasoning: { type: "string" },
  },
  required: ["groundedness", "relevance", "reasoning"],
  additionalProperties: false,
};

export function judgeAnswer(goldenCase: GoldenCase, answer: string): JudgeScore {
  const userMessage = `Pregunta: ${goldenCase.question}
Criterios de evaluación: ${goldenCase.criteria}
Respuesta del asistente: ${answer}`;

  return askStructured<JudgeScore>(JUDGE_SYSTEM_PROMPT, userMessage, JUDGE_SCHEMA);
}
