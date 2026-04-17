# 🚀 Growlanzer – Admin-Controlled Freelancer Marketplace

A full-stack freelancer marketplace platform where **clients and freelancers connect**, with **admin-controlled workflow, secure payments, and project tracking**.

---

## 🌐 Live Website

👉 https://freelancer-99659.web.app/

---

## 📌 Project Overview

Growlanzer is a role-based freelance platform designed to ensure **quality, security, and control** through an admin-managed system.

* Clients post jobs
* Freelancers submit proposals
* Admin approves users and jobs
* Payments handled via escrow model

---

## ✨ Core Features

### 🔐 Authentication & Roles

* Firebase Authentication
* Role-based system (Client / Freelancer / Admin)
* Admin approval required for full access

---

### 👤 Client Features

* Post jobs with budget and details
* View and compare freelancer proposals
* Select best freelancer (Top 3 filtering)
* Track project progress
* Secure payment system

---

### 👨‍💻 Freelancer Features

* Browse available jobs
* Submit proposals with pricing & timeline
* Work on selected projects
* Deliver completed work
* Receive payments after approval

---

### 🛡 Admin Panel

* Approve users (Client & Freelancer)
* Approve job postings
* Monitor proposals and projects
* Manage payments and disputes
* Full system control

---

### 💰 Payment System

* Escrow-based workflow
* Client → Admin → Freelancer
* Commission-based model
* Secure transaction flow

---

## 🛠 Tech Stack

### Frontend

* React (Vite)
* Tailwind CSS

### Backend

* Node.js
* Express.js

### Database & Auth

* Firebase Authentication
* Firestore Database
* Firebase Storage

### Hosting

* Firebase Hosting

---

## ⚙️ Setup Instructions

### 🔹 Frontend

```bash
npm install
npm run dev
```

### 🔹 Backend

```bash
npm --prefix backend install
npm run dev:backend
```

---

## 🔗 API Configuration

Frontend `.env`

```
VITE_API_BASE_URL=http://localhost:4000
```

Production:

```
VITE_API_BASE_URL=https://api.your-domain.com
```

---

## 📂 Project Structure

* `/src` → Frontend
* `/backend` → API
* `/public` → Static assets

---

## 🗄 Firestore Collections

* users
* jobs
* proposals
* projects
* payments
* messages
* activityLogs

---

## 🔒 Security

* Role-based access control
* Admin approval system
* Firestore security rules

---

## 🚀 Future Improvements

* Real-time chat system
* AI-based proposal ranking
* Payment gateway (Razorpay / Stripe)
* Notifications system
* UI/UX enhancements

---

## 👨‍💻 Author

Ragadeepan

---

## 📌 Note

This project demonstrates a complete real-world freelance marketplace architecture with admin-controlled workflow and secure system design.


