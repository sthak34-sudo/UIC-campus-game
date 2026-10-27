# UIC Campus Game

A realistic battle royale on the real University of Illinois Chicago campus, played in a web browser.
Squads of four. Built with three.js, Rapier, and Vite.

**Status:** The campus is walkable. Milestone 1 is practice combat: shooting, health, loot, and training dummies. See [`PLAN.md`](PLAN.md).

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173 . Click the view to capture the mouse. You start facing the library doors. Look to your right: the training dummies and loot crates are along the walkway. Left click shoots, hold the right mouse button to aim, C crouches, R reloads, E picks up a crate, Q uses a med kit, H damages you (practice).

The realistic body and a set of free (CC0) animations are both included, so the public build shows an animated human. If you also have a private `anims.glb` (Mixamo) in `client/public/models/private/`, the game uses that instead. That file is never committed.

> Unofficial fan project. Not affiliated with or endorsed by the University of Illinois Chicago.
