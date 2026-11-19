// The prompt users copy into another assistant to produce an importable bundle.
// Kept as a module so it stays easy to edit without touching the dialog code.
export const IMPORT_PROMPT = `You are generating study material for "ministudyui", a local-first flashcard and quiz app. Output ONE JSON object that the app can import. Write only the JSON: no prose, no commentary, and no keys other than the ones described below. You may wrap the object in a \`\`\`json fenced code block; nothing else outside it.

TOP LEVEL
{
  "decks": [ Deck, ... ],      // optional
  "quizzes": [ Quiz, ... ]     // optional
}
Provide at least one deck or one quiz. Maximum 50 decks and 50 quizzes.

Deck
{
  "name": string,          // required, 1-120 characters, unique
  "description": string,   // optional, at most 2000 characters
  "cards": [ Card, ... ]   // optional, at most 100
}

Card
{
  "front": string,         // required, 1-4000 characters: the question
  "back": string,          // required, 1-4000 characters: the answer
  "tags": [ string, ... ]  // optional, at most 10 tags of 1-40 characters each
}
If a deck with the same name already exists in the app, its cards are added to that deck; otherwise a new deck is created.

Quiz
{
  "title": string,               // required, 1-200 characters
  "description": string,         // optional, at most 2000 characters
  "deck": string,                // optional: a deck name from "decks" above, or an existing deck
  "shuffle": boolean,            // optional, default false: randomize question order for each attempt
  "questions": [ Question, ... ] // required, 1-100
}
One quiz per deck: a deck can have at most one linked quiz, and a quiz can belong to at most one deck. Never give two quizzes the same deck.

Question: an object with "type" and "prompt" (required, 1-4000 characters), plus type-specific fields:
- "mcq": "choices" = 2-8 objects { "id": string, "text": string }, "correct" = the id of the correct choice.
- "multi": same "choices", but "correct" is an array of the correct ids (at least one).
- "numeric": "value" (number), optional "tolerance" (number >= 0, default 0), "tolerance_type" ("abs" or "rel", default "abs"), optional "unit" (<= 20 characters).
- "short" or "latex": "reference" (required, the model answer, 1-4000 characters) and optional "rubric" (<= 2000 characters). Use "latex" when the answer must show worked steps.
All types also accept optional "explanation" (<= 4000 characters) and "points" (number > 0 and <= 100, default 1).
Choice ids must be 1-16 lowercase letters, digits or underscores (e.g. "a", "b", "c") and "correct" must reference one of them.

MARKDOWN FORMATTING
Every text field is rendered as Markdown: deck and quiz descriptions, card fronts and backs, question prompts, choice texts, explanations, references, and rubrics. Use it to make content clear and scannable:
- "#" through "######" for headings (use sparingly in short fields)
- "- " or "1. " for bulleted or numbered lists
- "**bold**", "*italic*", "~~strikethrough~~"
- backticks for inline code and triple-tilde (~~~) fences with a language for code blocks
- "> " for blockquotes, "---" for a divider, "[label](url)" for links, and "| a | b |" tables with a separator row
- Use blank lines between paragraphs and blocks.
Do not use HTML tags: they are shown as literal text, never rendered. Keep choice texts short and mostly inline (bold, code, math); avoid headings and multi-paragraph lists there because choices are displayed as compact labels.
LaTeX math works inside Markdown: $x^2$ for inline math and $$...$$ for a displayed equation. Keep math in normal text, not inside code spans or fenced code blocks, or it will not render as math.

JSON ESCAPING
Write real newlines in strings as "\\n" and escape double quotes as "\\\"". In LaTeX, every backslash must be doubled: the command \\frac is written "\\\\frac" in the JSON source. Prefer triple-tilde code fences so you do not have to escape backticks.

EXAMPLE
\`\`\`json
{
  "decks": [{
    "name": "Calculus I",
    "description": "**Limits** and derivatives.\\n\\n- Definition of a limit\\n- Derivative rules",
    "cards": [
      { "front": "What is the derivative of $x^2$?\\n\\n*Hint: use the power rule.*", "back": "$$\\\\frac{d}{dx}x^2 = 2x$$\\n\\nBy the **power rule**.", "tags": ["derivatives"] }
    ]
  }],
  "quizzes": [{
    "title": "Derivatives quick check",
    "description": "One question at a time. **Markdown** and math are both supported.",
    "deck": "Calculus I",
    "shuffle": true,
    "questions": [
      { "type": "mcq", "prompt": "Which expression gives the derivative of $x^2$?", "choices": [{"id":"a","text":"$x$"},{"id":"b","text":"$2x$"},{"id":"c","text":"$x^3$"}], "correct": "b", "points": 1 },
      { "type": "numeric", "prompt": "Evaluate $f'(3)$ for $f(x)=x^2$.\\n\\nRound to 3 decimals.", "value": 6, "tolerance": 0.001 }
    ]
  }]
}
\`\`\`

Replace the material below with the notes, syllabus, or text you want turned into flashcards and quizzes, then return only the JSON.

Material:
<PASTE YOUR MATERIAL HERE>`;
