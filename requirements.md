Design for a modern mobile app UI concept for an AI-powered calorie and macro tracking app called “Calorix”.

Product idea:
Calorix is a free, faster, better alternative to apps like Cal AI. The core experience is camera-first and extremely efficient: the user opens the app, instantly sees a camera screen, takes a photo of food, closes the app, and the photo is processed in the cloud. When the analysis is complete, the user receives a push notification. Opening the notification or navigating to the Today screen shows the estimated calories, macros, and detected food items.

Core positioning:
Calorix should feel premium, serious, smooth, modern, fitness-focused, and minimal. It should not feel playful, childish, or like a generic diet app. It should feel like a polished AI fitness tool that someone would enjoy opening because of the design and animations.

Target user:
Fitness-focused users who want to build a lean body, track calories/macros, and avoid slow manual food logging. The user wants to log food in under 5 seconds.

Design direction:
Create a light-first mobile app design, but also show a dark mode version for at least the main dashboard or camera screen.

The design should combine:
- premium gym/fitness aesthetic
- minimal Apple-like clarity
- modern AI-product feeling
- smooth rounded UI
- strong contrast without being harsh on the eyes
- clean motion and loading states

Visual style:
Use a modern soft light theme instead of pure white.
Avoid outdated full white backgrounds. Use warm off-white, very light grey, or soft neutral surfaces.
For dark mode, avoid pure black. Use charcoal, graphite, or deep navy-black surfaces.

Suggested palette:
- Light background: soft off-white / light grey
- Dark background: graphite / charcoal / deep blue-black
- Primary text: near-black in light mode, near-white in dark mode
- Accent colors inspired by blue + cyan + green:
  - blue accent similar to #0000FF, but softened for UI use
  - cyan accent similar to #00FFFF, but slightly premium/less harsh
  - green accent similar to #00C853 or clean fitness green
Use these three colors as complementary accents, not as huge flat blocks.
Use gradients carefully, for example blue → cyan or cyan → green.
Use accents for macro progress, scan states, AI highlights, buttons, and charts.

Brand:
App name: Calorix
Possible tagline: “Snap. Track. Stay on target.”
Logo idea: modern abstract C, lens shape, macro ring, or calorie flame/lens hybrid. Avoid childish food icons.

Navigation:
Use a bottom navigation bar with 5 tabs, where Scan is the centered primary action because it is the core feature of the app and needs the quickest access.

Tab order:
1. Today
2. History
3. Scan
4. Goals
5. AI

The Scan tab should be visually emphasized as the central action:
- larger than the other nav items
- circular or pill-shaped floating button style
- blue/cyan/green accent glow or gradient
- instantly opens the camera
- always accessible from any main screen

Important:
The default landing screen should be Scan, not the dashboard.
The interaction should feel almost Snapchat-like in speed: open app, camera ready, take photo, done.

Screens to design:

1. Scan / Camera Home Screen
- Full-screen camera interface.
- Large premium capture button.
- Bottom navigation visible but minimal.
- Top controls: flash, gallery upload, settings/profile.
- Subtle scan frame or lens guide.
- Use blue/cyan/green accent glow carefully.
- After capture, show an instant smooth transition into a processing state.
- Include a skeleton/loading animation concept, shimmer, or clean AI-processing visual.
- Message: “Processing in cloud… we’ll notify you.”

2. Processing State / Notification
- Show a realistic push notification:
  “Calorix finished your meal scan”
  “Chicken rice bowl · 620 kcal”
- Include a small food thumbnail.
- Also design an in-app processing card with skeleton loading:
  - image placeholder shimmer
  - macro bars loading
  - confidence badge loading
- The loading animation should feel clean, satisfying, and premium.

3. Today Dashboard
- Show today’s calorie and macro progress.
- Example targets:
  - Calories: 2400 kcal
  - Protein: 170g
  - Carbs: 250g
  - Fat: 70g
- Show consumed vs target with a modern macro diagram.
- Use rings, progress bars, or clean animated cards.
- Use color system:
  - protein: blue
  - carbs: cyan
  - fat: green
  or another balanced mapping using blue/cyan/green.
- Include recently scanned meals as premium rounded cards.
- Meal card content:
  - food image
  - detected food/product name
  - confidence indicator
  - calories
  - protein/carbs/fat
  - time scanned
  - status: confirmed / needs review
- Main card example:
  “Chicken Rice Bowl”
  620 kcal
  48g protein, 72g carbs, 16g fat
  Confidence: 91%

4. Food Detail / Edit Screen
- Opens when tapping a scanned food card.
- Show original photo or product image.
- Show detected food/product name.
- Show nutrition values in editable fields:
  - calories
  - protein
  - carbs
  - fat
  - serving size
  - quantity
  - meal type
- Include Edit, Save, Delete, and Duplicate actions.
- Include “Not right?” correction action.
- Include future-ready button:
  “Ask AI to fix this”
- The app entity should feel CRUD-friendly:
  create, read, update, delete food entries easily.
- Editing should feel polished, not like a boring form.

5. History Screen
- Calendar/list hybrid.
- Show previous days with total calories and macro completion.
- Include weekly average and consistency/streak visual.
- Tapping a day opens all foods logged that day.
- Design should support long-term progress review.

6. Goals / Macro Setup Screen
- User can set:
  - calorie target
  - protein target
  - carbs target
  - fat target
- Include body goal options:
  - lose fat
  - maintain
  - build lean muscle
  - custom
- Include future weight tracking placeholder.
- Show progress diagrams and goal completion.
- Make this feel motivational but data-driven, not cheesy.

7. AI Chat Screen
- Future-ready chat interface.
- The user can ask:
  - “Adjust my macros for fat loss.”
  - “This scan is wrong, it was chicken and rice.”
  - “Set my protein target higher.”
  - “Help me plan today’s remaining macros.”
- AI suggestions should be able to update app entities after confirmation.
- Include confirmation cards like:
  “Update protein target to 180g?”
  “Correct meal to chicken rice bowl?”
- Make the chat feel integrated into the product, not like a separate chatbot.

Motion and interaction requirements:
- Use smooth micro-interactions.
- Include skeleton loading states.
- Include AI scan shimmer animation.
- Include satisfying progress ring animation.
- Include smooth card expansion from meal card to detail view.
- Include clean transition from camera capture to processing state.
- Design should be visually enjoyable enough that users want to open the app and interact with it.
- Avoid loud, gimmicky animations. Keep it premium, smooth, and purposeful.

UX principles:
- Speed first.
- User should be able to scan food in under 5 seconds.
- Manual editing should exist but not be the main flow.
- Camera should be the default screen.
- Today screen should make macro status instantly understandable.
- Low-confidence scans should be clearly marked and easy to correct.
- All important objects should support CRUD:
  food entries, meals, daily logs, goals, macro targets, weight logs.
- The Scan action should always be the fastest reachable interaction and should remain centered in the bottom navigation as the primary app action.