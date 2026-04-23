# Teammate Branch Merge Playbook

**Context.** `feat/only-super-agent` is owned by a non-technical teammate (Ellie, `@zizizizazaza`). She periodically pushes large batches of UI commits to that branch. Some commits include:

- `revert` commits that undo bug fixes we already shipped on `dev`
- Mock/demo data that would overwrite real user data if blind-merged
- TOC and layout changes that reintroduce layout bugs we already fixed
- Use-before-declare and duplicate variable declarations

A naive `git merge origin/feat/only-super-agent` into `dev` will silently lose bug fixes. This playbook prevents that.

## Core Principle

**Never merge the teammate's branch directly into `dev`. Always cherry-pick her *new* commits into an isolated integration branch first, resolve conflicts manually, verify, then fast-forward to `dev`.**

---

## Known Bug Fixes That Must Survive

If any of these patterns disappear after the merge, the merge is wrong — roll back and investigate.

### Frontend — `src/components/SuperAgentChat.tsx`

| Fix | What to look for |
|-----|------------------|
| `effectiveSid` for A→B→A session restore | `const effectiveSid = initialSessionId \|\| sessionStorage.getItem(SA_SID_KEY);` — must appear in 3 `useState` initializers + `restoredFromPendingRef` |
| `streamStillActive` in history fetch | Block detecting mid-flight streams from `lastHistoryMsg.role === 'user'` or empty assistant content; injects streaming placeholder |
| `setThinkingProcesses` merge-not-overwrite | `setThinkingProcesses(prev => { const merged = { ...prev, ...restoredThinking }; ... })` — must NOT be `setThinkingProcesses(restoredThinking)` |
| `startTime` recovery from last user `createdAt` | Loop scanning `history` backward for last `role === 'user'` with valid `createdAt` |
| `findIndex` for streaming message in initial-send useEffect | `messages.findIndex(m => m.role === 'assistant' && m.isStreaming)` — NOT hardcoded index |
| Extended follow-up questions regex | Must include `持续跟踪`, `关键问题`, `延伸思考`, `延伸问题` keywords |
| Flex sticky TOC layout | Container `max-w-[1380px]` + `flex items-start gap-6 xl:gap-8`; TOC is `<aside className="... sticky">` — NOT `absolute left-3` floating |
| TS cast in standalone Roundtable panel condition | `(chatMode as string) === 'roundtable'` — keep the cast even if teammate removes it (outer condition narrows type) |
| Lite-mode amber banner | `{msg.liteMode && ...}` block above the view tabs |
| Docs/Web view tabs | Per-message tabs when `htmlReports[i] \|\| htmlGenerating[i]` |

### Frontend — `src/components/SuperAgentHome.tsx`

| Fix | What to look for |
|-----|------------------|
| `EventsCalendar` gated to Web3 only | `{!selectedAgent && domain === 'web3' && <EventsCalendar ... />}` — stocks mode must not show crypto events |

### Frontend — `src/utils/markdown.tsx`

| Fix | What to look for |
|-----|------------------|
| Trailing citation extraction | `extractTrailingCitations`, `parseLineWithEndCitations`, `stripCitationsFromHeading` helpers — strip `[label](url)` from line end and render as badges |
| Table overflow | Outer `overflow-visible`, inner `overflow-x-auto [overflow-y:clip]` — prevents tooltip clipping |

### Backend — `server/src/socket/index.ts`

| Fix | What to look for |
|-----|------------------|
| WebSocket rate limiter | `socketRateLimiter` Map + `max 3 msgs / 10s` check at top of `agent:chat` handler |
| Orphan session sweeper | `setInterval` every 5 min cleaning `activeChatSessions` entries older than 30 min via `chatSessionStartTimes` |
| Guest WS auth | Accepts `guestId` from handshake when no token; synthesizes `userId = 'guest:{guestId}'` |
| Clean synthesis fallback | `buildLocalSynthesisFallback` — short human message, NEVER leaks raw `contextString` or prompt |

### Backend — `server/src/routes/admin.ts`

| Fix | What to look for |
|-----|------------------|
| Admin plan override | `PATCH /api/admin/users/:id/plan` — admin-only, sets `plan` to `free/pro/max` without Stripe |

### Backend — `server/src/middleware/auth.ts`

| Fix | What to look for |
|-----|------------------|
| JWKS proxy + browser UA | `undiciFetch` with `ProxyAgent` if `HTTPS_PROXY` set, plus `BROWSER_UA` to bypass Vercel bot detection |

---

## Teammate's Recurring Anti-patterns

Expect these. Don't panic, just handle them.

1. **`revert` commits** that undo our fixes. The `dadfec7 revert: restore frontend UI to pre-merge version` commit on 2026-04-21 wiped ~15 fixes at once. When her branch has a revert in its history, treat the whole branch as suspicious.

2. **Duplicate `const` declarations** — she has introduced `const MAX_STAGE = 4; const STEP_MS = 900;` twice in the same scope. TS flags it as `TS2451: Cannot redeclare block-scoped variable`. Keep only the declaration that precedes `fitDelay` usage.

3. **TOC changed to `absolute left-3` floating** — we switched to flex sticky (commit `e07f86e`) because floating TOC overlaps content when Sources/Thinking panels open. Always reject her floating variant; keep ours.

4. **Mock data overrides real data** — `buildDemoRtFields()` in SuperAgentChat.tsx hard-codes 7 fake analysts + fake reasonings. When restoring history, her code calls this with `...buildDemoRtFields()` spread last, overwriting any real session data. Not a bug we can fix without a bigger refactor; just know that history view shows demo content, not real output.

5. **Domain gates missing on Web3-only widgets** — she sometimes re-adds `EventsCalendar` / `CryptoTrending` at the home root without the `domain === 'web3'` check. Always re-apply the gate.

---

## Integration Playbook

### 1. Prep

```bash
# Commit any in-progress local work first — don't mix it with integration conflicts
git status
git add <files> && git commit -m "..."

# Fetch latest from origin
git fetch origin
git log origin/feat/only-super-agent --oneline -20
```

### 2. Identify her new commits

Find the newest commit from her branch that is already in `dev`, then list everything newer:

```bash
# List commits on her branch that are NOT yet on dev
git log dev..origin/feat/only-super-agent --oneline
```

### 3. Create isolated integration branch

Naming convention: `integrate-teammate-<shortsha>` or `integrate-teammate-batch<N>`.

```bash
git checkout dev
git checkout -b integrate-teammate-batchN
```

### 4. Cherry-pick her new commits in chronological order (oldest first)

```bash
# Example: 7 new commits
git cherry-pick <sha-oldest> <sha-2> <sha-3> ... <sha-newest>
```

If a cherry-pick fails with conflicts, `git` will pause. Resolve with the decision tree below, then:

```bash
git add <resolved-files>
GIT_EDITOR=true git cherry-pick --continue
```

### 5. Conflict resolution decision tree

When you hit a `<<<<<<< HEAD` / `=======` / `>>>>>>>` block:

```
Is this a known bug-fix line (see tables above)?
  YES → keep HEAD, drop teammate's version
  NO  → is it additive (both sides added different code at same spot)?
    YES → keep BOTH, merge them in order (HEAD first, teammate second, or logical flow)
    NO  → is teammate adding a new feature on top of a fix we care about?
      YES → restructure to keep our fix's skeleton + add her feature into it
            (e.g. the chat title header case — we kept flex-sticky TOC and inserted
             her title bar ABOVE it instead of adopting her whole layout)
      NO  → favor teammate's version (it's a pure UI/UX improvement)
```

### 6. Clean up regressions teammate introduced

Before declaring victory, grep for:

```bash
# Duplicate const declarations — TS2451
git diff dev..HEAD -- src/components/SuperAgentChat.tsx | grep '^+' | grep -E 'const (MAX_STAGE|STEP_MS|FADE_MS|TOC_)'

# Reintroduced ml-[228px] fixed offsets
git diff dev..HEAD -- src/components/SuperAgentChat.tsx | grep -E 'ml-\[228px\]|absolute left-3'

# Missing domain gate on EventsCalendar
git diff dev..HEAD -- src/components/SuperAgentHome.tsx | grep -E 'EventsCalendar'
```

### 7. Verify compilation

```bash
# Count errors on integration branch
npx tsc --noEmit 2>&1 | grep -E '^(src|server/src|capacitor)' | sort -u | wc -l

# Compare to dev — must be equal or lower (pre-existing errors don't count)
git stash -u
git checkout dev
npx tsc --noEmit 2>&1 | grep -E '^(src|server/src|capacitor)' | sort -u | wc -l
git checkout integrate-teammate-batchN
git stash pop
```

If integration branch has MORE errors than dev, you introduced a regression — go find and fix it before merging.

### 8. Fast-forward merge back to dev

```bash
git checkout dev
git merge integrate-teammate-batchN --ff-only
git push origin dev
```

Never create a merge commit. Fast-forward only — if `--ff-only` fails, your integration branch has diverged and you need to rebase it on latest dev first.

### 9. Cleanup

```bash
git branch -d integrate-teammate-batchN
```

Leave `backup-before-teammate-merge` branches alone until you're sure the integration is stable in production for a few days.

---

## Successful Integrations (reverse chronological)

- **2026-04-23** — `0cedd60` (my work) + `5f6b58d..b046478` (7 teammate commits: Web3DotWave, chat two-column split, title to left col, Loka's Computer floating cards, compact follow-up input, Workbench UX stepper, Developers entry). 4 conflicts in SuperAgentChat, 1 in AnimStyles. Also rewrote `ApiLanding.tsx` to mirror `skill.md` with asksurf-style layout.
- **2026-04-22** — `4dce43c` cherry-picked clean (compact modal welcome picker + neon Web3 theme). No conflicts.
- **2026-04-21** — First `integrate-teammate-feat` merge resolving 4 conflicts across SuperAgentChat (roundtable UI, actions row), SuperAgentHome (Stocks/Web3 toggle), constants.tsx (USE_CASES domain field). Added `domain === 'web3'` gate to EventsCalendar.

---

## If in Doubt

Ask the user. Better to ask one extra question than silently wipe a bug fix and discover it in production.
