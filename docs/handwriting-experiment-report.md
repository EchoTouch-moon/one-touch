# Handwriting Experiment Validation Report

**Date:** 2025-05-25
**Device:** iPad + Apple Pencil
**Tester:** User
**Baseline Branch:** `codex/handwriting-experiment-baseline`

---

## Test Environment

- **Frontend:** Vite dev server with `--host` for LAN access
- **Backend:** Port 8001 (port 8000 occupied by another project)
- **Test Page:** `/handwriting-lab`
- **Login:** `admin` / `change-me`

---

## Branch A: `codex/handwriting-native-raf`

### Implementation

- rAF queue rendering
- PointerEvent `timeStamp` correction
- Near-point filtering, jump-point filtering
- Lightweight smoothing before stroke start
- Line width EMA low-pass filter
- 500ms delay after `pointerup` before export preview

### Test Results

| Metric | Rating | Notes |
|--------|--------|-------|
| Writing Smoothness | ✅ Good | Overall流畅 |
| Latency | ✅ Acceptable | No noticeable lag |
| Line Quality | ✅ Good | Smooth lines |
| Pen/Touch Distinction | ⚠️ Basic | Exists but needs manual toggle |

### Pen/Touch Separation

**Current Implementation:**
```typescript
const canDrawWithPointer = (event) => {
  if (!penOnly || acceptTouch) return true;
  return event.pointerType === 'pen';
};
```

- `penOnly=true` (default) + `acceptTouch=false` (default) → Only pen accepted
- User must click "Touch" button to enable touch input
- **Limitation:** Palm rejection is manual, not automatic during pen activity

### Feedback

> "效果还不错，但是好像没有做相关的手写笔与触控的区分？"

**Analysis:** The feature exists but is not enabled by default in `HandwritingLabPage` because `penOnly={false}` is set. The logic is present in `useCanvasPadController.ts`.

### Verdict

✅ **Recommended for further development**

---

## Branch B: `codex/handwriting-perfect-freehand`

### Implementation

- Uses `perfect-freehand@1.2.3` library
- Preserves raw `ink_data` point data
- Renders strokes as polygon outlines
- Retains existing undo/redo, preview export, legacy data loading

### Test Results

| Metric | Rating | Notes |
|--------|--------|-------|
| Writing Smoothness | ❌ Poor | Unusable for English writing |
| Line Quality | ❌ Poor | Severe stroke tapering |
| Suitability for English | ❌ Poor | Creates unwanted calligraphic effects |

### Feedback

> "这个方案比较一般，笔触会形成笔锋而且很严重，对于英语写作来说是不太好的"

**Analysis:** The `perfect-freehand` library generates polygon outlines with variable width based on speed/pressure, creating a calligraphic "brush stroke" effect. While visually interesting for artistic applications, this is inappropriate for:

- English handwriting practice
- Note-taking scenarios
- Clean, consistent line work

### Verdict

❌ **Not recommended for this use case**

The polygon outline approach fundamentally conflicts with the goal of clean, consistent handwriting for language learning.

---

## Branch D: `codex/handwriting-ipad-prediction`

### Implementation

- base/live dual canvas layers
- `desynchronized` 2D context
- `getPredictedEvents()` for predicted point rendering
- Enhanced pen/touch isolation (ignore touch when pen active)
- Strengthened `.touch-none` iPad touch isolation styles

### Test Results

| Metric | Rating | Notes |
|--------|--------|-------|
| Functionality | ❌ Broken | Cannot use at all |
| Stability | ❌ Critical | Blocking bugs |

### Feedback

> "这个方案有bug,完全无法使用"

### Verdict

❌ **Requires debugging before re-testing**

This branch needs investigation and fixes before it can be properly evaluated.

---

## Summary

| Branch | Approach | Verdict | Action |
|--------|----------|---------|--------|
| A: native-raf | rAF queue + filtering + smoothing | ✅ Recommended | Merge or continue development |
| B: perfect-freehand | Polygon outline rendering | ❌ Rejected | Close branch, not suitable for English writing |
| D: ipad-prediction | Dual canvas + predicted events | ❌ Blocked | Debug required before re-test |

---

## Recommendations

### Immediate Actions

1. **Merge Branch A** (`handwriting-native-raf`) as the production baseline
   - Solid foundation with good performance
   - Pen/touch distinction exists (needs UI improvement for discoverability)

2. **Close Branch B** (`handwriting-perfect-freehand`)
   - Fundamental mismatch with use case
   - Polygon outlines not suitable for English handwriting

3. **Debug Branch D** (`handwriting-ipad-prediction`)
   - Investigate the blocking bug
   - Re-test after fix
   - The dual-canvas + predicted events approach has potential for latency reduction

### Future Enhancements

For pen/touch isolation, consider implementing:

```typescript
// Auto palm rejection during pen activity
let penActiveTime = 0;

const handlePointerDown = (event) => {
  if (event.pointerType === 'pen') {
    penActiveTime = Date.now();
  }
  if (event.pointerType === 'touch' && Date.now() - penActiveTime < 500) {
    return; // Ignore touch within 500ms of pen activity
  }
  // ... rest of logic
};
```

This would provide automatic palm rejection without requiring manual "Touch" button toggle.

---

## Appendix: Test Setup Commands

```bash
# Backend (port 8001, due to 8000 occupied)
GLM_WORDS_DEBUG=true uv run uvicorn backend.main:app --port 8001 --host 0.0.0.0

# Frontend (with LAN access)
cd frontend && npm run dev -- --host

# Access
# Local: http://localhost:5173/handwriting-lab
# LAN:   http://192.168.31.107:5173/handwriting-lab
```

---

**Report generated:** 2025-05-25
