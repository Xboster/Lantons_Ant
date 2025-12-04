## Live Project Link  
https://xboster.github.io/Lantons_Ant/

---

## Project Description  
This project is a visual simulation of **Langton’s Ant**, a cellular automaton that demonstrates how complex behavior can emerge from very simple rules. The ant moves on a grid, flipping cell colors and changing direction based on the current cell state, creating unexpected patterns over time.

This version is implemented in **p5.js** and includes interactive controls for experimenting with the simulation in real-time.

---

## Postmortem

### What Worked Well
- The chunk-based rendering system worked very well. Splitting the grid into chunks and tracking only “dirty” cells allowed a 4096×4096 grid to run efficiently without redrawing everything each frame.
- With one ant, the simulation could reach **about 1 million steps per second**, scaling roughly by dividing that speed among multiple ants.
- The step controls (Linear, Exponential, Unlimited) made it easy to visually observe phenomena like the highway period (e.g., 104 steps for a basic LR ant) and allowed more than one step per frame.
- Zooming, panning, and smooth camera-following made the simulation feel responsive and easy to explore.
- The GUI built with lil-gui worked well for dynamically creating, deleting, randomizing, and following ants.

### What Didn’t Work Well
- Left-click painting to change tiles didn’t feel particularly meaningful in practice.
- Once step counts exceeded around **100,000 steps per frame**, the simulation could no longer maintain a smooth framerate.
- The GUI becomes cluttered when many ants are created, making it harder to manage them.
- There is no way to save or load experiments, so interesting results must be recreated manually.

### What I Would Do Differently
- Separate simulation logic from rendering logic so camera movement and drawing are not tied to simulation speed or frame rate.
- Add rule presets and better validation to the rule editor.
- Implement save/load support for experiments.
- Improve layout and organization in the GUI to better handle large numbers of ants.


---

## Artistic Statement

I wanted to make my own Langton’s Ant project because I find cellular automata very interesting. Many of the versions I found online were missing features that I wanted to experiment with, so I decided to create my own implementation. This project let me explore how extremely simple rules can lead to complex and beautiful behavior. Watching structure emerge from chaos feels almost alive, and I wanted to give viewers a way to explore that themselves through interaction.

---

## Credits

### Libraries
- **p5.js** — Rendering and animation framework  
  https://p5js.org/
- **lil-gui** — UI controls  
  https://lil-gui.georgealways.com/

### Tools & Assistance
- **ChatGPT / AI Assistance** — Helped with generating and debugging parts of the code and writing documentation.
- **GitHub Pages** — Hosting the project

### Concepts
- Langton’s Ant — Originally devised by Chris Langton
