# 🦐 krillion.io

> **The Reverse-Trivia Oceanic Dive Puzzle Game**
> 
> *A client-side re-creation of the hit web game [krillion.io](https://krillion.io/). Dive your submarine toward the Hadal Trench (7,000m) by discovering the most obscure valid answers.*

---

## 🌊 Game Concept & Core Philosophy

Traditional trivia games reward players for knowing common, obvious answers. **krillion.io flips trivia on its head:**
- You are presented with **7 sequential trivia and word category prompts** per dive.
- Each prompt gives you **25 seconds** to input a valid open-ended answer.
- Correct answers are scored based on **rarity (obscurity)**: common answers barely scratch the surface, while deep-cut and apex obscure answers propel your submarine thousands of meters down into the oceanic abyss.
- Play an **infinite number of dives** with no daily locks, powered by an intelligent LRU shuffle bag preventing recent prompt repetition.

---

## 🎮 Gameplay Mechanics

1. **7-Prompt Dive Session**: Each session consists of exactly 7 prompts selected from a catalog of 40+ curated trivia categories (Science, Geography, Cinema, Literature, Music, and more).
2. **25-Second Active Countdown**: Active circular countdown ring with drift-free timestamp-delta tracking. If the timer expires, 0 points and 0m depth are recorded and the session advances.
3. **Open-Ended Text Input**: Type freely into the autofocused text input. Submissions are processed through a multi-pass normalization engine (stripping diacritics, case-folding, removing articles/punctuation, mapping abbreviations, and tolerating bounded typos).
4. **Try-Again on Rejection**: Submitting an unrecognized answer triggers a non-blocking shake tremor and warning sound, leaving the timer ticking and the input focused so you can keep trying!
5. **Prompt Lock on Acceptance**: The first valid answer accepted immediately locks the prompt, awards depth, plays a musical chime, and transitions to the next prompt after a brief reveal.
6. **Summary Modal & Apex Reveal**: At the end of 7 prompts, review your complete dive report, final depth, diver rank, and the apex **"One in a Krillion"** answer reveal for each prompt.
7. **Spoiler-Free Share Grid**: Copy an emoji grid summarizing your dive achievements directly to your clipboard.
8. **Infinite Replay**: Hit **"Dive Again"** to instantly reset the submarine and begin a fresh 7-question voyage!

---

## 🏆 Rarity Tiers & Depth Scoring

Depth gained is directly calculated from tier points: $\Delta D = \text{Points} \times 10\text{m}$.

| Tier | Points | Depth Bonus | Obscurity Level | Example (Chemical Elements) | Badge Class |
|---|:---:|:---:|---|---|---|
| **Plankton** | 10 pts | +100 m | Most common valid answers | Gold, Iron, Oxygen | `.tier-plankton` |
| **Too Clever** | 15 pts | +150 m | Well-known / obvious trivia | Hydrogen, Carbon, Helium | `.tier-too-clever` |
| **Schooler** | 30 pts | +300 m | Intermediate knowledge | Uranium, Mercury, Tin | `.tier-schooler` |
| **Rare** | 60 pts | +600 m | Specialized knowledge | Titanium, Tungsten, Argon | `.tier-rare` |
| **Deep Cut** | 85 pts | +850 m | Obscure trivia | Gallium, Yttrium, Astatine | `.tier-deep-cut` |
| **One in a Krillion** | 100 pts | +1,000 m | Apex obscure answer | Praseodymium, Lutetium | `.tier-one-in-a-krillion` |

*Theoretical Maximum Depth*: $7 \times 1,000\text{m} = \mathbf{7,000\text{m}}$ (The Hadal Trench!).

---

## 🌊 Oceanic Zones & Diver Titles

As your submarine plunges deeper, the visual interface shifts through 5 oceanic zones with custom CSS gradients and lighting:

| Depth Range | Oceanic Zone | Diver Rank Title |
|---|---|---|
| **0 m – 199 m** | Sunlight Zone (*Epipelagic*) | Surface Swimmer |
| **200 m – 999 m** | Twilight Zone (*Mesopelagic*) | Coral Explorer |
| **1,000 m – 2,499 m** | Midnight Zone (*Bathypelagic*) | Twilight Diver |
| **2,500 m – 3,999 m** | Midnight Zone (*Bathypelagic*) | Bathypelagic Scout |
| **4,000 m – 5,999 m** | The Abyss (*Abyssopelagic*) | Abyssal Voyager |
| **6,000 m – 7,000 m** | The Hadal Trench (*Hadalpelagic*) | **Hadal Trench Legend** |

---

## 🔊 Procedural Web Audio Engine

The game synthesizes all sound effects procedurally via the native browser **Web Audio API** with zero external audio assets:
- **Sonar Ping**: Pure sine oscillator with exponential decay reverberation.
- **Dive Swoosh**: Low-pass filtered descending sweep on depth gains.
- **Urgent Ticking**: Pitch-shifted ticks during the final 5 seconds of countdown.
- **Obscurity Chimes**: 6 distinct harmonious musical intervals mapped to the 6 rarity tiers.
- **Dissonant Buzzer**: Low sawtooth waveform on invalid answers.
- **Victory Fanfare**: Arpeggiated celebratory chord sequence upon dive completion.
- Fully compliant with browser autoplay policies (resumes on first user gesture) and includes a persistent mute toggle button.

---

## 🚀 Running the Game Locally

### Option 1: Zero-Dependency Static Server (Recommended)
Using the included pure Node.js static server:
```bash
./scripts/run.sh
# or
node scripts/serve.mjs --port 8000
```
Open **`http://localhost:8000`** in any modern web browser.

### Option 2: Python HTTP Server
```bash
python3 -m http.server 8000
```

*Note on Direct File Opening*: Opening `index.html` via `file://` directly is restricted by browser security policies because ES Modules (`<script type="module">`) require HTTP/HTTPS origin boundaries.

---

## 🧪 Running Automated Tests

All tests run offline using Node.js v24 native test runner with **zero external npm dependencies**:

### Unit & Integration Tests
```bash
./scripts/test.sh
# or
npm test
```
Executes all unit suites (`normalizer`, `scoring`, `timer`, `session`, `catalog`, `audio`, `depth-gauge`, `replay`, `ui`) in under 500ms.

### Dual-Track E2E Test Suite (Tiers 1–4)
```bash
node tests/e2e/e2e-runner.mjs
```
Executes 271 comprehensive automated tests across all 24 features:
- **Tier 1**: Feature Coverage (120 tests)
- **Tier 2**: Boundary & Corner Cases (120 tests)
- **Tier 3**: Cross-Feature Combinations (26 tests)
- **Tier 4**: Real-World Play Sessions (5 full dives)

---

## 📁 Project Architecture & Layout

```
krillion/
├── index.html                 # Semantic single-page application layout
├── package.json               # Package metadata and test scripts
├── README.md                  # Comprehensive game documentation
├── scripts/
│   ├── serve.mjs              # Zero-dependency local static HTTP server
│   ├── run.sh                 # Launcher script for local server
│   └── test.sh                # Test suite runner script
├── src/
│   ├── css/
│   │   ├── reset.css          # Modern box-sizing & element reset
│   │   ├── ocean-theme.css    # 5 Oceanic zone gradient variables & bioluminescence
│   │   ├── components.css     # HUD, Depth gauge, SVG timer, cards, badges, modal
│   │   └── animations.css     # Keyframes for bubbles, dive plunge, rejection shake
│   ├── data/
│   │   └── questions.js       # Curated 40+ prompt catalog with 6-tier answers
│   └── js/
│       ├── app.js             # Application controller & DOM event coordinator
│       ├── audio.js           # Procedural Web Audio API sound synthesis engine
│       ├── depth-gauge.js     # Animated depth track & submarine positioning
│       ├── normalizer.js      # Input text normalization & fuzzy typo tolerance
│       ├── scoring.js         # Obscurity scoring, rarity tiers, zones & titles
│       ├── session.js         # 7-question state machine & LRU shuffle bag
│       ├── storage.js         # Persistent local best depth & stats adapter
│       └── timer.js           # Drift-free 25-second countdown timer
└── tests/
    ├── helpers/
    │   └── dom-mock.mjs       # Zero-dependency headless DOM mock environment
    ├── normalizer.test.mjs    # Normalization & typo matching tests
    ├── scoring.test.mjs       # Rarity scoring & zone progression tests
    ├── timer.test.mjs         # QuestionTimer timestamp delta & mock timer tests
    ├── session.test.mjs       # SessionManager 7-question flow tests
    ├── replay.test.mjs        # Infinite replay & LRU shuffle bag tests
    ├── catalog.test.mjs       # Catalog integrity & tier correctness tests
    ├── audio.test.mjs         # SoundManager Web Audio synthesis tests
    ├── depth-gauge.test.mjs   # DepthGauge DOM calculation tests
    ├── ui.test.mjs            # Full UI integration & controller interaction tests
    └── e2e/                   # Master requirement-driven dual-track E2E suite
```

---

## 📜 License
MIT
