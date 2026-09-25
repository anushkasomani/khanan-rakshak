# Khanan Rakshak

A safety app for coal mines. Before each shift the Mining Sirdar inspects their district, and only then can the crew check in with GPS. Workers report hazards and hit SOS. The Overman sees every district on the shift, managers see the whole mine, and DGMS sees every mine. Every important action goes into a tamper-evident audit log.

It's a website that can also be installed on a phone like an app (PWA).

---

## Run it on your laptop

You need Node 18 or newer, and Docker (for the local database).

**1. Database** (Postgres, from the repo root)

```bash
docker compose up -d db     # Postgres on localhost:5433
```

**2. Backend** (`server/`, runs on port 5002)

```bash
cd server
cp .env.example .env        # then fill in the values (ask for them)
npm install
npm run migrate             # creates or updates the tables (prisma migrate dev)
npm run seed                # fills it with demo mines, people, incidents, etc.
npm run dev                 # starts the API; restarts itself when you edit code
```

**3. Frontend** (`client/`, runs on port 5173)

```bash
cd client
cp .env.example .env        # VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Open http://localhost:5173 and sign in with Google.

**Changing the database.** Edit `server/prisma/schema.prisma`, then run `npm run migrate -- --name what-changed` in `server/`. That writes a new migration into `server/prisma/migrations/`; commit it. Deploys apply new migrations automatically before the server starts.

The `.env` values are listed in `server/.env.example` and `client/.env.example`. `.env` files are not in git.

> Running `npm run seed` wipes the database and starts over. Your own account goes too, so just sign in again.

---

## Who uses it

Everyone has exactly one role. This follows the chain of responsibility in the Mines Act 1952 and the Coal Mines Regulations 2017. From lowest to highest:

**Worker → Specialist → Mining Sirdar → Overman → Officer → Assistant manager → Mine manager → Owner / Agent**, plus **DGMS** outside the mine.

A mine is split into **districts** (called sections in opencast mines) and runs three 8-hour **shifts**, A, B and C. Each mine sets when shift A starts (6 AM by default, so A is 6 AM – 2 PM, B 2 PM – 10 PM, C 10 PM – 6 AM).

| Role | Tied to | What they do in the app |
|---|---|---|
| **Worker** | one district, one shift | Check in once their district is cleared, report hazards, SOS, do assigned inspections |
| **Specialist** (blaster, shot-firer, surveyor, magazine in-charge, winding engine operator, electrical supervisor) | the mine | Check in, and submit **field reports** (text, a table, photos, or any mix). Can be supplied by a contractor |
| **Mining Sirdar** | one district, one shift | Check in, do the **pre-shift inspection** (nobody in the district can check in before it), see their crew, mark people present by hand, withdraw workers mid-shift, mark hazards fixed, write the **handover** for the next shift |
| **Overman** | one shift, all districts | Read and sign off every Sirdar's report, see the whole shift on the **Shift board**, confirm fixes or send someone to inspect them, assign inspections |
| **Officer** (safety, ventilation, electrical…) | the whole mine | Hazards and incidents for their discipline, approve inspections, receive escalations |
| **Assistant manager, Mine manager** | the whole mine | What needs attention, every district right now, 8-week trends. They issue and suspend **contracts** |
| **Owner / Agent** | every mine of the company | Every mine the company holds (the mine's "owner company"), riskiest first, and contractor problems across them. Can switch between those mines on every page |
| **DGMS** | every mine | Reads everything, including shift reports and the audit log. Does not sign off reports or handle hazards; the mine's own staff do that |

**Admin** is separate from roles. It's a switch on the account. Admins add mines and their districts, and approve new people. Anyone listed in `ADMIN_EMAILS` becomes an admin automatically.

Everyone except DGMS and admins only sees data for **their own mine**. The server enforces this, not just the screen.

### Governance intelligence

Admins can open **Governance intelligence** to review database-derived mine risk indicators, repeated open hazard groups and inspection activity anomalies. The deterministic analytics are available without an AI key. To generate a narrative, an admin explicitly submits a question; Groq receives that question plus calculated metrics, mine names, finding categories and supporting record IDs. It does not receive worker identities, contact details, operational descriptions, grievances, or raw records. Keep personal details out of the question. The latest 20 successful analyses and their analytics snapshots are stored in SQLite and remain available after reload. Analysis requests are also recorded in the existing audit hash chain with the requester, scope, timestamp and a hash of the question. The API key stays in `server/.env` and is never sent to the browser. `XAI_API_KEY` remains accepted as a migration fallback for existing local configurations, but `GROQ_API_KEY` is the preferred setting.

The inspection anomaly baseline requires at least four inspections overall and two in the prior 30 days; otherwise it is labeled `insufficient_data`. It flags zero inspections in the latest 30 days against that baseline. Recurring hazards are grouped by the exact mine, category and district. Risk score is active SOS ×10 + open high/critical hazards ×3 + overdue actions ×2 + open incidents ×2 + missed inspections ×1 + inspection violations (capped at 5); levels are normal below 4, elevated from 4, and high from 10. Indicator counts and supporting record IDs appear alongside each mine.

### Each role's home screen

The Dashboard page shows a different screen for each role. Each one answers one question.

| Role | The question it answers | What's on it |
|---|---|---|
| **Worker** | "Can I go in, and what do I need to do?" | Whether the Sirdar has cleared my district (and what's fenced off), check in and out, Report hazard, my inspection tasks, recent hazards |
| **Specialist** | "What have I reported, and did anything come back?" | New report button, reports sent back with the reviewer's note, their reports and whether they've been reviewed, check-in |
| **Mining Sirdar** | "Is my district safe, and is my crew here?" | Three numbered steps: check in → pre-shift inspection (with the last shift's handover) → crew with Mark present. Then open hazards in my district |
| **Overman** | "Is every district on my shift OK?" | Live SOS, any district declared unsafe, the district board for my shift (inspected / unread / crew present / open hazards), fixes waiting for a check |
| **Officer** | "What's open in my area?" | Hazards and incidents for their discipline only (a ventilation officer sees gas and ventilation; a safety officer sees everything), inspections they can approve, their check-in |
| **Assistant manager, Mine manager** | "Is my mine OK right now, and which way is it heading?" | **Needs your attention** (unsafe or uninspected districts, SOS, critical incidents, unacknowledged escalations, overdue inspections, contract workers who can't work, contracts about to end), every district on the running shift, six live numbers, eight-week charts |
| **Owner / Agent** | "Which of our mines needs me?" | The company's mines on a map and in a table, riskiest first, live SOS across them, and contractor problems |
| **DGMS** | "Which mine needs me?" | Every mine on a map coloured by risk, live SOS across all mines, a table of mines with the riskiest first |

Anyone who can receive escalations sees an **escalation banner** at the top when something has been escalated to them.

Which areas each officer type sees (set in `server/src/routes/dashboardRoutes.ts`):

| Officer | Hazard categories | Incident types |
|---|---|---|
| Safety, Other | all | all |
| Ventilation | Ventilation, Gas | Methane spike |
| Electrical | Electrical | Electrical short |
| Mechanical | Machinery, Transportation | Equipment jam |
| Survey | Structural, Environmental | Roof fall, Inundation |
| Blasting | Structural | Roof fall |

**Risk level** (used on the manager and DGMS screens) is a simple score anyone can check:

- active SOS: 10 points each
- critical or fatal open incidents: 5 points each
- other open incidents: 2 points each
- overdue inspections: 2 points each
- open high or critical hazards: 1 point each

A score of **10 or more is High**, **4 or more is Elevated**, and anything lower is Normal.

The numbers on these screens come from `GET /api/dashboard/mine/:id` (officer and above, own mine only) and `GET /api/dashboard/overview` (DGMS and admin only). They refresh every minute.

---

## How the main parts work

### Signing up
1. A person signs in with Google.
2. They fill a short form: name, phone, role, mine, and their trade or officer type. Workers and Sirdars also pick their district and shift; an Overman picks their shift.
3. Their account waits as `PENDING` until an admin approves it on the **People** page.
4. Admins can also add people directly, and those accounts are approved straight away.

There's no separate "requests" table. It's the `status` field on the User (`NEW` → `PENDING` → `APPROVED` or `REJECTED`).

### Mines and districts
An admin adds a mine by dropping a pin on a map and setting a radius (for example 1.2 km). That circle is the check-in area. The same form lists the mine's **districts**, each with a name and where it is (seam, side, depth). A district that still has people or records attached can't be deleted.

### A shift, step by step
1. The **Sirdar** checks in, walks the district and submits the **pre-shift inspection**: gas, roof and sides, ventilation, machines and cables, the highest methane reading, and a verdict: *safe*, *safe with restrictions* (and what's fenced off), or *unsafe*. They see the previous shift's handover first.
2. The crew is notified. **Workers of that district and shift can check in only after this**, and never while the district is marked unsafe.
3. The **Overman** reads every district's report on the Shift board and marks it read, optionally with an instruction for the Sirdar.
4. If something goes wrong mid-shift, the Sirdar (or anyone above) marks the district **unsafe**. The crew gets a "leave now" alert and nobody else can check in. After re-inspecting, they clear it again. Both changes are kept on the report.
5. At the end of the shift the Sirdar writes a **handover** for the next shift's Sirdar.

Shift reports are in `server/src/routes/shiftRoutes.ts`. A shift belongs to the day it starts, so a night shift's check-out the next morning still counts towards that day. Arriving up to 4 hours early or leaving up to 4 hours late still counts towards the shift (`server/src/shifts.ts`).

### Contractors
Much of the work at a mine is done by contractors: overburden removal, transport, support work, or a whole mine run by an MDO. The owner and manager are still responsible for the safety of everyone working under a contract, so the app treats contract workers the same way and adds two checks.

- The assistant manager, mine manager or owner issues a **contract** on the **Contracts** page: the contractor, what the work is, the type of work, where, from and to, and the work order or LoA number.
- When someone registers, or an admin adds them, **Employed by** says whether they're the mine's own staff or work under a contract. The form also records the date their **vocational training certificate** runs out.
- A contract worker **can't check in** if the contract is suspended, ended or outside its dates, or if their training certificate has expired or isn't on record. They see why on their home screen.
- Suspending a contract tells its workers to stop. Contracts, their status changes and who issued them go into the audit log.
- The Contracts page shows each contractor's workers, who is on site, whose training has expired or runs out within 30 days, and incidents that involved them. An incident can name the contractor involved.

Contracts are in `server/src/routes/contractRoutes.ts`; the check-in rule is `employmentProblem` in `server/src/routes/attendanceRoutes.ts`.

### Field reports (blast reports, surveys…)
Specialists, and anyone else at the mine above a worker, write technical reports on the **Field reports** page. A report can have notes, a table and up to 6 photos, in any mix. A photo of the paper form works too. Tables can start from a template (the **opencast blast report** form, an **explosives account** of issued / used / returned, a readings table, or blank), and rows and columns can be added, removed and renamed.

The Overman on shift, the managers and the matching officer (blasting officer for blast and magazine reports, survey officer for surveys) are notified. The Overman or anyone above marks it **reviewed**, or **sends it back** with a note; the author edits and resubmits. Every version goes into the audit log. DGMS can read them. Code: `server/src/routes/fieldReportRoutes.ts`, `client/src/components/reports/`.

### Hazards: report → fix → check
1. Anyone reports a hazard, tagged with a district (their own by default). The district's Sirdar, the Overman on shift and the officers are notified.
2. A Sirdar or above takes it on, then marks it **fixed** with a note of what was done.
3. **Someone above the person who fixed it** checks it: they confirm the fix, send it back, or **send someone to inspect it**. That creates an inspection linked to the hazard, and approving the inspection closes the hazard.

### Attendance
- The worker taps **Check in**. The phone sends its GPS position and the server checks it's inside the mine's circle.
- Weak GPS (worse than ±200 m) is rejected.
- No signal? The check-in is saved on the phone and uploaded later. It gets marked "uploaded later".
- A worker can't check in until their Sirdar has cleared the district for the shift (see above).
- A Sirdar or above can **mark someone present by hand** (for example, their phone died), with a reason. It's clearly labelled as manual, only works for people below them, and can be undone during the same shift.
- Each check-in is filed under the date of the shift it belongs to (India time).

### SOS and escalation
- Anyone can press **SOS**. The Sirdars, Overman, officers, assistant manager and mine manager at that mine get notified.
- A Sirdar (or higher) can **escalate** an incident or SOS to any level above them. The app shows exactly who will be notified, with **Call** and **SMS** buttons for each person.
- The person receiving it presses **Acknowledge**, and the sender is told.
- For severe cases the server tries an **automatic voice call**. No phone provider is connected yet, so for now it tells you to call manually. To add one, edit `server/src/services/voiceAlerts.ts`.

### Inspections
1. The Overman or anyone above (or an admin) assigns an inspection to a person, with a due date. Inspections are also created from a hazard to check its fix.
2. That person marks it **Done** (needs at least one photo) or **Not done** (needs a reason). The phone's location is attached if available.
3. Anyone above them at that mine approves it or sends it back. One approval is enough.

Photos are shrunk on the phone, then saved in `server/uploads/`.

### Audit log
Important actions (reports, SOS, escalations, inspections…) are written into a chain where each entry holds a hash of the one before it. If someone edits an old record in the database, the chain breaks and the **Audit log** page shows it.

---

## Where things live

```
client/                 React + Vite + Tailwind frontend
  src/pages/            one file per screen
  src/pages/RoleDashboards.tsx  picks the home screen for each role
  src/pages/ShiftDashboards.tsx the Sirdar and Overman home screens
  src/components/shift/ pre-shift form, report view, district board
  src/components/       shared pieces (navbar, check-in card, modals…)
  src/navigation.ts     menu items and which roles can see them
  src/roles.ts          role order and labels
  src/services/api.ts   every call to the backend

server/                 Express + Prisma backend
  prisma/schema.prisma  all database tables
  prisma/seed.ts        demo data
  src/index.ts          starts the server, mounts all routes
  src/routes/           one file per feature (attendance, sos, inspections…)
  src/routes/dashboardRoutes.ts  numbers for the role home screens and the risk score
  src/routes/shiftRoutes.ts     pre-shift inspections, handover, the shift board
  src/routes/contractRoutes.ts  contractors and contracts
  src/routes/fieldReportRoutes.ts  specialists' reports and their review
  src/shifts.ts                 shift times and which date a shift belongs to
  src/middleware/auth.ts  login check, role checks, "own mine only" rules
  src/services/         audit chain, photo storage, voice calls
```

**Data storage:**
- **Database:** Postgres. Locally it runs in Docker (`docker-compose.yml`); in production it's whatever `DATABASE_URL` points to.
- **Photos:** stored in the database (the `Photo` table) and served at `/api/uploads/<id>`, so they survive redeploys.
- To browse the database, run `npx prisma studio` in `server/`.

---

## Common problems

**"Request failed (404)" or a feature seems missing.** Your backend is running old code. Stop it (Ctrl+C) and run `npm run dev` again.

**"The database is busy" or can't connect.** Postgres isn't running. Run `docker compose up -d db` from the repo root, and check `DATABASE_URL` in `server/.env`.

**Check-in on a phone does nothing.** Phones only allow GPS on `https`. Opening your laptop's IP over Wi-Fi won't work. Use a tunnel such as `npx cloudflared tunnel --url http://localhost:5173`, and add that URL to the Google client's allowed origins, or sign-in fails.

**"You are X km from the mine."** You're outside the circle. Move the mine's pin in **Admin → Mines**, or set `ATTENDANCE_RADIUS_OVERRIDE_M` while testing.

---

## Deploy

- **Web app → Vercel** (`client/`). `client/vercel.json` forwards every `/api/...` request to the API, so the browser only ever talks to the Vercel site.
- **API + Postgres → Render** (`render.yaml`). The API applies new database migrations each time it starts.

See the step-by-step list below. Alternatives: `Dockerfile` builds one image with both, and the root `package.json` builds both into one Node service.

| Where | Variable | Value |
|---|---|---|
| Render | `GOOGLE_CLIENT_ID` | the Google OAuth client ID |
| Render | `ADMIN_EMAILS` | Gmail addresses that become admin on first sign-in |
| Render | `DATABASE_URL`, `JWT_SECRET` | filled in by Render |
| Render | `GROQ_API_KEY` | optional |
| Vercel | `VITE_GOOGLE_CLIENT_ID` | the same Google OAuth client ID |

If the Render service ends up with a different URL than `https://khanan-rakshak-api.onrender.com`, change it in `client/vercel.json` and push.

## Demo accounts

`npm run seed` creates these (password `password123`, through `POST /api/auth/login`). The app itself signs in with Google, so to use them in the browser, log in through the API and put the token in `localStorage` under `minesafe_token`.

| Email | Who |
|---|---|
| `worker@minesafe.gov` | Ramesh Kumar, worker, District 1, Shift A |
| `arjun.operator@minesafe.gov` | Arjun Mahto, worker, District 2, Shift A (District 2 isn't cleared yet, so he can't check in) |
| `sirdar@minesafe.gov` | Mohan Das, Sirdar, District 1, Shift A (inspected, gallery 14 fenced off) |
| `suresh.sirdar@minesafe.gov` | Suresh Mahato, Sirdar, District 2, Shift A (hasn't inspected yet) |
| `overman@minesafe.gov` | Meena Kumari, Overman, Shift A |
| `safety@minesafe.gov` | Priya Sharma, safety officer |
| `asst.manager@minesafe.gov`, `manager@minesafe.gov` | Assistant manager, mine manager |
| `salim.contract@minesafe.gov` | Contract worker (Kumar Constructions), training valid |
| `dinesh.contract@minesafe.gov` | Contract worker, training expired, so he can't check in |
| `blaster@minesafe.gov` | Bijay Kumar, blaster at Singrauli (Singh Earthmovers contract), with the blast report from the paper form |
| `singrauli.manager@minesafe.gov` | Singrauli mine manager, who reviews it |
| `shotfirer@minesafe.gov` | Nitesh Rawani, shot-firer at Dhanbad |
| `owner@minesafe.gov` | Owner / Agent for Bharat Coking Coal (sees Dhanbad and Jharia) |
| `dgms@minesafe.gov` | DGMS inspector |
| `admin@minesafe.gov` | Admin |

## Not finished yet

- **Shifts are always three 8-hour shifts.** A mine can move when they start, but not run two 12-hour shifts (for example 7 AM – 7 PM and 7 PM – 7 AM), which some opencast mines and contractor crews use.
- **Contractor login:** contractors don't have their own accounts yet; the mine office enrols their workers and keeps their training dates up to date.
- **Contract billing** (measuring work done, bills, penalties) is not in the app. It covers the safety side of contracts.

- **Automatic voice calls:** the code path exists, but no phone provider is connected.
- **Health monitoring page:** a static mock-up with no real data.
- **Some compliance numbers:** the monthly trend and average response time are placeholder values.
- **Fake-GPS apps can fool check-in.** Proper protection needs a native app.
- **Photos are stored in the database.** Fine for a demo; for real use, move them to object storage (only `server/src/services/photoStorage.ts` changes).
