---
name: kimi-skin-theme
description: Create, modify, diagnose, and visually iterate themes for kimi-skin. Use when Kimi needs to design a new theme, adjust an existing theme, follow a visual reference, fix an effect that is not appearing, or review theme completeness.
---

# Kimi Skin Theme

## Workflow

1. Locate the kimi-skin root and verify `name: kimi-skin` in `package.json`.
2. Determine whether the task is creation, modification, diagnosis, or read-only review.
3. Inspect the target theme, current runtime status, and user references before changing files.
4. Present a concrete visual direction and scope; wait for approval before implementation.
5. For a new theme, copy `themes/_template/` to a new `themes/<theme-id>/`. For an existing theme, edit only the requested theme directory.
6. Run `validate` and `check-theme` with the kimi-skin CLI after each coherent implementation pass.
7. Use the real Kimi interface to evaluate results. Obtain permission before applying, restoring, generating images, or fetching external assets.
8. Iterate in small visual steps, then report the verified result and remaining gaps.

## Theme rules

- Produce themes under `themes/<theme-id>/` and never overwrite an existing theme directory.
- Use the template and CLI provided by the local kimi-skin project; do not reproduce their implementation inside this Skill.
- Keep `DESIGN.md` aligned with the visual direction and record generated or external assets when used.
- Themes are CSS-only by default. When a requested theme needs interaction, use only the declarative capabilities documented in `themes/README.md`; never add theme-authored JavaScript.
- Keep optional interactions out of the shared template unless the user explicitly asks for them. Document each enabled interaction and its visual meaning in that theme's own README.
- Do not use Dark Side as the default template or inherit its visual style unless requested.
- Do not modify Kimi.app, `src/`, `macos/`, other themes, or original user assets.
- Do not read or record chat content, credentials, or other private data.
- Treat harness, compatibility, CDP, process, and validator failures as system issues; report them instead of changing system code.
- Do not claim coverage for pages or states that were not actually inspected.

## Output

Include:

- A complete theme in `themes/<theme-id>/`
- Updated design and asset notes when applicable
- Validation and visual inspection results
- Known limitations and unverified states

## References

- Read [pitfalls.md](references/pitfalls.md) before writing or editing theme CSS; it lists the mandatory rules learned from verified theme work.
- Read [visual-iteration.md](references/visual-iteration.md) for complete theme directions, major reference-based changes, effects that do not appear, or systematic visual QA.
- Do not load the reference for small, explicit local edits.
