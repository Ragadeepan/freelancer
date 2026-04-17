# Growlanzer (Admin-Governed)

Premium, role-based freelancer marketplace UI with Firebase authentication, Firestore, Storage, and strict admin approvals.

## Quick start
1. Copy `.env.example` to `.env` and fill Firebase values.
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`

## Payment API (Express)
1. Copy `backend/.env.example` to `backend/.env` and fill Firebase Admin + gateway keys.
2. Install backend dependencies: `npm --prefix backend install`
3. Run backend: `npm run dev:backend`
4. Set `VITE_API_BASE_URL` in root `.env` (default `http://localhost:4000`).

## Domain Setup (Production)
- Frontend `.env`: set `VITE_API_BASE_URL=https://api.your-domain.com` (or keep empty when frontend and backend share same origin/proxy).
- Backend `.env`: set `FRONTEND_ORIGIN=https://your-domain.com,https://www.your-domain.com`.
- Backend `.env`: set `BACKEND_PUBLIC_URL=https://api.your-domain.com` for correct upload file URLs.

If backend API is not reachable, core marketplace flows (proposal submit/list, select freelancer, project connect/access) automatically fallback to direct Firestore operations.

## Roles & Access
- Users are created with `status="pending"` and require Admin approval.
- Admin accounts are provisioned manually in Firestore with `role="admin"` and `status="approved"`.
- Route guards enforce role + approval before dashboards load.

## Core Routes
Public: `/`, `/login`, `/signup`, `/admin/login`
Client: `/client/dashboard`, `/client/post-job`, `/client/jobs`, `/client/projects`, `/client/payments`
Freelancer: `/freelancer/dashboard`, `/freelancer/jobs`, `/freelancer/proposals`, `/freelancer/projects`
Admin: `/admin`, `/secure-admin/login`, `/secure-admin/dashboard`, `/secure-admin/users`, `/secure-admin/jobs`, `/secure-admin/proposals`, `/secure-admin/projects`, `/secure-admin/payments`, `/secure-admin/disputes`, `/secure-admin/settings`

## Firebase
- Config in `src/firebase/firebase.js`
- Auth + Profile logic in `src/contexts/AuthContext.jsx`
- Firestore services in `src/services/*`
- Project status updates flow through `projectUpdates` collection for admin approval.

## Firestore Schema (Core)
Collections:
- `users/{uid}`: `{ name, email, phone, role, status, createdAt }`
- `jobs/{jobId}`: `{ clientId, title, description, budget, status, createdAt }`
- `proposals/{proposalId}`: `{ jobId, freelancerId, bidAmount, message, status, createdAt }`
- `projects/{projectId}`: `{ jobId, clientId, freelancerId, status, createdAt }`
- `payments/{paymentId}`: `{ projectId, amount, commission, status }`
- `activityLogs/{logId}`: `{ actor, action, targetId, timestamp }`
- `messages/{messageId}`: `{ projectId, senderId, recipientId, body, createdAt }`

Every status change writes an `activityLogs` entry.

## Security Rules
See `firestore.rules` and `storage.rules` for admin-gated access and tenant isolation.


