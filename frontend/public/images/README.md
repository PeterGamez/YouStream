# Lobby images

Replace these files to customize the homepage artwork:

- `hero-cinema.jpg`: large hero background
- `room-film.jpg`, `room-music.jpg`, and `room-series.jpg`: rotating room card artwork selected by media type
- `room-custom.jpg`: artwork used for rooms with no video; additional eligible artwork is selected by room ID

These files are static frontend assets, not database records. Keep private or
user-uploaded media in the backend upload flow instead.

Keep the filenames to swap images without changing code. If you use different
filenames, update the paths in `src/app/page.module.css` and `src/app/page.tsx`.