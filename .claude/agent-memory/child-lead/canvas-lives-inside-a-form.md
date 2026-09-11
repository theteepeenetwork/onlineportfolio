---
name: canvas-lives-inside-a-form
description: DrawingCanvas is rendered inside the template builder's and the hand-in's <form>; a dialog inside it must not be a <form>, and Enter in its inputs must be handled or it submits the template
metadata:
  type: project
---

Anything rendered inside `DrawingCanvas` is inside a `<form>`: the
ActivityBuilder's template form (teacher) and the response form (child). A
dialog added to the canvas must therefore NOT use its own `<form>`, and any
`<input>` in it needs Enter handled with `preventDefault()` — otherwise Enter
(or a submit button) submits the OUTER form, which closes the builder and
resets the template page. Seen building the web-link dialog on 2026-09-10: the
first version used a nested form and the e2e found the builder gone and the
title empty.

**Why:** implicit submission finds the nearest form owner, and a nested form is
invalid HTML whose behaviour under React is not something to rely on.

**How to apply:** for any new canvas dialog, use a `div role="dialog"`, buttons
of `type="button"`, and an `onKeyDown` that turns Enter into your own submit.
Add an e2e that presses Enter in the field and asserts "Save template" is still
on screen. See [[ask-what-the-repo-already-decided]].
