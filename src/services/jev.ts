import { fetch } from "@tauri-apps/plugin-http";
import { Category, Email } from "../types";

/**
 * Jev (TypeSafe) via OpenRouter's Decisions API.
 *
 * Jev is a "System One" decision model — it does not generate prose. You send it
 * application `state` plus a set of typed `questions`, and it returns a typed
 * answer (with probabilities) for each. This maps perfectly onto email
 * classification: one `noul` (yes/no) question per topic category.
 */

/** Alias that always tracks the current Jev release. Pin `typesafe/jev-1.13` for stability. */
export const JEV_MODEL = "~typesafe/jev-latest";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

/** Probability of "yes" at or above which we assign the category. */
export const JEV_YES_THRESHOLD = 0.5;

interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

interface NoulAnswer {
  type: "noul";
  noul: number;
}

interface JevResponse {
  answers?: Record<string, NoulAnswer>;
}

/**
 * Multi-label classification: one yes/no question per topic category, answered
 * in a single request. Returns each category with its probability-of-yes.
 */
export async function classifyEmailWithJev(
  apiKey: string,
  email: Email,
  body: string,
  categories: Category[]
): Promise<{ categoryId: string; confidence: number }[]> {
  const state = {
    subject: email.subject,
    from: `${email.fromName} <${email.fromEmail}>`,
    date: email.date ?? "",
    snippet: email.snippet ?? "",
    body: body.slice(0, 6000),
  };

  const questions: Record<string, NoulQuestion> = {};
  for (const c of categories) {
    questions[c.id] = {
      type: "noul",
      instructions: `Does this email belong in the "${c.name}" category?`,
      criteria: {
        true: `The email clearly fits what a "${c.name}" category should contain.`,
        false: `The email does not fit the "${c.name}" category.`,
      },
    };
  }

  const res = await fetch(DECISIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Concierge",
    },
    body: JSON.stringify({ model: JEV_MODEL, state, questions }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jev ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as JevResponse;
  const answers = data.answers ?? {};

  const result: { categoryId: string; confidence: number }[] = [];
  for (const c of categories) {
    const a = answers[c.id];
    if (!a || typeof a.noul !== "number") continue;
    result.push({ categoryId: c.id, confidence: a.noul });
  }
  return result;
}