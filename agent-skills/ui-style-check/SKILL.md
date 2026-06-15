---
name: ui-style-check
description: Use when adding or modifying a UI component, style, interaction, or responsive layout - verifies alignment with existing component patterns, dark-mode tokens, and responsive breakpoints
---

# ui-style-check

Pre-merge guardrail for UI work. Run before claiming a UI change done.

This skill is for polishing and extending an existing product UI. It intentionally borrows only selected review heuristics from the broader `web-design-engineer` skill:

- Step 3a four positioning questions
- anti-cliché / anti-slop design filters
- five-dimension critique framework

It does **not** import the full six-step greenfield page-building workflow, v0 checkpoint process, or style-recipe system. Pinax work is usually iterative UI refinement on an existing product, not from-scratch page invention.

## 1. Local pattern first

1. Read 2-3 sibling components in the same module under `src/components/` or the same page/view for the local pattern (props shape, slot usage, naming, spacing density, state handling).
2. Reuse primitives in `src/components/` (button, input, modal, etc.) instead of duplicating markup.
3. Verify dark-mode tokens are used (no hard-coded colors); cross-check `src/styles/` for the canonical token names.
4. Verify responsive breakpoints match the existing components in the same view; do not introduce a new breakpoint without reason.
5. If the change is behaviorally new (new state, new interaction), add or update a UI-facing test under `src/__tests__/`.

## 2. Preflight: four positioning questions

Borrowed from the source skill's early positioning step, but adapted for existing-product UI work.
Before changing layout, hierarchy, or visual tone, answer these four questions in under 5 minutes. Tiny tweaks can do this mentally; non-trivial UI changes should state the answers explicitly.

1. `Narrative role`: is this surface an entry point, workbench, summary, editor, picker, transition, or transient feedback state?
2. `Viewing distance`: is it mainly scanned at phone distance, laptop distance, or wide desktop / projector distance? Does the density fit that distance?
3. `Visual temperature`: should it read as quiet, energized, authoritative, warm, somber, operational, immersive, editorial, or playful?
4. `Capacity check`: if you sketch the thumbnail mentally, does the content fit the layout, or will it overflow / collapse / look sparse?

The design choice must follow these answers. Do not pick styling in a vacuum.

## 3. Anti-cliche verification

Anti-cliché is not aesthetic snobbery. It protects product identity:

1. user wants the surface to be recognizable,
2. AI defaults average everything together,
3. averaged output erases identity into “generic AI page”.

So the only routine exception is: the brand or user explicitly wants that language.

Before calling the UI done, scan for these eight failure patterns. They are allowed only when the existing Pinax surface or the user explicitly calls for them.

1. Aggressive purple/pink/blue gradient as default “AI product” signal.
2. Rounded card plus colored left-border accent as generic dashboard decoration.
3. Emoji used as icon substitute or decorative filler.
4. Hand-drawn SVG scenes, faces, or object art that cheapen the product surface.
5. CSS silhouettes or fake product/scene stand-ins where a real asset or plain placeholder would be more honest.
6. Generic display typography choices used as if they were a design system by themselves.
7. Cyber-neon on near-black devtool cosplay that overwhelms the product’s actual tone.
8. Fabricated stats, testimonials, logo walls, or fake proof points in product UI or docs-facing surfaces.

For Pinax specifically:

- Prefer restrained, tool-like structure for work surfaces.
- Use distinctive visual moves only when they strengthen the current workflow, not to make a panel “feel designed”.
- If a section feels empty, fix composition, hierarchy, or spacing before adding filler elements.
- Prefer type, spacing, and proportion over extra badges, outlines, and ornamental separators.
- If assets or data are missing, use honest placeholders instead of fake product imagery, fake logos, or fabricated numbers.

## 4. Five-dimension self-critique

Run this self-check before claiming the UI task done:

- `Philosophy alignment`: does the change still look like Pinax, or did it drift into a generic template?
- `Visual hierarchy`: is the first read obvious? Can users tell primary action, supporting context, and secondary controls apart?
- `Craft quality`: are spacing, alignment, type scale, whitespace, contrast, and color count internally consistent?
- `Functionality`: does every element earn its place? If removed, would the workflow get worse?
- `Originality`: did the change avoid obvious AI UI defaults while staying coherent with the existing product?

Quick rubric cues:

- `Philosophy alignment`: do color, type, layout, and motion all agree, or are there foreign elements mixed in?
- `Visual hierarchy`: run the squint test. Title/body ratio should usually be at least `2.5x`; hero surfaces often need `4x-6x`.
- `Craft quality`: keep a consistent spacing system, usually a small repeatable scale; control color count; keep font families tight, usually no more than two.
- `Functionality`: run the deletion test. If removing an element does not hurt clarity or workflow, it probably should go.
- `Originality`: avoid cliché by default, but still look for one “unexpected but right” decision instead of settling for template output.

Output weighting for Pinax:

- Workbench / dashboard / editor surfaces: prioritize `Functionality`, `Craft quality`, then `Visual hierarchy`.
- Entry / narrative / showcase surfaces: prioritize `Visual hierarchy`, `Functionality`, then `Originality`.
- If clarity and novelty conflict on a dense operational screen, clarity wins.

If any dimension is weak, list:

1. what should stay,
2. the highest-severity fixes,
3. the top 3 quick wins if only 5 minutes remain.
