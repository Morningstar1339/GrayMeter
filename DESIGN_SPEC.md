# GrayMeter Design Specification

## Product Identity
- **Name:** GrayMeter
- **Tagline:** "Track fast. Analyze deep."
- **Type:** Supplement tracking & cognitive testing app for biohackers
- **Target Audience:** Biohackers, nootropic users, quantified-self enthusiasts
- **Platform:** React Native (Expo) — iOS, Android, Web

## Core Design Principles

### 1. Scientific, Not Wellness
- Dark mode by default (biohacker aesthetic)
- Clinical/laboratory color palette: deep blue-black background (#0B1426), cyan tint (#00D4FF)
- Charts and data, not illustrations
- Professional typography — technical feel, not friendly/consumer
- No rounded-corner "wellness app" softness

### 2. Information-Dense Dashboard
- Home screen must provide at-a-glance value immediately
- Dashboard stats card: today's supplements count, test count, current streak
- Recent test performance: latest score and 7-day average (per test type)
- Today's supplement log visible without navigation
- NO wall of identical generic buttons — clear visual hierarchy

### 3. Frictionless Logging
- "Log Supplement" is a primary action — visually prominent
- "Same as Yesterday" / "Repeat Yesterday's Supplements" quick-log button when relevant
- Supplement logging accessible in 1-2 taps from home
- Smart defaults and favorites

### 4. Clear Action Hierarchy
- **Primary actions** (prominent): Log Supplement, Take Test
- **Secondary actions** (organized grid): Activities, Sleep, Review, Analytics
- **Utility actions** (minimal footer): Schedules, Export, Help

### 5. Satisfying Testing Experience
- Cognitive tests should feel satisfying while maintaining scientific accuracy
- Reflexes test: bubble scale animations, ripple effects, combo system, haptic feedback
- Score animations: pulses on hits, shakes on misses
- Celebratory results screens with accuracy, hits, and best combo

### 6. Progressive Disclosure
- Simple overview on home, detailed drill-down on demand
- "Respect the user's intelligence" — show real data, not dumbed-down summaries

## Required UI Elements

### Home Screen (Dashboard)
- [ ] Dark background (#0B1426 or similar deep blue-black)
- [ ] App title "GrayMeter" with tagline "Track fast. Analyze deep."
- [ ] Dashboard stats card showing: supplements logged today, tests taken today, current streak
- [ ] Recent test performance card with score and weekly average
- [ ] Today's supplement log list with dosages
- [ ] Prominent "Log Supplement" button (primary action)
- [ ] Prominent "Take Test" button (primary action)
- [ ] Secondary action grid (Activities, Sleep, Review, Analytics)
- [ ] "Repeat Yesterday's Supplements" button (contextual, when applicable)
- [ ] Pull-to-refresh functionality
- [ ] No light mode by default

### Navigation
- [ ] Tab-based navigation (Expo Router)
- [ ] Clear active tab indicator
- [ ] Accessible navigation (ARIA roles, keyboard support)

### Supplement Logging
- [ ] Search/select supplement from comprehensive database
- [ ] Dosage input with proper units
- [ ] Quick-log for common supplements
- [ ] Success confirmation after logging
- [ ] View today's logs with edit/delete

### Cognitive Tests
- [ ] Test selection screen with available test types
- [ ] Reflexes test with interactive tap targets
- [ ] Visual feedback on interactions (animations, colors)
- [ ] Results screen showing score, accuracy, and comparison to history
- [ ] N-Back, Stroop, and other test types available

### Analytics/Insights
- [ ] Charts and data visualizations
- [ ] Correlation analysis between supplements and test scores
- [ ] Historical trends and learning curves
- [ ] Date range filtering
- [ ] Data export (CSV/JSON)

### Responsive Layout
- [ ] Mobile-first design (375px)
- [ ] Tablet adaptation
- [ ] Desktop adaptation (1200px+)
- [ ] Touch targets minimum 44px (iOS guideline)
- [ ] No horizontal overflow at any viewport

### Performance
- [ ] App loads in under 5 seconds
- [ ] Dashboard data loads without visible lag
- [ ] Animations run at 60fps
- [ ] No JavaScript console errors during normal usage
- [ ] Minimal network errors

## Visual Standards
- **Background:** Deep blue-black (#0B1426)
- **Primary accent:** Cyan (#00D4FF)
- **Text:** High contrast white/light gray on dark background
- **Cards:** Slightly lighter than background with subtle borders
- **Buttons (primary):** Cyan accent, clear and prominent
- **Buttons (secondary):** Subtle, lower visual weight
- **Typography:** Technical/monospace for data, clean sans-serif for UI
- **Icons:** Functional, not decorative

## Anti-Patterns (What It Should NOT Look Like)
- ❌ Light mode / white backgrounds
- ❌ Soft pastel colors
- ❌ Rounded, friendly illustrations
- ❌ Generic wellness app aesthetic
- ❌ Wall of identical buttons with no data
- ❌ Hidden or buried data — users want to SEE their numbers
- ❌ Slow, laggy interactions
- ❌ "Consumer health" feel — this is for serious biohackers
