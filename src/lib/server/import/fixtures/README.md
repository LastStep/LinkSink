# Import fixtures

Small files in the exact shape each tool writes, for the importer's unit tests (T-0012). The links in them are
made up; the structure, attributes, units, line endings and escaping follow each writer, as the researcher's
report M-2026-10-25-fffd0b0a quotes them:

| File | Shape from | Grade |
|---|---|---|
| `chrome.html` | Chromium's writer, `chrome/browser/bookmarks/bookmark_html_writer.cc`: header lines, CRLF, `<DT><H3 ADD_DATE LAST_MODIFIED PERSONAL_TOOLBAR_FOLDER="true">`, links with HREF, ADD_DATE (seconds) and ICON only | source code |
| `firefox.html` | Firefox's writer, `toolkit/components/places/BookmarkHTMLUtils.sys.mjs`: the CSP meta line, `<H1>Bookmarks Menu</H1>`, LF, ADD_DATE and LAST_MODIFIED in seconds, ICON_URI, SHORTCUTURL, TAGS, `<HR>`, a `place:` query, PERSONAL_TOOLBAR_FOLDER and UNFILED_BOOKMARKS_FOLDER, no `<DD>` | source code; the comma between Firefox tags is assumed |
| `raindrop.html` | Real Raindrop sample lines quoted on discourse.devontechnologies.com and dev.to: `Raindrop.io Bookmarks` title, nested `<DT><H3>` collections, TAGS (also empty), DATA-COVER, LAST_MODIFIED | real export lines; the comma between tags is assumed |
| `pinboard.html` | pinefore.com's description of Pinboard's export: PRIVATE and TOREAD "0"/"1", TAGS comma-separated, `<DD>` with no closing tag, seconds | secondary source |
| `linkding.html` | linkding's `bookmarks/services/exporter.py`: its line order, `\n\r` line joins, comma-joined TAGS, the `linkding:bookmarks.archived` tag, `<DD>` of description plus `[linkding-notes]...[/linkding-notes]` | source code |
| `pocket.csv`, `pocket-cursor.csv` | Karakeep's Pocket parser and tests: header `title,url,time_added,tags,status`, tags split on `\|`, status `unread`/`archive`; the extra `cursor` column some exports carry (codeberg wallaback_pocket_csv_import issue 1); seconds assumed | secondary sources |

Edge cases added on purpose: entities and markup in titles and notes, a nested folder, the same address twice, a
tracker parameter, links that are not web addresses, rows with no address, a quoted CSV field over two lines.
