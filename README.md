# Contact Gain — project website

Project page for **"Do Better Videos Mean Better Robot Control? Offline Checkpoint Selection for Video-Action Models"**.

Live at: https://jessieeenotli.github.io/contact-gain/

The site is plain static HTML/CSS/JS (no build step). Every push to `main` redeploys it via GitHub Pages within a minute or two.

## Editing

| What | Where |
|---|---|
| Text, authors, links, BibTeX | `index.html` (search for `TODO` to find the placeholders: authors/affiliations, arXiv/Code/Checkpoints buttons, BibTeX) |
| Page styling | `assets/style.css` |
| Per-checkpoint numbers behind the interactive charts | `assets/data.js` (values from the paper; rank correlations shown are the paper's Table I) |
| Chart behaviour | `assets/app.js` |
| Figures | `assets/img/` (PNG + WebP) |
| Overview video and poster | `assets/video/` |

To preview locally, open `index.html` in a browser (no server needed), or run `python3 -m http.server` in this folder and visit http://localhost:8000.
