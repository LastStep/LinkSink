---
id: F-web-mvp   # a one-pager; every field and how to fill it: skill workflow:feature
title: Paste any link and find it again later, organised my way, from my phone or my laptop
status: approved
lane: full
design_anchor: none yet
created: 2026-10-24
approved: 2026-10-24
labels:
  workflow.milestone: MVP
---

# Paste any link and find it again later, organised my way, from my phone or my laptop

**One sentence:** I can save any link in one paste (or one share from my phone); LinkSink fills in its title, source
and media type by itself, I add tags, projects, a status or priority if I want, and I find it again in seconds from
any device.

## Why now

There is no app yet; this is the app. Links I find today end up scattered across chats, notes and browser tabs, and
the tools that could hold them either organise them poorly for how I think (none of the eleven surveyed has separate
source, media, tags and projects), are heavy to host, or have shut down and taken people's links with them (Pocket,
Omnivore).

## What the person sees

**First visit.** I open my LinkSink address, create my account with my email and a password, and confirm my email
from the message it sends. After that, sign-up is closed: it is my app. I stay signed in on each device. I can import
the bookmarks I already have (a browser's bookmarks file, or an export from Raindrop, Pocket and the like): folders
become projects, their tags become tags, duplicates are skipped, and details fill in over the next minutes.

**Saving on a laptop.** The app opens to my links, newest first. I copy a link anywhere and press Ctrl/Cmd+V in the
app, with nothing to click first. The link appears at the top of the list instantly, showing its address; within a
second or two its title, site icon, preview image, source and media type fill in. If I paste a link I already saved,
it tells me so and shows me the one I have, instead of making a second copy.

**Saving on my phone.** On iPhone I tap Share in Safari, YouTube or any app, then "Save to LinkSink" (an iOS Shortcut
I installed once from the settings page), and it is saved without opening anything. On Android I share to the
installed LinkSink app. I can also open the app and paste into the box at the top.

**What each link holds.** Saving a YouTube video, I see:
- **Title**: the video's title, filled in by itself; I can change it, and a later refresh never undoes my change.
- **Source: YouTube**, filled in by itself (youtube.com and youtu.be both count as YouTube). I can change it, and if I
  rename a source once (say "Hacker News" for news.ycombinator.com), every later link from that site uses my name.
- **Media: Video**, filled in by itself where LinkSink can tell (Video, Article, Post, Repo, Podcast, Image, PDF, or
  Page when it cannot tell). I can change it.
- **Tags: ai, recommendations**, which I add: free words, typed to find or create, as many as I like.
- **Projects**: collections I create and name (each with a colour and an optional description); a link can be in
  several.
- **Status** (to read, in progress, done) and **Priority** (low, medium, high), both optional and empty unless I set
  them.
- **Description**: starts as the page's own summary when it has one; I can rewrite it, and my text is never
  overwritten.
- **Notes**: my own longer thoughts.
- Kept for me without asking: when I saved it, last edited it and last opened it; where it came from (paste, phone
  share, import, API); the site's name, the author or channel, its publish date and a video's length when the site
  gives them; the preview image and site icon; and when its details were fetched.

**Organising quickly.** From a link I open a small picker to set its tags, projects, status and priority, all from the
keyboard on a laptop. I can select several links and set any of these on all of them at once. Links with no tags and no
project wait in **Unsorted**, my inbox, until I get to them.

**Archiving.** When I am done with a link but want to keep it, I archive it: it leaves my main list and keeps
everything. Archived links have their own view, I can bring any back, and search can include them with a toggle.
Deleting is separate, for links I want gone (with undo).

**Finding.** A search box searches titles, addresses, descriptions, notes, tags and projects as I type. Beside it,
filters for Source, Media, Tags, Projects, Status and Priority: picking two values in one filter shows links with
either; adding another filter narrows the results; Tags has an any/all switch so I can ask for links tagged both `ai`
and `recommendations`. My filters stay in the address, so I can bookmark a view. On a laptop, `/` jumps to search, `n`
to the paste box, arrows move through links, Enter opens one, and Ctrl/Cmd+K opens a command palette (add, search,
jump to a project, tag or source).

**Each link.** Tapping opens the site. A menu (or a swipe on phone) lets me edit it, change its tags and projects,
copy the link, archive it, or delete it (with undo).

**Feel.** It opens instantly on a phone, even with no connection: every device keeps a full copy of my links, so I
can search, save, organise, edit, archive and delete offline, and everything syncs to my other devices when I am back
online (ADR-0001). A small badge shows if anything has not synced yet. On iPhone it asks to be added to the Home
Screen, which keeps the copy safe from Safari's 7-day cleanup. Signing out wipes the copy from that device, and from
settings I can see my signed-in devices and sign any of them out. Every tap and keystroke answers at once, with soft
motion. It is designed for the phone first and for a wide screen too (a side panel of projects and filters on
desktop), with a light and a dark theme. The look is chosen with the taste-skill design process: I am shown directions
and pick one before the screens are built.

**Keeping my data.** From settings I can download all my links with everything on them (a standard bookmarks file any
browser or bookmarking tool can import, and a full JSON copy). The VPS backs everything up continuously.

## Rules it introduces or changes

The project has no design page yet; these are proposed here and move to a design page once approved:
- A link is saved once per address: addresses are compared after removing tracking bits (utm_*, fbclid and the
  like), the `#` part, `www.` and a trailing slash.
- A link has exactly one Source and one Media (both filled in automatically, both editable), any number of Tags and
  Projects, and at most one Status and one Priority (both optional).
- Status values: to read, in progress, done. Priority values: low, medium, high.
- Automatic values never overwrite what I set by hand: once I edit a title, description, source or media, a refresh
  of the page's details leaves it alone.
- Filtering: within one filter, any of the picked values; across filters, all must match; Tags can switch to "all of
  the picked tags".
- Unsorted means a link with no tags and no project. Archived links are hidden from every view except Archive, and
  from search unless I include them.
- One account. Sign-up closes once it exists.
- LinkSink fetches a page's details openly as "LinkSink" and never pretends to be a browser or another bot; a site that
  refuses gets saved with its address as the title, which I can edit.

## Done when

- [ ] I can create the one account with email and password, confirm it from the email, and sign-up is then closed.
- [ ] Pasting a link anywhere in the app on desktop saves it, and it shows in the list in under 100 ms, before its
      details arrive.
- [ ] Title, description, site icon and preview image fill in for ordinary sites and for YouTube and X links; a site
      that blocks LinkSink still saves, showing its address.
- [ ] Source is filled in for every saved link (YouTube for youtube.com and youtu.be links), and a source I rename keeps
      my name for later links from that site.
- [ ] Media is filled in as Video for YouTube and Vimeo links, Repo for GitHub repositories, Post for X and Reddit
      posts, PDF for links to PDF files, Article for pages that declare themselves articles, and Page otherwise.
- [ ] A title, description, source or media I edited stays as I set it after the link's details are fetched again.
- [ ] Pasting an address I already saved (even with tracking bits or a different `www.`) shows the existing link and
      creates no copy.
- [ ] On iPhone, sharing from Safari to "Save to LinkSink" saves the link without opening the app.
- [ ] On Android, the installed app appears in the share sheet and saves the shared link.
- [ ] I can add tags and projects (with colours) to one link or several at once, set an optional status and priority,
      and links with no tags and no project show in Unsorted.
- [ ] I can archive a link, find it in Archive, include archived links in a search, and restore it.
- [ ] Each link shows when it was saved and last edited, and keeps when it was last opened and where it came from.
- [ ] Search finds links by words in their title, address, description, notes, tags or projects, and results update as
      I type (within 150 ms of my last keystroke).
- [ ] Filters combine as described (any within one filter, all across filters, the Tags any/all switch), and the
      view's address reproduces it.
- [ ] `/`, `n`, arrow keys, Enter and Ctrl/Cmd+K work as described on desktop.
- [ ] With the network off, the app opens with all my links, and I can search, save, organise, edit, archive and
      delete; once back online, every change reaches the server and my other devices.
- [ ] A link I delete on one device never comes back from another device, even one that was offline at the time.
- [ ] Signing out removes my links from that device; signing a device out from settings stops it syncing.
- [ ] Importing a browser bookmarks file brings in every link once, with folders as projects and tags as tags.
- [ ] Export downloads a bookmarks HTML file that a browser imports, and a JSON file with every link and everything on
      it.
- [ ] The screens follow the design direction I picked, on a phone-width and a desktop-width screen, light and dark.
- [ ] The first page load sends no more than about 60 KB of compressed JavaScript.
- [ ] It runs on my VPS at my own address over HTTPS; backups go to two places, one of them encrypted before it
      leaves the VPS with a password only I hold, and a restore from each has been rehearsed once.

## Not in this

- The native iOS app (the Shortcut covers phone saving until then), and a browser extension.
- Saving copies of pages, reading view, highlights, or searching the full text of pages.
- Checking for dead links, a duplicate-cleanup screen, AI tagging.
- Accounts for anyone else, sharing links or projects.
- Fields I define myself beyond Status and Priority; editing the lists of Status, Priority or Media values.
- Card or grid view (list view only for now), saved views beyond bookmarking a filtered address.
- The graph view of links, tags and projects (its own one-pager later, after phone capture and the iOS app; the data
  already supports it).

## Open questions for the director

None left: stack (ADR-0002), sync (ADR-0001), import (yes), the fields (2026-10-24) are decided.

## Cost

About 13–16 build sessions across the tasks in `work/plans/P-T-0002.md`, plus one design session with you choosing
the look. Rungs: type check, lint, unit tests, browser tests, and a JavaScript size budget (proposed in the plan).
