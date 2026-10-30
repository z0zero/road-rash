# Client-only static Next.js site on Vercel Hobby

The game is deployed on Vercel's free Hobby plan, which is why it is built with Next.js even though a browser game needs none of Next.js's server features. The whole game runs in the browser for a single player: Next.js is built as a static export, there are no accounts, online leaderboards, server functions or multiplayer, and saved data lives in the browser's localStorage. Adding a backend or multiplayer later means revisiting this decision, because the architecture is not prepared for either.
