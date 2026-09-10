---
name: press-where-a-person-presses
description: Drive a canvas gesture at the point a person would use (the middle of a page card, over its picture), not at whatever point makes the test pass
metadata:
  type: feedback
---

A gesture test presses where a person presses. On 2026-09-10 the page tray's
hold-and-slide did nothing under a mouse when the press landed on the card's
picture, because an `<img>` starts the browser's own image drag and that
cancels the pointer stream part-way. A helper that pressed the page number
below the picture passed, and would have shipped the broken gesture behind a
green test. The picture is most of the card, so it is where a teacher on a
laptop presses.

**Why:** the moment a test is moved to a point where it passes, it stops
measuring the thing a child or teacher does. Same family as
[[canvas-scale-hides-child-bugs]]: a gate is only as good as where it looks.

**How to apply:** when a pointer test fails, find out why at the natural
point before moving the point. Watch for `<img>` (and anything draggable)
inside a control that handles pointer down/move/up. See
[[verify-a-gate-by-breaking-it]].
